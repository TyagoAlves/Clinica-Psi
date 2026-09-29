/**
 * Controle LGPD: uma linha por termo assinado (como na POC), nao por paciente.
 * Quatro cards no topo, filtros Todos/Vigentes/Revogados/Sem termo e acoes de
 * PDF, Ver e Revogar por linha. Pacientes em falta entram com "Gerar termo".
 */

import {
  consentRepository,
  patientRepository,
  professionalRepository,
  serviceRepository,
} from '../repositories';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUI, useConfig, useAuth } from '../store';
import { pacientesVisiveis } from '../services/AccessService';
import {
  EMPTY_CONFIG,
  formatDate,
  printConsent,
  printConsentReport,
  type PrintContext,
} from '../services/PrintService';
import type { Consent, Patient, Professional, Service } from '../domain/types';

const CONSENT_TYPE: Record<string, string> = {
  treatment: 'Consentimento',
  data: 'Aviso LGPD',
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  active: { label: 'Vigente', className: 'badge-success' },
  revoked: { label: 'Revogado', className: 'badge-danger' },
  replaced: { label: 'Substituído', className: '' },
};

type Filtro = 'todos' | 'active' | 'revoked' | 'sem';

const FILTROS: { id: Filtro; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'active', label: 'Vigentes' },
  { id: 'revoked', label: 'Revogados' },
  { id: 'sem', label: 'Sem termo' },
];

type Linha = { patient: Patient; consent: Consent | null };

export function LGPDPage() {
  const { openModal, addToast } = useUI();
  const { config } = useConfig();

  const [patients, setPatients] = useState<Patient[]>([]);
  const { professional: me, isAdmin } = useAuth();
  const [consents, setConsents] = useState<Consent[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [filter, setFilter] = useState<Filtro>('todos');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [listaPacientes, todos, listaServicos, listaEquipe] = await Promise.all([
        patientRepository.findAll({ orderBy: 'name', orderDir: 'asc' }),
        consentRepository.findAll(),
        serviceRepository.findAll({ orderBy: 'name', orderDir: 'asc' }),
        professionalRepository.findAll({ orderBy: 'name', orderDir: 'asc' }),
      ]);
      // consentimento de paciente de outro profissional nao aparece aqui
      setPatients(pacientesVisiveis(listaPacientes, me, isAdmin));
      setConsents(todos);
      setServices(listaServicos);
      setProfessionals(listaEquipe);
    } catch (e) {
      console.error('Failed to load LGPD data:', e);
    } finally {
      setLoading(false);
    }
  }, [me, isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  const ctx: PrintContext = useMemo(
    () => ({
      config: config || EMPTY_CONFIG,
      services,
      professionals,
      patients,
    }),
    [config, services, professionals, patients]
  );

  const patientById = useMemo(
    () => new Map(patients.map((p) => [p.id, p])),
    [patients]
  );

  const linhas: Linha[] = useMemo(() => {
    if (filter === 'sem') {
      const comVigente = new Set(
        consents.filter((c) => c.status === 'active').map((c) => c.patientId)
      );
      return patients
        .filter((p) => p.status === 'active' && !comVigente.has(p.id))
        .map((patient) => ({ patient, consent: null }));
    }

    const registros =
      filter === 'todos' ? consents : consents.filter((c) => c.status === filter);

    const comPaciente = registros.filter((c) => patientById.has(c.patientId));
    return comPaciente
      .map((consent) => ({ patient: patientById.get(consent.patientId) as Patient, consent }))
      .sort((a, b) =>
        String(b.consent?.signedAt || '').localeCompare(String(a.consent?.signedAt || ''))
      );
  }, [filter, consents, patients, patientById]);

  const ativos = patients.filter((p) => p.status === 'active').length;
  const vigentes = consents.filter((c) => c.status === 'active').length;
  const revogados = consents.filter((c) => c.status === 'revoked').length;
  const comVigente = new Set(consents.filter((c) => c.status === 'active').map((c) => c.patientId));
  const semTermo = patients.filter((p) => p.status === 'active' && !comVigente.has(p.id)).length;

  const pacienteDe = (c: Consent) => patientById.get(c.patientId);

  const revogar = (c: Consent) => {
    const p = pacienteDe(c);
    if (!p) return;
    openModal('revoke-consent', { consent: c, patient: p, onSaved: load });
  };

  return (
    <div className="stack">
      <div className="stats">
        <div className="card stat">
          <div className="label">Pacientes ativos</div>
          <div className="value">{ativos}</div>
          <div className="foot">em tratamento</div>
        </div>
        <div className="card stat warn">
          <div className="label">Sem termo</div>
          <div className="value">{semTermo}</div>
          <div className="foot">precisam de assinatura</div>
        </div>
        <div className="card stat ok">
          <div className="label">Termos vigentes</div>
          <div className="value">{vigentes}</div>
          <div className="foot">assinados e ativos</div>
        </div>
        <div className="card stat accent">
          <div className="label">Revogados</div>
          <div className="value">{revogados}</div>
          <div className="foot">por solicitação do titular</div>
        </div>
      </div>

      {semTermo > 0 && (
        <div className="card" style={{ borderColor: '#fde68a', background: 'var(--warn-soft)' }}>
          <div className="card-body row-between" style={{ flexWrap: 'wrap', gap: 10 }}>
            <strong>
              {semTermo} paciente(s) ativo(s) sem termo de consentimento vigente
            </strong>
            <button className="btn btn-secondary btn-sm" onClick={() => setFilter('sem')}>
              Ver pendências
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <h3>Controle de consentimentos</h3>
          <span className="badge">{linhas.length} registro(s)</span>
        </div>
        <div className="card-body tight">
          <div className="chip-bar">
            {FILTROS.map((f) => (
              <button
                key={f.id}
                className={`chip ${filter === f.id ? 'active' : ''}`}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
            <button
              className="chip"
              onClick={() => {
                if (!consents.length) {
                  addToast({ type: 'warning', message: 'Nenhum termo para exportar.' });
                  return;
                }
                printConsentReport(consents, patients, ctx);
              }}
            >
              Baixar controle em PDF
            </button>
          </div>

          {loading ? (
            <div className="empty small">Carregando…</div>
          ) : linhas.length === 0 ? (
            <div className="empty">
              <div className="ico">⛨</div>
              <h4>Nenhum registro</h4>
              <p>
                {filter === 'sem'
                  ? 'Todos os pacientes ativos possuem termo vigente.'
                  : 'Nenhum termo neste filtro.'}
              </p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Paciente</th>
                    <th>Tipo</th>
                    <th>Versão</th>
                    <th>Assinado por</th>
                    <th>Data</th>
                    <th>Situação</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {linhas.map(({ patient, consent }) => (
                    <tr key={consent ? consent.id : `sem-${patient.id}`}>
                      <td>
                        <strong>{patient.name}</strong>
                        <div className="small muted">
                          {patient.email || patient.phone || patient.document || '—'}
                        </div>
                      </td>
                      {consent ? (
                        <>
                          <td>{CONSENT_TYPE[consent.type] || consent.type}</td>
                          <td className="nowrap">v{consent.version}</td>
                          <td>{consent.signedBy}</td>
                          <td className="nowrap">{formatDate(consent.signedAt)}</td>
                          <td>
                            <span
                              className={`badge ${(STATUS_BADGE[consent.status] || {}).className || ''}`}
                            >
                              {(STATUS_BADGE[consent.status] || { label: consent.status }).label}
                            </span>
                          </td>
                          <td>
                            <div className="td-actions">
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => printConsent(consent, patient, ctx)}
                              >
                                PDF
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() =>
                                  openModal('view-consent', { consent, patient })
                                }
                              >
                                Ver
                              </button>
                              {consent.status === 'active' && (
                                <button className="btn btn-ghost btn-sm" onClick={() => revogar(consent)}>
                                  Revogar
                                </button>
                              )}
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="muted">—</td>
                          <td className="muted">—</td>
                          <td className="muted">—</td>
                          <td className="muted">—</td>
                          <td>
                            <span className="badge badge-warn">Pendente</span>
                          </td>
                          <td>
                            <div className="td-actions">
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() =>
                                  openModal('consent-form', { patientId: patient.id, onSaved: load })
                                }
                              >
                                Gerar termo
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
