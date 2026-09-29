import { useUI, useData, useAuth } from '../store';
import { patientRepository, serviceRepository } from '../repositories';
import { pacientesVisiveis } from '../services/AccessService';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Patient, Service } from '../domain/types';

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

function statusBadge(status: string) {
  if (status === 'active') return <span className="badge badge-success">Em tratamento</span>;
  if (status === 'paused') return <span className="badge badge-warn">Pausado</span>;
  return <span className="badge">Encerrado</span>;
}

export function PatientsPage() {
  const navigate = useNavigate();
  const { addToast } = useUI();
  const { patientsFilter, setPatientsFilter } = useData();
  const { professional: me, isAdmin } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [evolutionCount, setEvolutionCount] = useState<Record<string, { count: number; lastDate?: string }>>({});
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPatients = useCallback(async () => {
    setLoading(true);
    try {
      const [data, svc] = await Promise.all([
        patientRepository.findWithEvolutionCount(),
        serviceRepository.findActive(),
      ]);
      // Quem nao administra so enxerga os pacientes sob a responsabilidade dele
      // e os que ainda nao tem responsavel definido.
      const visiveis = pacientesVisiveis(
        data.map((d) => d.patient),
        me,
        isAdmin
      );
      setPatients(visiveis);
      setEvolutionCount(
        Object.fromEntries(data.map((d) => [d.patient.id, { count: d.count, lastDate: d.lastDate }]))
      );
      setServices(svc);
    } catch (e) {
      console.error('Failed to load patients:', e);
      addToast({ type: 'error', message: 'Erro ao carregar pacientes' });
    } finally {
      setLoading(false);
    }
  }, [addToast, me, isAdmin]);

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  const search = patientsFilter.search || '';
  const serviceFilter = patientsFilter.serviceId || 'all';

  const filtered = patients.filter((p) => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      (p.phone || '').includes(q) ||
      (p.email || '').toLowerCase().includes(q);
    const matchesService = serviceFilter === 'all' || p.serviceId === serviceFilter;
    return matchesSearch && matchesService;
  });

  const serviceLabel = (id: string) => services.find((s) => s.id === id)?.name || 'Sem serviço';

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 16 }}>
        <div className="search grow" style={{ maxWidth: 320 }}>
          <input
            type="search"
            placeholder="Buscar por nome, telefone ou email..."
            aria-label="Buscar por nome, telefone ou email"
            value={search}
            onChange={(e) => setPatientsFilter({ search: e.target.value })}
          />
        </div>
      </div>

      <div className="chip-bar">
        <button
          className={`chip ${serviceFilter === 'all' ? 'active' : ''}`}
          onClick={() => setPatientsFilter({ serviceId: 'all' })}
        >
          Todos
        </button>
        {services.map((s) => (
          <button
            key={s.id}
            className={`chip ${serviceFilter === s.id ? 'active' : ''}`}
            onClick={() => setPatientsFilter({ serviceId: s.id })}
          >
            {s.name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card">
          <div className="empty small">Carregando…</div>
        </div>
      ) : filtered.length ? (
        <div className="grid-cards">
          {filtered.map((p) => (
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
                  <div className="pc-meta">
                    {p.phone || 'Sem telefone'}
                    {idade(p.birthDate) !== null && ` · ${idade(p.birthDate)} anos`}
                  </div>
                </div>
              </div>
              <div className="pc-foot">
                <span className="badge badge-primary">{serviceLabel(p.serviceId)}</span>
                {statusBadge(p.status)}
              </div>
              <div className="pc-meta">
                {evolutionCount[p.id]?.count
                  ? `${evolutionCount[p.id].count} evolução(ões) · última em ${new Date(
                      evolutionCount[p.id].lastDate as string
                    ).toLocaleDateString('pt-BR')}`
                  : 'Nenhuma evolução registrada'}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <div className="empty">
            <div className="ico">☺</div>
            <h4>Nenhum paciente encontrado</h4>
            <p>Ajuste a busca ou cadastre um novo paciente.</p>
          </div>
        </div>
      )}
    </div>
  );
}
