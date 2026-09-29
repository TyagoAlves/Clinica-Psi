import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  appointmentRepository,
  consentRepository,
  patientRepository,
  professionalRepository,
  serviceRepository,
} from '../../repositories';
import { useAuth, useConfig, useUI } from '../../store';
import {
  buildConsentVars,
  CONSENT_TYPE_LABEL,
  renderConsentText,
} from '../../services/ConsentService';
import type {
  Appointment,
  AppointmentStatus,
  Consent,
  Patient,
  PatientStatus,
  Professional,
  Service,
  ServiceColor,
  UUID,
} from '../../domain/types';

const COLORS: { value: ServiceColor; label: string }[] = [
  { value: 'primary', label: 'Primária' },
  { value: 'success', label: 'Sucesso' },
  { value: 'warning', label: 'Atenção' },
  { value: 'danger', label: 'Crítico' },
];

function isoToday(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

const PATIENT_STATUS: { value: PatientStatus; label: string }[] = [
  { value: 'active', label: 'Em tratamento' },
  { value: 'paused', label: 'Pausado' },
  { value: 'discharged', label: 'Alta' },
  { value: 'inactive', label: 'Inativo' },
];

function PatientForm({
  patient,
  onDone,
  onSaved,
}: {
  patient?: Patient;
  onDone: () => void;
  onSaved?: () => void;
}) {
  const navigate = useNavigate();
  const { addToast } = useUI();
  const { professional: me, isAdmin } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [responsaveis, setResponsaveis] = useState<Professional[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    serviceRepository
      .findActive()
      .then(setServices)
      .catch((e) => console.error('Failed to load services:', e));
  }, []);

  // so quem administra pode transferir a responsabilidade de um paciente
  useEffect(() => {
    if (!isAdmin) return;
    professionalRepository
      .findAll({ orderBy: 'name', orderDir: 'asc' })
      .then(setResponsaveis)
      .catch((e) => console.error('Failed to load professionals:', e));
  }, [isAdmin]);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    const form = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;

    const name = form.name.trim();
    if (!name) {
      setFormError('Informe o nome do paciente.');
      setSaving(false);
      return;
    }

    // UUID e um tipo marcado; o valor vem do <select> como string.
    const escolhido = (form.professionalId || '').trim() as UUID | '';
    const responsavel: UUID | undefined = isAdmin
      ? escolhido || patient?.professionalId
      : patient
        ? patient.professionalId
        : me?.id;

    const payload = {
      name,
      phone: form.phone.trim(),
      email: form.email.trim(),
      birthDate: form.birthDate,
      document: form.document.trim(),
      responsible: form.responsible.trim(),
      address: form.address.trim(),
      serviceId: form.serviceId as Patient['serviceId'],
      status: (form.status || 'active') as PatientStatus,
      startDate: form.startDate || isoToday(),
      description: form.description.trim(),
      // `undefined` limpa o campo no repositorio (o update faz spread), que e o
      // que a opcao "sem responsavel" precisa fazer.
      professionalId: isAdmin ? responsavel : (patient ? patient.professionalId : me?.id),
    };

    try {
      if (patient) {
        await patientRepository.update(patient.id, payload);
        addToast({ type: 'success', message: `Cadastro de ${name} atualizado` });
        onSaved?.();
        onDone();
      } else {
        const created = await patientRepository.create(payload);
        addToast({ type: 'success', message: `Paciente ${created.name} cadastrado com sucesso` });
        onSaved?.();
        onDone();
        navigate(`/patients/${created.id}`);
      }
    } catch (err) {
      console.error('Failed to save patient:', err);
      setFormError(patient ? 'Erro ao salvar o cadastro.' : 'Erro ao cadastrar paciente');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form id="patient-form" onSubmit={submit}>
      <div className="form-field">
        <label className="form-label" htmlFor="np-name">
          Nome completo *
        </label>
        <input className="form-input" id="np-name" name="name" type="text" required autoFocus defaultValue={patient?.name || ''} />
      </div>

      <div className="form-row">
        <div className="form-field">
          <label className="form-label" htmlFor="np-phone">
            Telefone *
          </label>
          <input className="form-input" id="np-phone" name="phone" type="tel" required defaultValue={patient?.phone || ''} />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="np-email">
            E-mail
          </label>
          <input className="form-input" id="np-email" name="email" type="email" defaultValue={patient?.email || ''} />
        </div>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label className="form-label" htmlFor="np-birth">
            Nascimento
          </label>
          <input className="form-input" id="np-birth" name="birthDate" type="date" defaultValue={patient?.birthDate || ''} />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="np-document">
            Documento
          </label>
          <input className="form-input" id="np-document" name="document" type="text" defaultValue={patient?.document || ''} />
        </div>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label className="form-label" htmlFor="np-service">
            Serviço *
          </label>
          <select className="form-select" id="np-service" name="serviceId" required defaultValue={patient?.serviceId || services[0]?.id || ''}>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="np-start">
            Início do tratamento
          </label>
          <input className="form-input" id="np-start" name="startDate" type="date" defaultValue={patient?.startDate || isoToday()} />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="np-status">
            Situação
          </label>
          <select className="form-select" id="np-status" name="status" defaultValue={patient?.status || 'active'}>
            {PATIENT_STATUS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        {isAdmin && (
          <div className="form-field">
            <label className="form-label" htmlFor="np-profissional">
              Profissional responsável
            </label>
            <select
              className="form-select"
              id="np-profissional"
              name="professionalId"
              defaultValue={patient?.professionalId || me?.id || ''}
            >
              <option value="">Sem responsável definido</option>
              {responsaveis.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="form-field">
        <label className="form-label" htmlFor="np-address">
          Endereço
        </label>
        <input className="form-input" id="np-address" name="address" type="text" defaultValue={patient?.address || ''} />
      </div>

      <div className="form-field">
        <label className="form-label" htmlFor="np-responsible">
          Responsável
        </label>
        <input className="form-input" id="np-responsible" name="responsible" type="text" defaultValue={patient?.responsible || ''} />
      </div>

      <div className="form-field">
        <label className="form-label" htmlFor="np-description">
          Descrição / queixa principal
        </label>
        <textarea className="form-textarea" id="np-description" name="description" rows={3} defaultValue={patient?.description || ''} />
      </div>

      {formError && <div className="form-error">{formError}</div>}

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Salvando…' : patient ? 'Salvar alterações' : 'Cadastrar paciente'}
        </button>
      </div>
    </form>
  );
}

function ServiceForm({
  service,
  onDone,
  onSaved,
}: {
  service?: Service;
  onDone: () => void;
  onSaved?: () => void;
}) {
  const { addToast } = useUI();
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const form = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const now = new Date().toISOString();
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      durationMin: Number(form.durationMin) || 50,
      color: (form.color || 'primary') as ServiceColor,
      active: form.active === 'on',
      createdAt: now,
      updatedAt: now,
    };
    try {
      if (service) {
        await serviceRepository.update(service.id, payload);
        addToast({ type: 'success', message: `Serviço ${payload.name} atualizado com sucesso` });
      } else {
        await serviceRepository.create(payload);
        addToast({ type: 'success', message: `Serviço ${payload.name} criado com sucesso` });
      }
      onSaved?.();
      onDone();
    } catch (err) {
      console.error('Failed to save service:', err);
      addToast({ type: 'error', message: 'Erro ao salvar serviço' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <div className="form-field">
        <label className="form-label" htmlFor="sv-name">
          Nome do serviço *
        </label>
        <input
          className="form-input"
          id="sv-name"
          name="name"
          type="text"
          required
          autoFocus
          defaultValue={service?.name || ''}
        />
      </div>

      <div className="form-field">
        <label className="form-label" htmlFor="sv-description">
          Descrição
        </label>
        <input
          className="form-input"
          id="sv-description"
          name="description"
          type="text"
          defaultValue={service?.description || ''}
        />
      </div>

      <div className="form-row">
        <div className="form-field">
          <label className="form-label" htmlFor="sv-duration">
            Duração (minutos) *
          </label>
          <input
            className="form-input"
            id="sv-duration"
            name="durationMin"
            type="number"
            min={5}
            max={240}
            step={5}
            required
            defaultValue={service?.durationMin ?? 50}
          />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="sv-color">
            Cor
          </label>
          <select className="form-select" id="sv-color" name="color" defaultValue={service?.color || 'primary'}>
            {COLORS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {service && (
        <div className="form-field">
          <label className="form-check" htmlFor="sv-active">
            <input id="sv-active" name="active" type="checkbox" defaultChecked={service.active} />
            Serviço ativo
          </label>
        </div>
      )}

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Salvando…' : service ? 'Salvar alterações' : 'Criar serviço'}
        </button>
      </div>
    </form>
  );
}

const APPOINTMENT_STATUS: { value: AppointmentStatus; label: string }[] = [
  { value: 'scheduled', label: 'Agendado' },
  { value: 'confirmed', label: 'Confirmado' },
  { value: 'completed', label: 'Realizado' },
  { value: 'no-show', label: 'Faltou' },
  { value: 'cancelled', label: 'Cancelado' },
];

/** 'YYYY-MM-DDTHH:mm' no fuso local, para <input type="datetime-local">. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function AppointmentForm({
  appointment,
  date,
  patientId,
  onDone,
  onSaved,
}: {
  appointment?: Appointment;
  date?: string;
  patientId?: string;
  onDone: () => void;
  onSaved?: (saved: Appointment) => void;
}) {
  const { addToast } = useUI();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    Promise.all([
      patientRepository.findAll({ orderBy: 'name', orderDir: 'asc' }),
      serviceRepository.findActive(),
      professionalRepository.findActive(),
    ])
      .then(([p, s, pro]) => {
        setPatients(p);
        setServices(s);
        setProfessionals(pro);
      })
      .catch((e) => console.error('Failed to load appointment data:', e));
  }, []);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');

    const form = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const inicio = form.start ? new Date(form.start) : null;
    if (!inicio || Number.isNaN(inicio.getTime())) {
      setFormError('Data e hora inválidas.');
      setSaving(false);
      return;
    }

    try {
      const r = await appointmentRepository.saveWithConflictCheck({
        id: appointment?.id,
        patientId: form.patientId as Appointment['patientId'],
        serviceId: form.serviceId as Appointment['serviceId'],
        professionalId: form.professionalId as Appointment['professionalId'],
        start: inicio.toISOString(),
        durationMin: Number(form.durationMin) || 50,
        status: (form.status || 'scheduled') as AppointmentStatus,
        notes: form.notes,
      });

      if (!r.ok || !r.appointment) {
        setFormError(r.error || 'Não foi possível salvar o agendamento.');
        return;
      }

      addToast({
        type: 'success',
        message: appointment ? 'Agendamento atualizado.' : 'Sessão agendada.',
      });
      onSaved?.(r.appointment);
      onDone();
    } catch (err) {
      console.error('Failed to save appointment:', err);
      setFormError('Erro ao salvar o agendamento.');
    } finally {
      setSaving(false);
    }
  };

  const duracao = (id: string) => services.find((s) => s.id === id)?.durationMin || 50;
  const inicioPadrao = appointment?.start
    ? toLocalInput(appointment.start)
    : `${date || isoToday()}T14:00`;

  return (
    <form onSubmit={submit}>
      <div className="form-field">
        <label className="form-label" htmlFor="ag-patient">
          Paciente *
        </label>
        <select
          className="form-select"
          id="ag-patient"
          name="patientId"
          required
          autoFocus
          defaultValue={String(appointment?.patientId || patientId || patients[0]?.id || '')}
        >
          {patients.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label className="form-label" htmlFor="ag-service">
            Serviço *
          </label>
          <select
            className="form-select"
            id="ag-service"
            name="serviceId"
            required
            defaultValue={String(appointment?.serviceId || services[0]?.id || '')}
            onChange={(e) => {
              const campo = e.currentTarget.form?.elements.namedItem('durationMin') as
                | HTMLInputElement
                | null;
              if (campo) campo.value = String(duracao(e.currentTarget.value));
            }}
          >
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="ag-professional">
            Profissional *
          </label>
          <select
            className="form-select"
            id="ag-professional"
            name="professionalId"
            required
            defaultValue={String(appointment?.professionalId || patientId || professionals[0]?.id || '')}
          >
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-row-3">
        <div className="form-field">
          <label className="form-label" htmlFor="ag-start">
            Data e hora *
          </label>
          <input
            className="form-input"
            id="ag-start"
            name="start"
            type="datetime-local"
            required
            defaultValue={inicioPadrao}
          />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="ag-duration">
            Duração (min)
          </label>
          <input
            className="form-input"
            id="ag-duration"
            name="durationMin"
            type="number"
            min={10}
            max={240}
            step={5}
            defaultValue={appointment?.durationMin ?? 50}
          />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="ag-status">
            Situação
          </label>
          <select
            className="form-select"
            id="ag-status"
            name="status"
            defaultValue={appointment?.status || 'scheduled'}
          >
            {APPOINTMENT_STATUS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-field">
        <label className="form-label" htmlFor="ag-notes">
          Observações
        </label>
        <textarea
          className="form-textarea"
          id="ag-notes"
          name="notes"
          rows={2}
          placeholder="Ex.: revisar o diário de pensamentos."
          defaultValue={appointment?.notes || ''}
        />
      </div>

      {formError && <div className="form-error">{formError}</div>}
      <p className="small muted">
        O sistema avisa se o profissional já tiver outra sessão no mesmo horário.
      </p>

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Salvando…' : appointment ? 'Salvar alterações' : 'Agendar sessão'}
        </button>
      </div>
    </form>
  );
}

const RELATIONSHIP: { value: 'holder' | 'guardian'; label: string }[] = [
  { value: 'holder', label: 'Titular dos dados' },
  { value: 'guardian', label: 'Responsável legal' },
];

/** 'YYYY-MM-DDTHH:mm' no fuso local, para <input type="datetime-local">. */
function toLocalDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function ConsentForm({
  patientId,
  onDone,
  onSaved,
}: {
  patientId?: string;
  onDone: () => void;
  onSaved?: () => void;
}) {
  const { addToast } = useUI();
  const { config } = useConfig();
  const { professional } = useAuth();

  const [patients, setPatients] = useState<Patient[]>([]);
  const [vigente, setVigente] = useState<Consent | null>(null);
  const [tipo, setTipo] = useState<'treatment' | 'data'>('treatment');
  const [relationship, setRelationship] = useState<'holder' | 'guardian'>('holder');
  const [substituir, setSubstituir] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // texto congelado do termo: editavel na tela, lido no submit
  const editorRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const modelos = config?.consent.models;

  useEffect(() => {
    patientRepository
      .findAll({ orderBy: 'name', orderDir: 'asc' })
      .then(setPatients)
      .catch((e) => console.error('Failed to load patients:', e));
  }, []);

  const pacienteAtual = patients.find((p) => p.id === (patientId || patients[0]?.id));

  const gerarTexto = useCallback(
    (paciente: Patient | undefined, signedBy: string, doc: string, tipoAlvo?: 'treatment' | 'data') => {
      const model = modelos?.[tipoAlvo ?? tipo];
      const el = editorRef.current;
      if (!model || !el || !config) return;
      el.innerHTML = renderConsentText(
        model,
        buildConsentVars(paciente, config, professional || undefined, signedBy)
      );
      if (!doc) {
        const campo = formRef.current?.elements.namedItem('document') as HTMLInputElement | null;
        if (campo) campo.value = paciente?.document || '';
      }
    },
    [modelos, tipo, config, professional]
  );

  // texto inicial assim que paciente e config carregarem
  useEffect(() => {
    if (!pacienteAtual || !modelos || !config) return;
    const signedBy = pacienteAtual.responsible || pacienteAtual.name;
    const inicialSignedBy = (formRef.current?.elements.namedItem('signedBy') as HTMLInputElement)
      ?.value;
    gerarTexto(pacienteAtual, inicialSignedBy || signedBy, pacienteAtual.document);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pacienteAtual?.id, config?.consent.version]);

  // quem tem termo vigente deste tipo -> oferecer substituicao
  useEffect(() => {
    if (!patientId) return;
    let cancelado = false;
    consentRepository
      .findVigent(patientId, tipo)
      .then((c) => {
        if (!cancelado) setVigente(c);
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [patientId, tipo]);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');

    const form = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const alvo = form.patientId;
    const model = modelos?.[tipo];

    try {
      const r = await consentRepository.saveWithChecks(
        {
          patientId: alvo,
          type: tipo,
          signedBy: form.signedBy,
          relationship,
          document: form.document,
          signedAt: form.signedAt,
          version: model?.version || '1.0',
          registeredBy: professional?.id || '',
          text: editorRef.current?.innerHTML || '',
        },
        substituir
      );

      if (!r.ok) {
        setFormError(r.error || 'Não foi possível registrar o termo.');
        return;
      }

      addToast({ type: 'success', message: 'Termo registrado.' });
      onSaved?.();
      onDone();
    } catch (err) {
      console.error('Failed to save consent:', err);
      setFormError('Erro ao registrar o termo.');
    } finally {
      setSaving(false);
    }
  };

  if (!patients.length) {
    return (
      <div className="empty">
        <h4>Nenhum paciente cadastrado</h4>
        <p>Cadastre um paciente antes de gerar um termo.</p>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={submit}>
      <div className="form-row">
        <div className="form-field">
          <label className="form-label" htmlFor="cs-patient">
            Paciente
          </label>
          <select
            className="form-select"
            id="cs-patient"
            name="patientId"
            defaultValue={patientId || patients[0].id}
            onChange={(e) => {
              const p = patients.find((x) => x.id === e.currentTarget.value);
              const signedBy = e.currentTarget.form?.elements.namedItem('signedBy') as HTMLInputElement | null;
              const doc = e.currentTarget.form?.elements.namedItem('document') as HTMLInputElement | null;
              if (signedBy && !p?.responsible) signedBy.value = p?.name || '';
              if (doc) doc.value = p?.document || '';
              gerarTexto(p, signedBy?.value || p?.name || '', doc?.value || '');
            }}
          >
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="cs-type">
            Tipo de termo
          </label>
          <select
            className="form-select"
            id="cs-type"
            name="type"
            value={tipo}
            onChange={(e) => {
              const novo = e.currentTarget.value as 'treatment' | 'data';
              setTipo(novo);
              setSubstituir(false);
              const signedBy = e.currentTarget.form?.elements.namedItem('signedBy') as HTMLInputElement | null;
              const doc = e.currentTarget.form?.elements.namedItem('document') as HTMLInputElement | null;
              gerarTexto(pacienteAtual, signedBy?.value || '', doc?.value || '', novo);
            }}
          >
            {(['treatment', 'data'] as const).map((t) => (
              <option key={t} value={t}>
                {modelos?.[t]?.label || CONSENT_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-field">
        <label className="form-label" htmlFor="cs-signedBy">
          Quem assinou *
        </label>
        <input
          className="form-input"
          id="cs-signedBy"
          name="signedBy"
          type="text"
          required
          defaultValue={pacienteAtual?.responsible || pacienteAtual?.name || ''}
          onBlur={(e) => gerarTexto(pacienteAtual, e.currentTarget.value, '')}
        />
      </div>

      <div className="form-row-3">
        <div className="form-field">
          <label className="form-label" htmlFor="cs-rel">
            Relação com o paciente
          </label>
          <select
            className="form-select"
            id="cs-rel"
            name="relationship"
            value={relationship}
            onChange={(e) => setRelationship(e.currentTarget.value as 'holder' | 'guardian')}
          >
            {RELATIONSHIP.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="cs-document">
            Documento
          </label>
          <input
            className="form-input"
            id="cs-document"
            name="document"
            type="text"
            defaultValue={pacienteAtual?.document || ''}
            onBlur={(e) => gerarTexto(pacienteAtual, '', e.currentTarget.value)}
          />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="cs-signedAt">
            Data da assinatura
          </label>
          <input
            className="form-input"
            id="cs-signedAt"
            name="signedAt"
            type="datetime-local"
            required
            defaultValue={toLocalDateTime(new Date().toISOString())}
          />
        </div>
      </div>

      <div className="small muted" style={{ marginBottom: 6 }}>
        {modelos?.[tipo]?.label || CONSENT_TYPE_LABEL[tipo]}
      </div>

      <div className="editor-shell">
        <div
          ref={editorRef}
          className="doc"
          contentEditable
          suppressContentEditableWarning
          style={{ minHeight: 220, maxHeight: '38vh', overflowY: 'auto' }}
          aria-label="Texto do termo"
        />
      </div>

      {vigente && (
        <label className="form-check" htmlFor="cs-substituir" style={{ marginTop: 10 }}>
          <input
            id="cs-substituir"
            name="substituir"
            type="checkbox"
            checked={substituir}
            onChange={(e) => setSubstituir(e.currentTarget.checked)}
          />
          Substituir o termo vigente deste paciente e tipo
        </label>
      )}

      {formError && <div className="form-error">{formError}</div>}
      <p className="small muted">
        Revise o texto antes de salvar. O texto final fica congelado no registro, com data, versão e
        responsável.
      </p>

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Salvando…' : 'Registrar assinatura'}
        </button>
      </div>
    </form>
  );
}

function RevokeConsentForm({
  consent,
  onDone,
  onSaved,
}: {
  consent: Consent;
  onDone: () => void;
  onSaved?: () => void;
}) {
  const { addToast } = useUI();
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const form = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    try {
      await consentRepository.revoke(consent.id, form.reason.trim());
      addToast({ type: 'success', message: 'Consentimento revogado.' });
      onSaved?.();
      onDone();
    } catch (err) {
      console.error('Failed to revoke consent:', err);
      addToast({ type: 'error', message: 'Erro ao revogar o consentimento.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <p className="small">
        Revogação do termo assinado por <strong>{consent.signedBy}</strong>. O registro será mantido
        para comprovação, mas perderá a vigência.
      </p>
      <div className="form-field">
        <label className="form-label" htmlFor="rc-reason">
          Motivo (opcional)
        </label>
        <textarea
          className="form-textarea"
          id="rc-reason"
          name="reason"
          rows={3}
          placeholder="Solicitação verbal do titular, por exemplo."
        />
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-danger" disabled={saving}>
          {saving ? 'Revogando…' : 'Revogar'}
        </button>
      </div>
    </form>
  );
}

function ViewConsentForm({ consent, onDone }: { consent: Consent; onDone: () => void }) {
  return (
    <div>
      <div
        className="doc"
        style={{ maxHeight: '52vh', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}
        dangerouslySetInnerHTML={{ __html: consent.text || '<p>Termo sem texto registrado.</p>' }}
      />
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Fechar
        </button>
      </div>
    </div>
  );
}

/**
 * Conteúdo do ModalPortal em App.tsx. Só aparece quando activeModal bate.
 */
export function ModalRouter() {
  const { activeModal, modalProps, closeModal } = useUI();

  if (activeModal === 'new-patient' || activeModal === 'edit-patient') {
    return (
      <PatientForm
        patient={modalProps?.patient as Patient | undefined}
        onSaved={modalProps?.onSaved as (() => void) | undefined}
        onDone={closeModal}
      />
    );
  }

  if (activeModal === 'appointment-form') {
    return (
      <AppointmentForm
        appointment={modalProps?.appointment as Appointment | undefined}
        date={modalProps?.date as string | undefined}
        patientId={modalProps?.patientId as string | undefined}
        onSaved={modalProps?.onSaved as ((saved: Appointment) => void) | undefined}
        onDone={closeModal}
      />
    );
  }

  if (activeModal === 'consent-form') {
    return (
      <ConsentForm
        patientId={modalProps?.patientId as string | undefined}
        onSaved={modalProps?.onSaved as (() => void) | undefined}
        onDone={closeModal}
      />
    );
  }

  if (activeModal === 'revoke-consent') {
    return (
      <RevokeConsentForm
        consent={modalProps?.consent as Consent}
        onSaved={modalProps?.onSaved as (() => void) | undefined}
        onDone={closeModal}
      />
    );
  }

  if (activeModal === 'view-consent') {
    return <ViewConsentForm consent={modalProps?.consent as Consent} onDone={closeModal} />;
  }

  if (activeModal === 'new-service') {
    return (
      <ServiceForm
        service={modalProps?.service as Service | undefined}
        onSaved={modalProps?.onSaved as (() => void) | undefined}
        onDone={closeModal}
      />
    );
  }

  return null;
}

export function ModalTitle() {
  const { activeModal, modalProps } = useUI();
  if (activeModal === 'new-patient' || activeModal === 'edit-patient') {
    return <span>{modalProps?.patient ? 'Editar paciente' : 'Novo paciente'}</span>;
  }
  if (activeModal === 'appointment-form') {
    return <span>{modalProps?.appointment ? 'Editar agendamento' : 'Novo agendamento'}</span>;
  }
  if (activeModal === 'consent-form') return <span>Novo termo de consentimento</span>;
  if (activeModal === 'revoke-consent') return <span>Revogar consentimento</span>;
  if (activeModal === 'view-consent') {
    const c = modalProps?.consent as Consent | undefined;
    return <span>{c?.type === 'data' ? 'Aviso de privacidade (LGPD)' : 'Termo de consentimento'}</span>;
  }
  if (activeModal === 'new-service') {
    return <span>{modalProps?.service ? 'Editar serviço' : 'Novo serviço'}</span>;
  }
  return <span>{modalProps?.title || ''}</span>;
}
