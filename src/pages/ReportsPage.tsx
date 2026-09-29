import { useCallback, useEffect, useMemo, useState } from 'react';
import { useConfig, useUI } from '../store';
import {
  appointmentRepository,
  consentRepository,
  evolutionRepository,
  patientRepository,
  professionalRepository,
  serviceRepository,
} from '../repositories';
import { ModalPortal } from '../components/ui';
import {
  EMPTY_CONFIG,
  formatDateTime,
  printAttendanceReport,
  printConsent,
  printConsentReport,
  printEvolution,
  printProntuario,
  type AttendanceRow,
  type PrintContext,
} from '../services/PrintService';
import type {
  Appointment,
  Consent,
  Evolution,
  Patient,
  Professional,
  Service,
} from '../domain/types';

type PickerKind = 'patient' | 'evolution' | 'consent' | null;

interface PickerItem {
  id: string;
  title: string;
  subtitle: string;
}

export function ReportsPage() {
  const { config } = useConfig();
  const { addToast } = useUI();

  const [patients, setPatients] = useState<Patient[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [evolutions, setEvolutions] = useState<Evolution[]>([]);
  const [consents, setConsents] = useState<Consent[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [picker, setPicker] = useState<PickerKind>(null);

  const load = useCallback(async () => {
    try {
      const [p, s, pro, evo, con, appt] = await Promise.all([
        patientRepository.findAll({ orderBy: 'name', orderDir: 'asc' }),
        serviceRepository.findAll({ orderBy: 'name', orderDir: 'asc' }),
        professionalRepository.findAll({ orderBy: 'name', orderDir: 'asc' }),
        evolutionRepository.findAll({ orderBy: 'date', orderDir: 'desc' }),
        consentRepository.findAll({ orderBy: 'signedAt', orderDir: 'desc' }),
        appointmentRepository.findAll({ orderBy: 'start', orderDir: 'asc' }),
      ]);
      setPatients(p);
      setServices(s);
      setProfessionals(pro);
      setEvolutions(evo);
      setConsents(con);
      setAppointments(appt);
    } catch {
      addToast({ type: 'error', message: 'Erro ao carregar dados dos relatórios' });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const ctx: PrintContext = useMemo(
    () => ({
      config: config ?? EMPTY_CONFIG,
      services,
      professionals,
      patients,
    }),
    [config, services, professionals, patients]
  );

  const serviceName = useCallback(
    (id: string) => services.find((s) => s.id === id)?.name || '-',
    [services]
  );

  const latestUpdate = evolutions[0]
    ? formatDateTime(evolutions[0].updatedAt || evolutions[0].date)
    : '-';

  const attendanceRows: AttendanceRow[] = useMemo(
    () =>
      evolutions.map((evo) => {
        const paciente = patients.find((p) => p.id === evo.patientId);
        const profissional = professionals.find((p) => p.id === evo.professionalId);
        return {
          paciente: paciente?.name || '-',
          servico: paciente ? serviceName(paciente.serviceId) : '-',
          data: formatDateTime(evo.date),
          profissional: profissional?.name || '-',
          titulo: evo.title || '-',
        };
      }),
    [evolutions, patients, professionals, serviceName]
  );

  function gerarRelatorioAtendimentos() {
    if (!evolutions.length) {
      addToast({ type: 'warning', message: 'Nenhuma evolução registrada para gerar o relatório.' });
      return;
    }
    printAttendanceReport(attendanceRows, ctx);
  }

  function gerarRelatorioLgpd() {
    printConsentReport(consents, patients, ctx);
  }

  const pickerItems: PickerItem[] = useMemo(() => {
    if (picker === 'patient') {
      return patients.map((p) => ({ id: p.id, title: p.name, subtitle: serviceName(p.serviceId) }));
    }
    if (picker === 'evolution') {
      return evolutions.map((e) => ({
        id: e.id,
        title: e.title || 'Evolução',
        subtitle: patients.find((p) => p.id === e.patientId)?.name || '-',
      }));
    }
    if (picker === 'consent') {
      return consents.map((c) => ({
        id: c.id,
        title: patients.find((p) => p.id === c.patientId)?.name || 'Termo',
        subtitle: `${c.type === 'data' ? 'Dados' : 'Tratamento'} · ${c.status}`,
      }));
    }
    return [];
  }, [picker, patients, evolutions, consents, serviceName]);

  function abrirPicker(kind: PickerKind) {
    if (kind === 'patient' && !patients.length) {
      addToast({ type: 'warning', message: 'Nenhum paciente cadastrado.' });
      return;
    }
    if (kind === 'evolution' && !evolutions.length) {
      addToast({ type: 'warning', message: 'Nenhuma evolução registrada.' });
      return;
    }
    if (kind === 'consent' && !consents.length) {
      addToast({ type: 'warning', message: 'Nenhum termo de consentimento registrado.' });
      return;
    }
    setPicker(kind);
  }

  function escolher(id: string) {
    if (picker === 'patient') {
      const paciente = patients.find((p) => p.id === id);
      if (paciente) {
        printProntuario(
          paciente,
          evolutions.filter((e) => e.patientId === paciente.id),
          ctx
        );
      }
    } else if (picker === 'evolution') {
      const evo = evolutions.find((e) => e.id === id);
      const paciente = evo && patients.find((p) => p.id === evo.patientId);
      if (evo && paciente) printEvolution(evo, paciente, ctx);
    } else if (picker === 'consent') {
      const consent = consents.find((c) => c.id === id);
      const paciente = consent && patients.find((p) => p.id === consent.patientId);
      if (consent && paciente) printConsent(consent, paciente, ctx);
    }
    setPicker(null);
  }

  if (loading) return <div className="empty">Carregando relatórios...</div>;

  const pickerTitle =
    picker === 'patient' ? 'Escolher paciente' : picker === 'evolution' ? 'Escolher registro' : 'Escolher termo';

  return (
    <div className="grid-2">
      <div className="card">
        <div className="card-head">
          <h3>Documentos disponíveis</h3>
        </div>
        <div className="card-body stack">
          <div className="row-between">
            <div>
              <strong>Prontuário completo</strong>
              <div className="small muted">Todos os registros de um paciente em um único PDF</div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => abrirPicker('patient')}>
              Escolher paciente
            </button>
          </div>
          <hr className="rule" />

          <div className="row-between">
            <div>
              <strong>Registro de evolução</strong>
              <div className="small muted">Uma sessão específica, com cabeçalho e assinatura</div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => abrirPicker('evolution')}>
              Escolher registro
            </button>
          </div>
          <hr className="rule" />

          <div className="row-between">
            <div>
              <strong>Relatório de atendimentos</strong>
              <div className="small muted">Planilha com todas as evoluções do período</div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={gerarRelatorioAtendimentos}>
              Gerar PDF
            </button>
          </div>
          <hr className="rule" />

          <div className="row-between">
            <div>
              <strong>Controle de termos LGPD</strong>
              <div className="small muted">Situação de cada termo e das pendências</div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={gerarRelatorioLgpd}>
              Gerar PDF
            </button>
          </div>
          <hr className="rule" />

          <div className="row-between">
            <div>
              <strong>Termo de consentimento</strong>
              <div className="small muted">Documento assinado de um paciente específico</div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => abrirPicker('consent')}>
              Escolher termo
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Resumo</h3>
        </div>
        <div className="card-body stack small">
          <div className="row-between">
            <span className="muted">Pacientes cadastrados</span>
            <strong>{patients.length}</strong>
          </div>
          <div className="row-between">
            <span className="muted">Evoluções registradas</span>
            <strong>{evolutions.length}</strong>
          </div>
          <div className="row-between">
            <span className="muted">Termos LGPD vigentes</span>
            <strong>{consents.filter((c) => c.status === 'active').length}</strong>
          </div>
          <div className="row-between">
            <span className="muted">Sessões agendadas</span>
            <strong>{appointments.length}</strong>
          </div>
          <div className="row-between">
            <span className="muted">Última atualização</span>
            <strong>{latestUpdate}</strong>
          </div>
          <div className="small muted">
            O PDF é gerado pelo próprio navegador (Imprimir &gt; Salvar como PDF), sem custo de
            licença.
          </div>
        </div>
      </div>

      <ModalPortal
        isOpen={picker !== null}
        onClose={() => setPicker(null)}
        title={pickerTitle}
        size="sm"
      >
        <div className="stack">
          {pickerItems.length ? (
            pickerItems.map((item) => (
              <button
                key={item.id}
                className="btn btn-secondary btn-block picker-btn"
                onClick={() => escolher(item.id)}
              >
                <span>{item.title}</span>
                <span className="small muted">{item.subtitle}</span>
              </button>
            ))
          ) : (
            <div className="empty">Nada disponível para gerar.</div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={() => setPicker(null)}>
            Cancelar
          </button>
        </div>
      </ModalPortal>
    </div>
  );
}
