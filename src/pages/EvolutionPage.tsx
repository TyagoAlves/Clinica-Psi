import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { evolutionRepository, patientRepository, professionalRepository } from '../repositories';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { Evolution } from '../domain/types';
import { useUI } from '../store';

export function EvolutionPage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { addToast } = useUI();

  const editingId = params.get('evo');
  const [patient, setPatient] = useState<any>(null);
  const [evolutions, setEvolutions] = useState<any[]>([]);
  const [professionals, setProfessionals] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [p, evos, pros] = await Promise.all([
        patientRepository.findById(id),
        evolutionRepository.findByPatient(id),
        professionalRepository.findActive(),
      ]);
      setPatient(p);
      setEvolutions(evos.sort((a, b) => String(b.date).localeCompare(String(a.date))));
      setProfessionals(pros);
      if (editingId) setEditing(evos.find((e) => e.id === editingId) || null);
    } catch (e) {
      console.error('Failed to load evolution:', e);
    } finally {
      setLoading(false);
    }
  }, [id, editingId]);

  useEffect(() => {
    load();
  }, [load]);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!patient) return;
    setSaving(true);
    const form = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    try {
      if (editing) {
        await evolutionRepository.update(editing.id, {
          title: form.title || 'Evolução de sessão',
          content: form.content,
          date: new Date(form.date).toISOString(),
        });
        addToast({ type: 'success', message: 'Evolução atualizada com sucesso' });
        navigate(`/patients/${patient.id}`, { replace: true });
      } else {
        await evolutionRepository.create({
          patientId: patient.id,
          professionalId: form.professionalId as Evolution['professionalId'],
          title: form.title || 'Evolução de sessão',
          date: new Date(form.date).toISOString(),
          content: form.content,
        });
        addToast({ type: 'success', message: 'Evolução registrada com sucesso' });
        navigate(`/patients/${patient.id}`);
      }
      await load();
    } catch (err) {
      console.error('Failed to save evolution:', err);
      addToast({ type: 'error', message: 'Erro ao salvar evolução' });
    } finally {
      setSaving(false);
    }
  };

  const startNew = () => {
    const today = new Date();
    const local = new Date(today.getTime() - today.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);
    (document.getElementById('evo-title') as HTMLInputElement | null)?.focus();
    const form = document.getElementById('evolution-form') as HTMLFormElement | null;
    if (!form) return;
    (form.elements.namedItem('date') as HTMLInputElement).value = local;
    (form.elements.namedItem('title') as HTMLInputElement).value = 'Evolução de sessão';
  };

  if (loading) return <div className="card"><div className="empty small">Carregando…</div></div>;

  if (!patient) {
    return (
      <div className="card">
        <div className="empty">
          <h4>Paciente não encontrado</h4>
          <p>Volte à lista de pacientes.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="breadcrumb">
        <button className="linklike" onClick={() => navigate(`/patients/${patient.id}`)}>
          Prontuário
        </button>
        <span>/</span>
        <span>{patient.name}</span>
      </div>

      <div className="stack">
        <div className="card">
          <div className="card-head">
            <h3>{editing ? 'Editar evolução' : 'Nova evolução'}</h3>
            <span className="badge">{patient.name}</span>
          </div>
          <div className="card-body">
            <form id="evolution-form" onSubmit={onSubmit}>
              <div className="form-row">
                <div>
                  <div className="form-label-row">
                    <label className="form-label" htmlFor="evo-date">
                      Data e hora
                    </label>
                  </div>
                  <input
                    className="form-input"
                    id="evo-date"
                    name="date"
                    type="datetime-local"
                    required
                    defaultValue={editing ? new Date(editing.date).toISOString().slice(0, 16) : undefined}
                  />
                </div>
                <div>
                  <label className="form-label" htmlFor="evo-professional">
                    Profissional
                  </label>
                  <select
                    className="form-select"
                    id="evo-professional"
                    name="professionalId"
                    required
                    defaultValue={editing?.professionalId || professionals[0]?.id || ''}
                  >
                    {professionals.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.crp}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-16">
                <label className="form-label" htmlFor="evo-title">
                  Título
                </label>
                <input
                  className="form-input"
                  id="evo-title"
                  name="title"
                  type="text"
                  placeholder="Evolução de sessão"
                  defaultValue={editing?.title || ''}
                />
              </div>

              <div className="mt-16">
                <div className="form-label-row">
                  <label className="form-label" htmlFor="evo-content">
                    Registro clínico
                  </label>
                  <span className="form-hint">Descreva a sessão, Demandas e conduta.</span>
                </div>
                <textarea
                  className="form-textarea"
                  id="evo-content"
                  name="content"
                  rows={12}
                  required
                  defaultValue={editing?.content || ''}
                />
              </div>

              <div className="row mt-16">
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Salvando…' : editing ? 'Salvar alterações' : 'Registrar evolução'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => navigate(`/patients/${patient.id}`)}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Histórico de evoluções</h3>
            <span className="badge">{evolutions.length}</span>
            {!editing && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={startNew}>
                Limpar formulário
              </button>
            )}
          </div>
          <div className="card-body">
            {evolutions.length === 0 ? (
              <div className="empty small">Nenhuma evolução registrada ainda.</div>
            ) : (
              <div className="timeline">
                {evolutions.map((evo) => {
                  const prof = professionals.find((p) => p.id === evo.professionalId);
                  return (
                    <div className="tl-item" key={evo.id}>
                      <div className="tl-date">
                        <strong>{new Date(evo.date).toLocaleDateString('pt-BR')}</strong>
                        {new Date(evo.date).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        <div className="small">{prof?.crp || ''}</div>
                      </div>
                      <div>
                        <div className="tl-title">{evo.title || 'Evolução de sessão'}</div>
                        {evo.content && (
                          <div
                            className="tl-preview"
                            dangerouslySetInnerHTML={{
                              __html: String(evo.content).replace(/<[^>]+>/g, ' ').slice(0, 220),
                            }}
                          />
                        )}
                        <div className="tl-actions">
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => navigate(`/evolution/${patient.id}?evo=${evo.id}`)}
                          >
                            Editar
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
      </div>
    </div>
  );
}
