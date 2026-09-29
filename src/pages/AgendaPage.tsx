import { appointmentRepository, patientRepository, professionalRepository, serviceRepository } from '../repositories';
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useConfig, useUI } from '../store';
import { EMPTY_CONFIG, printDayAgenda, type PrintContext } from '../services/PrintService';
import type {
  Appointment,
  AppointmentStatus,
  Patient,
  Professional,
  Service,
} from '../domain/types';

function localISODate(date: Date): string {
  const off = date.getTimezoneOffset();
  return new Date(date.getTime() - off * 60_000).toISOString().split('T')[0];
}

/**
 * Os filtros da agenda precisam de altura natural: `.input` tem 8px de padding
 * vertical e fonte 14px (linha de 19px), e um `height` fixo de 32px deixava
 * so 14px de conteudo, cortando o texto. A base flexivel tambem impede que
 * os dois seletores se sobreponham quando o rotulo e longo.
 */
const FILTER_STYLE: CSSProperties = {
  flex: '1 1 220px',
  minWidth: 0,
  maxWidth: 340,
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  scheduled: { label: 'Agendado', className: 'badge-primary' },
  confirmed: { label: 'Confirmado', className: 'badge-success' },
  completed: { label: 'Realizado', className: '' },
  cancelled: { label: 'Cancelado', className: 'badge-danger' },
  'no-show': { label: 'Faltou', className: 'badge-warn' },
};

const TODAY = localISODate(new Date());

export function AgendaPage() {
  const [date, setDate] = useState(TODAY);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [upcoming, setUpcoming] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [professionalFilter, setProfessionalFilter] = useState('all');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const { openModal, addToast } = useUI();
  const { config } = useConfig();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, pats, pros, svcs, next] = await Promise.all([
        appointmentRepository.findByDate(date),
        patientRepository.findAll({ orderBy: 'name', orderDir: 'asc' }),
        professionalRepository.findActive(),
        serviceRepository.findActive(),
        appointmentRepository.getUpcoming(5),
      ]);
      setAppointments(list.sort((a, b) => a.start.localeCompare(b.start)));
      setPatients(pats);
      setProfessionals(pros);
      setServices(svcs);
      setUpcoming(next);
    } catch (e) {
      console.error('Failed to load agenda:', e);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const patientName = (id: string) => patients.find((p) => p.id === id)?.name || '—';
  const serviceName = (id: string) => services.find((s) => s.id === id)?.name || '—';
  const professionalName = (id: string) =>
    professionals.find((p) => p.id === id)?.name || 'Sem profissional';

  const shift = (days: number) => {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + days);
    setDate(localISODate(d));
  };

  const filtered = appointments.filter((a) => {
    if (professionalFilter !== 'all' && a.professionalId !== professionalFilter) return false;
    if (serviceFilter !== 'all' && a.serviceId !== serviceFilter) return false;
    return true;
  });

  const printCtx: PrintContext = {
    config: config ?? EMPTY_CONFIG,
    services,
    professionals,
    patients,
  };

  function mudarStatus(a: Appointment, status: AppointmentStatus, rotulo: string) {
    void appointmentRepository
      .update(a.id, { status })
      .then(() => {
        addToast({ type: 'success', message: `Sessão de ${patientName(a.patientId)}: ${rotulo}.` });
        void load();
      })
      .catch(() => addToast({ type: 'error', message: 'Erro ao alterar a situação da sessão.' }));
  }

  function excluir(a: Appointment) {
    if (!window.confirm(`Excluir a sessão de ${patientName(a.patientId)} em ${new Date(a.start).toLocaleString('pt-BR')}?`)) {
      return;
    }
    void appointmentRepository
      .delete(a.id)
      .then(() => {
        addToast({ type: 'success', message: 'Sessão excluída.' });
        void load();
      })
      .catch(() => addToast({ type: 'error', message: 'Erro ao excluir a sessão.' }));
  }

  const emAndamento = (a: Appointment) => a.status === 'scheduled' || a.status === 'confirmed';

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div className="row">
            <button className="btn btn-secondary btn-sm" onClick={() => shift(-1)}>
              ← Anterior
            </button>
            <input
              type="date"
              className="input"
              style={{ width: 170 }}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Data da agenda"
            />
            <button className="btn btn-secondary btn-sm" onClick={() => shift(1)}>
              Próxima →
            </button>
            {date !== TODAY && (
              <button className="btn btn-ghost btn-sm" onClick={() => setDate(TODAY)}>
                Hoje
              </button>
            )}
          </div>
          <div className="row">
            <button
              className="btn btn-primary btn-sm"
              onClick={() => openModal('appointment-form', { date, onSaved: load })}
            >
              + Nova sessão
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => printDayAgenda(date, filtered, printCtx)}
            >
              PDF da agenda
            </button>
          </div>
        </div>
        <div className="card-body" style={{ padding: '12px 18px' }}>
          <div className="row" style={{ gap: 8 }}>
            <select
              className="input"
              style={FILTER_STYLE}
              value={professionalFilter}
              onChange={(e) => setProfessionalFilter(e.target.value)}
              aria-label="Filtrar por profissional"
            >
              <option value="all">Todos os profissionais</option>
              {professionals.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              className="input"
              style={FILTER_STYLE}
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
              aria-label="Filtrar por serviço"
            >
              <option value="all">Todos os serviços</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <h3>
              Sessões de {new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR')}
            </h3>
            <span className="badge">{filtered.length} sessão(ões)</span>
          </div>
          <div className="card-body">
            {loading ? (
              <div className="empty small">Carregando…</div>
            ) : filtered.length === 0 ? (
              <div className="empty">
                <h4>Nenhuma sessão nesta data</h4>
                <p>Use o botão “Nova sessão” para marcar uma sessão.</p>
              </div>
            ) : (
              <div className="timeline">
                {filtered.map((a) => {
                  const badge = STATUS_BADGE[a.status] || { label: a.status, className: '' };
                  const inicio = new Date(a.start);
                  const fim = new Date(inicio.getTime() + (a.durationMin || 50) * 60_000);
                  const andando = emAndamento(a);
                  return (
                    <div className="tl-item" key={a.id}>
                      <div className="tl-date">
                        <strong>
                          {inicio.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </strong>
                        {fim.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        <div className="small">{a.durationMin || 50} min</div>
                      </div>
                      <div>
                        <div className="tl-title">
                          {patientName(a.patientId)}
                          <span className={`badge ${badge.className}`}>{badge.label}</span>
                        </div>
                        <div className="tl-preview">
                          {serviceName(a.serviceId)} · {professionalName(a.professionalId)}
                        </div>
                        {a.notes && <div className="tl-preview">{a.notes}</div>}
                        <div className="tl-actions">
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => openModal('appointment-form', { appointment: a, onSaved: load })}
                          >
                            Editar
                          </button>
                          {a.status === 'scheduled' && (
                            <button
                              className="btn btn-success btn-sm"
                              onClick={() => mudarStatus(a, 'confirmed', 'confirmada')}
                            >
                              Confirmar
                            </button>
                          )}
                          {andando && (
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => mudarStatus(a, 'completed', 'realizada')}
                            >
                              Realizado
                            </button>
                          )}
                          {andando && (
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => mudarStatus(a, 'no-show', 'não realizada')}
                            >
                              Faltou
                            </button>
                          )}
                          {andando && (
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => mudarStatus(a, 'cancelled', 'cancelada')}
                            >
                              Cancelar
                            </button>
                          )}
                          {!andando && (
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => mudarStatus(a, 'scheduled', 'reaberta')}
                            >
                              Reabrir
                            </button>
                          )}
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => excluir(a)}
                          >
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

        <div className="card">
          <div className="card-head">
            <h3>Próximos atendimentos</h3>
          </div>
          <div className="card-body">
            {upcoming.length === 0 ? (
              <div className="empty small">Nenhum atendimento futuro agendado.</div>
            ) : (
              <div className="timeline">
                {upcoming.map((a) => (
                  <div className="tl-item" key={a.id}>
                    <div className="tl-date">
                      <strong>{new Date(a.start).toLocaleDateString('pt-BR')}</strong>
                      {new Date(a.start).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                    <div>
                      <div className="tl-title">{patientName(a.patientId)}</div>
                      <div className="tl-preview">{serviceName(a.serviceId)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
