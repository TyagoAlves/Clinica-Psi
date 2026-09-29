/**
 * Dashboard Page - layout alinhado com a POC
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  appointmentRepository,
  consentRepository,
  evolutionRepository,
  patientRepository,
  professionalRepository,
  serviceRepository,
} from '../repositories';
import type { Appointment, Evolution, Patient, Service } from '../domain/types';

interface DashboardData {
  totalPatients: number;
  activePatients: number;
  totalEvolutions: number;
  evolutionsThisMonth: number;
  sessionsToday: number;
  sessionsWeek: number;
  pendingConsents: number;
}

const EMPTY: DashboardData = {
  totalPatients: 0,
  activePatients: 0,
  totalEvolutions: 0,
  evolutionsThisMonth: 0,
  sessionsToday: 0,
  sessionsWeek: 0,
  pendingConsents: 0,
};

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}

function localISODate(date: Date): string {
  const off = date.getTimezoneOffset();
  return new Date(date.getTime() - off * 60_000).toISOString().split('T')[0];
}

function statusBadge(status: string) {
  if (status === 'active') return <span className="badge badge-success">Em tratamento</span>;
  if (status === 'paused') return <span className="badge badge-warn">Pausado</span>;
  return <span className="badge">Encerrado</span>;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData>(EMPTY);
  const [recentPatients, setRecentPatients] = useState<Patient[]>([]);
  const [todaySessions, setTodaySessions] = useState<Appointment[]>([]);
  const [recentEvolutions, setRecentEvolutions] = useState<Evolution[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [byService, setByService] = useState<{ name: string; total: number }[]>([]);
  const [professionals, setProfessionals] = useState<any[]>([]);
  const [patientNames, setPatientNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [patients, evolutions, today, upcoming, services, pros, pending] = await Promise.all([
        patientRepository.findAll({ orderBy: 'name', orderDir: 'asc' }),
        evolutionRepository.findAll({ orderBy: 'date', orderDir: 'desc' }),
        appointmentRepository.getTodaysAppointments(),
        appointmentRepository.getUpcoming(50),
        serviceRepository.findActive(),
        professionalRepository.findActive(),
        consentRepository.getPendingCount(),
      ]);

      const month = localISODate(new Date()).slice(0, 7);
      const in7days = new Date();
      in7days.setDate(in7days.getDate() + 7);

      setData({
        totalPatients: patients.length,
        activePatients: patients.filter((p) => p.status === 'active').length,
        totalEvolutions: evolutions.length,
        evolutionsThisMonth: evolutions.filter((e) => (e.date || '').slice(0, 7) === month).length,
        sessionsToday: today.length,
        sessionsWeek: upcoming.filter((a) => new Date(a.start) <= in7days).length,
        pendingConsents: pending,
      });

      setPatientNames(Object.fromEntries(patients.map((p) => [p.id, p.name])));
      setRecentPatients(patients.slice(0, 6));
      setTodaySessions(today);
      setRecentEvolutions(evolutions.slice(0, 5));
      setProfessionals(pros);
      setServices(services);

      const counts = new Map<string, number>();
      for (const p of patients) counts.set(p.serviceId, (counts.get(p.serviceId) || 0) + 1);
      setByService(
        services.map((s: Service) => ({ name: s.name, total: counts.get(s.id) || 0 }))
      );
    } catch (e) {
      console.error('Failed to load dashboard:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const serviceLabel = (id: string) => services.find((s) => s.id === id)?.name || 'Sem serviço';
  const maxService = Math.max(1, ...byService.map((s) => s.total));
  const professionalName = (id: string) => professionals.find((p) => p.id === id)?.name || '—';
  const patientName = (id: string) => patientNames[id] || 'Paciente';

  return (
    <div>
      <div className="stats">
        <div className="card stat accent">
          <div className="label">Total de Pacientes</div>
          <div className="value">{data.totalPatients}</div>
          <div className="foot">{data.activePatients} em tratamento</div>
        </div>
        <div className="card stat ok">
          <div className="label">Evoluções</div>
          <div className="value">{data.totalEvolutions}</div>
          <div className="foot">{data.evolutionsThisMonth} neste mês</div>
        </div>
        <div className="card stat">
          <div className="label">Sessões hoje</div>
          <div className="value">{data.sessionsToday}</div>
          <div className="foot">{data.sessionsWeek} nos próximos 7 dias</div>
        </div>
        <div className={`card stat ${data.pendingConsents ? 'warn' : 'ok'}`}>
          <div className="label">LGPD</div>
          <div className="value">{data.pendingConsents}</div>
          <div className="foot">pacientes sem termo vigente</div>
        </div>
      </div>

      {data.pendingConsents > 0 && (
        <div className="card" style={{ marginBottom: 20, borderColor: '#fde68a', background: 'var(--warn-soft)' }}>
          <div className="card-body row-between" style={{ flexWrap: 'wrap', gap: 10 }}>
            <div>
              <strong>{data.pendingConsents} paciente(s) ativo(s) sem termo de consentimento</strong>
              <div className="small muted">Revise os termos LGPD para manter a conformidade.</div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/lgpd')}>
              Ver pendências
            </button>
          </div>
        </div>
      )}

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <h3>Pacientes recentes</h3>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/patients')}>Ver todos</button>
          </div>
          <div className="card-body">
            {loading ? (
              <div className="empty small">Carregando…</div>
            ) : recentPatients.length ? (
              <div className="grid-cards">
                {recentPatients.map((p) => (
                  <div
                    key={p.id}
                    className="card patient-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/patients/${p.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(`/patients/${p.id}`);
                      }
                    }}
                  >
                    <div className="pc-top">
                      <div className="avatar avatar-lg">{initials(p.name)}</div>
                      <div>
                        <div className="pc-name">{p.name}</div>
                        <div className="pc-meta">{p.phone || 'Sem telefone'}</div>
                      </div>
                    </div>
                    <div className="pc-foot">
                      <span className="badge badge-primary">{serviceLabel(p.serviceId)}</span>
                      {statusBadge(p.status)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty">
                <h4>Nenhum paciente ainda</h4>
                <p>Use o botão “Novo paciente” para começar.</p>
              </div>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-head">
              <h3>Sessões de hoje</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => navigate('/agenda')}>Abrir agenda</button>
            </div>
            <div className="card-body">
              {todaySessions.length ? (
                <div className="timeline">
                  {todaySessions.map((a) => (
                    <div className="tl-item" key={a.id}>
                      <div className="tl-date">
                        <strong>
                          {new Date(a.start).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </strong>
                        {a.durationMin || 50} min
                      </div>
                      <div>
                        <div className="tl-title">{patientName(a.patientId)}</div>
                        <div className="tl-preview">
                          {serviceLabel(a.serviceId)} · {professionalName(a.professionalId)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty small">Nenhuma sessão agendada para hoje.</div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Últimos registros</h3>
            </div>
            <div className="card-body">
              {recentEvolutions.length ? (
                <div className="timeline">
                  {recentEvolutions.map((e) => (
                    <div className="tl-item" key={e.id}>
                      <div className="tl-date">
                        <strong>{new Date(e.date).toLocaleDateString('pt-BR')}</strong>
                        {new Date(e.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div>
                        <div className="tl-title">{e.title || 'Evolução'}</div>
                        <div className="tl-preview">{patientName(e.patientId)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty small">Nenhuma evolução registrada.</div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Pacientes por serviço</h3>
            </div>
            <div className="card-body">
              <div className="bar-list">
                {byService.map((s) => (
                  <div className="bar-row" key={s.name}>
                    <div className="bar-top">
                      <span>{s.name}</span>
                      <strong>{s.total}</strong>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${Math.round((s.total / maxService) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

