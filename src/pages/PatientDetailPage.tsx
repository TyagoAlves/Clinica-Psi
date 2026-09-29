import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  appointmentRepository,
  consentRepository,
  evolutionRepository,
  patientRepository,
  professionalRepository,
  serviceRepository,
} from '../repositories';
import { useCallback, useEffect, useState } from 'react';
import { useConfig, useUI, useAuth } from '../store';
import { podeVerPaciente } from '../services/AccessService';
import {
  EMPTY_CONFIG,
  printAllEvolutions,
  printConsent,
  printEvolution,
  printProntuario,
  type PrintContext,
} from '../services/PrintService';
import { CONSENT_STATUS_LABEL, CONSENT_TYPE_LABEL } from '../services/ConsentService';
import type { Appointment, Consent, Evolution, Patient, Professional, Service } from '../domain/types';

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}

function idade(birthDate?: string): number | null {
  if (!birthDate) return null;
  const born = new Date(birthDate);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - born.getFullYear();
  const m = now.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < born.getDate())) years--;
  return years;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  active: { label: 'Em tratamento', className: 'badge-success' },
  paused: { label: 'Pausado', className: 'badge-warn' },
  discharged: { label: 'Alta/Encerrado', className: '' },
  inactive: { label: 'Inativo', className: '' },
};

export function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { openModal, addToast } = useUI();
  const { config } = useConfig();
  const { professional: me, isAdmin } = useAuth();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [evolutions, setEvolutions] = useState<Evolution[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [consents, setConsents] = useState<Consent[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [p, evos, appts, cons, svcs, pros] = await Promise.all([
        patientRepository.findById(id),
        evolutionRepository.findByPatient(id),
        appointmentRepository.findByPatient(id),
        consentRepository.findByPatient(id),
        serviceRepository.findActive(),
        professionalRepository.findActive(),
      ]);
      // A URL direta /patients/:id nao passa pela lista, entao a checagem de
      // visibilidade tem de acontecer aqui tambem. Sem isso, esconder da lista
      // nao esconderia nada.
      if (p && !podeVerPaciente(p, me, isAdmin)) {
        setPatient(null);
        setEvolutions([]);
        setAppointments([]);
        setConsents([]);
        setLoading(false);
        addToast({ type: 'error', message: 'Este paciente está sob a responsabilidade de outro profissional.' });
        return;
      }

      setPatient(p);
      setEvolutions(evos);
      setAppointments(appts.sort((a, b) => String(b.start).localeCompare(String(a.start))));
      setConsents(cons);
      setServices(svcs);
      setProfessionals(pros);
    } catch (e) {
      console.error('Failed to load patient:', e);
    } finally {
      setLoading(false);
    }
  }, [id, me, isAdmin, addToast]);

  useEffect(() => {
    load();
  }, [load]);

  const printCtx: PrintContext = {
    config: config ?? EMPTY_CONFIG,
    services,
    professionals,
    patients: patient ? [patient] : [],
  };

  function excluirEvolucao(evo: Evolution) {
    if (!window.confirm(`Excluir a evolução "${evo.title || 'sem título'}"?`)) return;
    void evolutionRepository
      .delete(evo.id)
      .then(() => {
        addToast({ type: 'success', message: 'Evolução excluída.' });
        void load();
      })
      .catch(() => addToast({ type: 'error', message: 'Erro ao excluir a evolução.' }));
  }

  function excluirPaciente() {
    if (!patient) return;
    const msg =
      `Todas as evoluções de ${patient.name} também serão removidas. ` +
      'Esta ação não pode ser desfeita.';
    if (!window.confirm(`Excluir ${patient.name}?\n\n${msg}`)) return;

    void patientRepository
      .removeWithCascade(patient.id)
      .then((r) => {
        if (!r.ok) {
          addToast({ type: 'error', message: r.error || 'Erro ao excluir o paciente.' });
          return;
        }
        addToast({
          type: 'success',
          message: r.removedEvolutions
            ? `Paciente excluído com ${r.removedEvolutions} evolução(ões).`
            : 'Paciente excluído.',
        });
        navigate('/patients');
      })
      .catch(() => addToast({ type: 'error', message: 'Erro ao excluir o paciente.' }));
  }

  function gerarTodasEvolucoes() {
    if (!patient) return;
    if (!evolutions.length) {
      addToast({ type: 'warning', message: 'Este paciente ainda não possui evoluções.' });
      return;
    }
    printAllEvolutions(patient, evolutions, printCtx);
  }

  if (loading) return <div className="card"><div className="empty small">Carregando…</div></div>;

  if (!patient) {
    return (
      <div className="card">
        <div className="empty">
          <h4>Paciente indisponível</h4>
          <p>
            O registro não existe ou está sob a responsabilidade de outro
            profissional.
          </p>
        </div>
      </div>
    );
  }

  const status = STATUS_BADGE[patient.status] || { label: patient.status, className: '' };
  const service = services.find((s) => s.id === patient.serviceId);
  const years = idade(patient.birthDate);

  const info: [string, string][] = [
    ['Telefone', patient.phone || '—'],
    ['E-mail', patient.email || '—'],
    ['Nascimento', patient.birthDate ? new Date(patient.birthDate).toLocaleDateString('pt-BR') : '—'],
    ['Idade', years !== null ? `${years} anos` : '—'],
    ['Documento', patient.document || '—'],
    ['Responsável', patient.responsible || '—'],
    ['Endereço', patient.address || '—'],
    ['Início do tratamento', patient.startDate ? new Date(patient.startDate).toLocaleDateString('pt-BR') : '—'],
  ];

  return (
    <div>
      <div className="breadcrumb">
        <Link to="/patients">Pacientes</Link>
        <span>/</span>
        <span>{patient.name}</span>
      </div>

      <div className="card detail-head">
        <div className="detail-ident">
          <div className="avatar avatar-lg">{initials(patient.name)}</div>
          <div>
            <h3>{patient.name}</h3>
            <div className="row small muted" style={{ marginTop: 4 }}>
              <span className="badge badge-primary">{service?.name || 'Sem serviço'}</span>
              <span className={`badge ${status.className}`}>{status.label}</span>
              <span>Cadastrado em {new Date(patient.createdAt).toLocaleDateString('pt-BR')}</span>
            </div>
          </div>
        </div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <button className="btn btn-primary" onClick={() => navigate(`/evolution/${patient.id}`)}>
            + Nova evolução
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => openModal('appointment-form', { patientId: patient.id, onSaved: load })}
          >
            + Agendar sessão
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => openModal('edit-patient', { patient, onSaved: load })}
          >
            Editar cadastro
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => printProntuario(patient, evolutions, printCtx)}
          >
            PDF do prontuário
          </button>
          <button className="btn btn-secondary" onClick={gerarTodasEvolucoes}>
            PDF de cada evolução
          </button>
          <button className="btn btn-danger btn-sm" onClick={excluirPaciente}>
            Excluir
          </button>
        </div>
      </div>

      <div className="stack">
        <div className="card">
          <div className="card-head">
            <h3>Dados cadastrais</h3>
          </div>
          <div className="card-body">
            <div className="info-grid">
              {info.map(([k, v]) => (
                <div className="info-item" key={k}>
                  <div className="k">{k}</div>
                  <div className="v">{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Descrição / queixa</h3>
          </div>
          <div className="card-body">
            <p className="small">{patient.description || 'Sem descrição registrada.'}</p>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Evoluções</h3>
            <span className="badge">{evolutions.length} registro(s)</span>
          </div>
          <div className="card-body">
            {evolutions.length === 0 ? (
              <div className="empty">
                <div className="ico">✎</div>
                <h4>Nenhuma evolução registrada</h4>
                <p>
                  Clique em “Nova evolução” para abrir o editor e registrar a primeira sessão.
                </p>
              </div>
            ) : (
              <div className="timeline">
                {evolutions.map((evo) => {
                  const prof = professionals.find((p) => p.id === evo.professionalId);
                  return (
                    <div className="tl-item" key={evo.id}>
                      <div className="tl-date">
                        <strong>{new Date(evo.date).toLocaleDateString('pt-BR')}</strong>
                        {new Date(evo.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        <div className="small">{prof?.name?.split(' ').slice(-1)[0] || '—'}</div>
                      </div>
                      <div>
                        <div className="tl-title">{evo.title || 'Evolução sem título'}</div>
                        {evo.content && (
                          <div
                            className="tl-preview"
                            dangerouslySetInnerHTML={{ __html: String(evo.content).replace(/<[^>]+>/g, ' ') }}
                          />
                        )}
                        <div className="tl-actions">
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => navigate(`/evolution/${patient.id}?evo=${evo.id}`)}
                          >
                            Editar
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => printEvolution(evo, patient, printCtx)}
                          >
                            Gerar PDF
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => excluirEvolucao(evo)}>
                            Excluir
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="grid-2">
          <div className="card">
            <div className="card-head">
              <h3>Sessões</h3>
              <span className="badge">{appointments.length}</span>
            </div>
            <div className="card-body">
              {appointments.length === 0 ? (
                <div className="empty small">Nenhuma sessão registrada.</div>
              ) : (
                <div className="timeline">
                  {appointments.map((a) => (
                    <div className="tl-item" key={a.id}>
                      <div className="tl-date">
                        <strong>{new Date(a.start).toLocaleDateString('pt-BR')}</strong>
                        {new Date(a.start).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div>
                        <div className="tl-title">{services.find((s) => s.id === a.serviceId)?.name || 'Sessão'}</div>
                        <div className="tl-preview">
                          {professionals.find((p) => p.id === a.professionalId)?.name || '—'} · {a.durationMin} min
                        </div>
                        <div className="tl-actions">
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => openModal('appointment-form', { appointment: a, onSaved: load })}
                          >
                            Editar
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Termos LGPD</h3>
              <div className="row" style={{ gap: 8 }}>
                <span className="badge">{consents.length}</span>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() =>
                    openModal('consent-form', { patientId: patient.id, onSaved: load })
                  }
                >
                  + Novo termo
                </button>
              </div>
            </div>
            <div className="card-body">
              {consents.length === 0 ? (
                <div className="empty small">Nenhum termo registrado.</div>
              ) : (
                <div className="timeline">
                  {consents.map((c) => (
                    <div className="tl-item" key={c.id}>
                      <div className="tl-date">
                        <strong>{new Date(c.signedAt).toLocaleDateString('pt-BR')}</strong>
                        <div className="small">{c.type === 'data' ? 'Dados' : 'Tratamento'}</div>
                      </div>
                      <div>
                        <div className="tl-title">
                          {c.status === 'active' ? (
                            <span className="badge badge-success">
                              {CONSENT_STATUS_LABEL.active}
                            </span>
                          ) : (
                            <span className="badge">{CONSENT_STATUS_LABEL[c.status] || c.status}</span>
                          )}
                          <span className="muted"> · {CONSENT_TYPE_LABEL[c.type]}</span>
                        </div>
                        <div className="small muted">
                          Assinado por {c.signedBy} · v{c.version}
                          {c.relationship === 'guardian' ? ' · responsável legal' : ''}
                        </div>
                        <div className="row" style={{ gap: 6, marginTop: 6 }}>
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => printConsent(c, patient, printCtx)}
                          >
                            Gerar PDF
                          </button>
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => openModal('view-consent', { consent: c })}
                          >
                            Ver termo
                          </button>
                          {c.status === 'active' && (
                            <button
                              className="btn btn-sm btn-danger"
                              onClick={() => openModal('revoke-consent', { consent: c, onSaved: load })}
                            >
                              Revogar
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
