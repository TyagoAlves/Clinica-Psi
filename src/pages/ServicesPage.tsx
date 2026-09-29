import { useUI } from '../store';
import { serviceRepository } from '../repositories';
import { useCallback, useEffect, useState } from 'react';
import type { Service } from '../domain/types';

const SERVICE_STATUS: Record<string, { label: string; className: string }> = {
  active: { label: 'Ativo', className: 'badge-success' },
  inactive: { label: 'Inativo', className: '' },
};

export function ServicesPage() {
  const { addToast, openModal } = useUI();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  const loadServices = useCallback(async () => {
    setLoading(true);
    try {
      const data = await serviceRepository.findAll({ orderBy: 'name', orderDir: 'asc' });
      setServices(data);
    } catch (e) {
      console.error('Failed to load services:', e);
      addToast({ type: 'error', message: 'Erro ao carregar serviços' });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 16 }}>
        <span className="muted small">
          {services.length} serviço(s) cadastrado(s)
        </span>
        <button className="btn btn-primary" onClick={() => openModal('new-service', { onSaved: loadServices })}>
          + Novo serviço
        </button>
      </div>

      <div className="card">
        {loading ? (
          <div className="empty small">Carregando…</div>
        ) : services.length === 0 ? (
          <div className="empty">
            <div className="ico">✦</div>
            <h4>Nenhum serviço cadastrado</h4>
            <p>Crie o primeiro tipo de atendimento da clínica.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Serviço</th>
                  <th>Duração</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {services.map((s) => {
                  const status = SERVICE_STATUS[s.active ? 'active' : 'inactive'];
                  return (
                    <tr key={s.id}>
                      <td>
                        <strong>{s.name}</strong>
                        {s.description && <div className="small muted">{s.description}</div>}
                      </td>
                      <td className="nowrap">{s.durationMin} min</td>
                      <td>
                        <span className={`badge ${status.className}`}>{status.label}</span>
                      </td>
                      <td>
                        <div className="td-actions">
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => openModal('new-service', { service: s, onSaved: loadServices })}
                          >
                            Editar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
