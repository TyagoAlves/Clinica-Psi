import { useUI, useConfig, useAuth } from '../store';
import { Button, ModalPortal } from '../components/ui';
import {
  Save,
  RotateCcw,
  Plus,
  ImageUp,
  Trash2,
  UserCog,
  Building2,
  Palette,
  FileText,
  Shield,
  Users,
  Database,
} from 'lucide-react';
import {
  appointmentRepository,
  configRepository,
  consentRepository,
  evolutionRepository,
  professionalRepository,
  DEFAULT_CONSENT_MODELS,
} from '../repositories';
import type { BrandConfig, ClinicConfig, ConsentModels, Professional } from '../domain/types';
import { clinicService } from '../services/ClinicService';
import { lerArquivoComoDataUrl, validarLogo, LOGO_MIME, LOGO_MAX_BYTES } from '../services/DataService';
import { BrandMark, BrandPreview, IdentityPreview } from '../components/config/Previews';
import { DataPanel } from '../components/config/DataPanel';
import { ConsentModelEditor } from '../components/ConsentModelEditor';
import { MeuAcessoPanel } from '../components/config/MeuAcessoPanel';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

/**
 * Abas por papel.
 *
 * Quem nao administra ve apenas "Meu acesso" (os proprios dados) e "Dados"
 * (backup). Identidade, Marca, Textos, Termos LGPD e Equipe sao restritas: sao
 * formulario, preenchimento de dados do sistema e gestao de psicologos.
 */
const ABAS_ADMIN = [
  { id: 'meu-acesso', label: 'Meu acesso', Icone: UserCog },
  { id: 'identidade', label: 'Identidade', Icone: Building2 },
  { id: 'marca', label: 'Marca', Icone: Palette },
  { id: 'textos', label: 'Textos', Icone: FileText },
  { id: 'lgpd', label: 'Termos LGPD', Icone: Shield },
  { id: 'equipe', label: 'Equipe', Icone: Users },
  { id: 'dados', label: 'Dados', Icone: Database },
];

const ABAS_COMUM = [
  { id: 'meu-acesso', label: 'Meu acesso', Icone: UserCog },
  { id: 'dados', label: 'Dados', Icone: Database },
];

const SECTION_LABELS: Record<string, string> = {
  identidade: 'Identidade',
  marca: 'Marca',
  textos: 'Textos',
  lgpd: 'Termos LGPD',
};

export function AdminPage() {
  const { addToast } = useUI();
  const { loadConfig: refreshStoreConfig } = useConfig();
  const { professional: me, isAdmin, checkAuth, logout } = useAuth();
  const [activeTab, setActiveTab] = useState(isAdmin ? 'identidade' : 'meu-acesso');
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<Professional[]>([]);
  const [editingPro, setEditingPro] = useState<Professional | null | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [savingPro, setSavingPro] = useState(false);
  // rascunhos: as previas refletem o que esta sendo digitado, antes de salvar
  const [clinica, setClinica] = useState<ClinicConfig | null>(null);
  const [marca, setMarca] = useState<BrandConfig | null>(null);
  const [versaoTermos, setVersaoTermos] = useState('');
  const [modelos, setModelos] = useState<ConsentModels | null>(null);
  const [logoSobre, setLogoSobre] = useState(false);
  const inputLogo = useRef<HTMLInputElement>(null);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const cfg = await configRepository.get();
      setConfig(cfg);
      setClinica(cfg.clinic);
      setMarca(cfg.brand);
      setVersaoTermos(cfg.consent?.version || '');
      setModelos(cfg.consent?.models || null);
    } catch (e) {
      console.error('Failed to load config:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const setClinic = (campo: keyof ClinicConfig, valor: string) =>
    setClinica((c) => (c ? { ...c, [campo]: valor } : c));
  const setBrand = (campo: keyof BrandConfig, valor: string) =>
    setMarca((b) => (b ? { ...b, [campo]: valor } : b));

  const receberLogo = async (arquivo: File) => {
    const erro = validarLogo(arquivo);
    if (erro) {
      addToast({ type: 'warning', message: erro });
      return;
    }
    try {
      const dataUrl = await lerArquivoComoDataUrl(arquivo);
      setBrand('logo', dataUrl);
      addToast({ type: 'success', message: 'Logo carregada. Clique em Salvar Marca para gravar.' });
    } catch (e) {
      console.error('Failed to read logo:', e);
      addToast({ type: 'error', message: 'Não foi possível ler a imagem.' });
    }
  };

  const restaurarModelos = () => {
    setModelos(DEFAULT_CONSENT_MODELS);
    setVersaoTermos('1.0');
    addToast({ type: 'info', message: 'Modelos originais restaurados. Clique em Salvar para gravar.' });
  };

  const loadTeam = useCallback(async () => {
    try {
      const list = await professionalRepository.findAll({ orderBy: 'name', orderDir: 'asc' });
      setTeam(list);
    } catch (e) {
      console.error('Failed to load team:', e);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (activeTab === 'equipe' && isAdmin) loadTeam();
  }, [activeTab, isAdmin, loadTeam]);

  const handleSave = async (section: string, data: any) => {
    const label = SECTION_LABELS[section] ?? section;
    try {
      let updated;
      switch (section) {
        case 'identidade':
          updated = await configRepository.updateClinic(data);
          break;
        case 'marca':
          updated = await configRepository.updateBrand(data);
          break;
        case 'textos':
          updated = await configRepository.updateTexts(data);
          break;
        case 'lgpd':
          updated = await configRepository.updateConsent(data);
          break;
        default:
          return;
      }

      const { valid, errors } = clinicService.validateConfig(updated);
      if (!valid) {
        addToast({ type: 'warning', message: `Salvo, mas com avisos: ${errors.join('; ')}` });
      } else {
        addToast({ type: 'success', message: `${label} atualizado com sucesso` });
      }
      setConfig(updated);
      // rascunhos acompanham o que foi gravado, para a previa nao divergir
      if (section === 'identidade') setClinica(updated.clinic);
      if (section === 'marca') setMarca(updated.brand);
      if (section === 'lgpd') {
        setVersaoTermos(updated.consent?.version || '');
        setModelos(updated.consent?.models || null);
      }
      // keep the shared store (sidebar, branding, title) in sync
      await refreshStoreConfig();
    } catch (e) {
      console.error('Failed to save:', e);
      addToast({ type: 'error', message: e instanceof Error ? e.message : `Erro ao salvar ${label}` });
    }
  };

  const onSubmitConsent = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!modelos) return;
    if (!versaoTermos.trim()) {
      addToast({ type: 'warning', message: 'Informe a versão dos modelos' });
      return;
    }
    const versao = versaoTermos.trim();
    // a versao global carimba cada modelo: e ela que vai no consentimento
    handleSave('lgpd', {
      version: versao,
      models: {
        treatment: { ...modelos.treatment, version: versao },
        data: { ...modelos.data, version: versao },
      },
    });
  };

  const openProForm = (pro: Professional | null) => {
    setFieldErrors({});
    setFormError('');
    setEditingPro(pro);
  };

  const closeProForm = () => {
    setEditingPro(undefined);
    setFieldErrors({});
    setFormError('');
  };

  const savePro = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError('');
    setFieldErrors({});

    const form = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setSavingPro(true);
    try {
      const result = await professionalRepository.save({
        id: editingPro?.id,
        name: form.name || '',
        email: form.email || '',
        crp: form.crp || '',
        role: form.role || '',
        password: form.password || '',
        active: form.active === 'on',
        admin: form.admin === 'on',
      });

      if (!result.ok || !result.professional) {
        setFieldErrors(result.campos || {});
        setFormError(result.error || 'Não foi possível salvar.');
        return;
      }

      const isSelf = me?.id === result.professional.id;
      closeProForm();
      await loadTeam();

      if (isSelf) {
        await checkAuth();
        addToast({
          type: result.professional.admin ? 'success' : 'warning',
          message: result.professional.admin
            ? 'Seu acesso foi atualizado.'
            : 'Seu acesso não é mais de administrador.',
        });
      } else {
        addToast({
          type: 'success',
          message: editingPro ? 'Profissional atualizado.' : 'Acesso criado.',
        });
      }
    } catch (err) {
      console.error('Failed to save professional:', err);
      setFormError('Erro ao salvar profissional.');
    } finally {
      setSavingPro(false);
    }
  };

  const toggleAccess = async (pro: Professional) => {
    try {
      const nextActive = !pro.active;
      const active = await professionalRepository.countActive();
      const admins = await professionalRepository.countActiveAdmins();

      if (!nextActive && active <= 1) {
        addToast({ type: 'error', message: 'É preciso manter ao menos um profissional ativo.' });
        return;
      }
      if (!nextActive && pro.admin && admins <= 1) {
        addToast({ type: 'error', message: 'É preciso manter ao menos um administrador ativo.' });
        return;
      }

      await professionalRepository.update(pro.id, { active: nextActive });
      await loadTeam();
      addToast({ type: 'success', message: nextActive ? 'Acesso reativado.' : 'Acesso desativado.' });
    } catch (err) {
      console.error('Failed to toggle access:', err);
      addToast({ type: 'error', message: 'Não foi possível alterar o acesso.' });
    }
  };

  const removePro = async (pro: Professional) => {
    if (!window.confirm(`Excluir "${pro.name}" definitivamente?`)) return;

    try {
      const [evos, appts, allConsents] = await Promise.all([
        evolutionRepository.findByProfessional(pro.id),
        appointmentRepository.findByProfessional(pro.id),
        consentRepository.findAll(),
      ]);

      const result = await professionalRepository.removeWithChecks(pro.id, {
        evolutions: evos.length,
        appointments: appts.filter((a) => a.status === 'scheduled' || a.status === 'confirmed').length,
        consents: allConsents.filter((c) => c.registeredBy === pro.id).length,
      });

      if (!result.ok) {
        addToast({ type: 'error', message: result.error || 'Não foi possível excluir.' });
        return;
      }

      // sair com os acessos padrao significa ambiente de teste: avisa e libera
      // a limpeza total de dados
      if (pro.demo === true && !config?.homologacao) {
        await clinicService.setHomologacao(true);
        await refreshStoreConfig();
        addToast({
          type: 'info',
          message:
            'Acesso de demonstração removido: o sistema entrou em modo homologação. ' +
            'A limpeza de dados em Configurações › Dados ficou liberada.',
        });
      }

      await loadTeam();
      addToast({ type: 'success', message: 'Profissional excluído.' });
    } catch (err) {
      console.error('Failed to remove professional:', err);
      addToast({ type: 'error', message: 'Erro ao excluir profissional.' });
    }
  };

  if (loading) return <div className="card"><div className="empty small">Carregando…</div></div>;

  const tabs = isAdmin ? ABAS_ADMIN : ABAS_COMUM;
  /**
   * Nao confia no `activeTab` para esconder o conteudo restrito: se sobrar uma
   * aba de administrador no estado, ela cai para a primeira liberada em vez de
   * abrir um formulario que nao deveria aparecer.
   */
  const abaAtual = tabs.some((t) => t.id === activeTab) ? activeTab : tabs[0].id;

  return (
    <div>
      <div className="card">
        <div className="tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`tab ${abaAtual === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <tab.Icone className="w-4 h-4 mr-2" />
              {tab.label}
            </button>
          ))}
        </div>

        {!isAdmin && (
          <p className="small muted" style={{ padding: '0 20px 16px' }}>
            Você tem acesso ao backup do sistema e aos seus próprios dados. Configurações da clínica,
            textos, termos e equipe são exclusivos de administradores.
          </p>
        )}

        <div className="card-body">
          {isAdmin && abaAtual === 'equipe' && (
            <div>
              <div className="row-between" style={{ marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <strong>Equipe</strong>
                  <div className="small muted">
                    Troque os acessos quando a empresa mudar de nome, profissional ou e-mail. Senhas ficam em
                    texto no navegador: use apenas para demonstração.
                  </div>
                </div>
                <Button type="button" onClick={() => openProForm(null)}>
                  <Plus className="w-4 h-4 mr-2" /> Novo profissional
                </Button>
              </div>

              {team.length === 0 ? (
                <div className="empty">
                  <div className="ico">⛃</div>
                  <h4>Nenhum profissional cadastrado</h4>
                  <p>Crie o primeiro acesso para a equipe.</p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Profissional</th>
                        <th>E-mail</th>
                        <th>CRP</th>
                        <th>Situação</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {team.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <strong>{p.name}</strong>
                            <div className="small muted">{p.role || '-'}</div>
                          </td>
                          <td className="nowrap">{p.email}</td>
                          <td className="nowrap">{p.crp || '-'}</td>
                          <td>
                            <span className={`badge ${p.active ? 'badge-success' : ''}`}>
                              {p.active ? 'Ativo' : 'Inativo'}
                            </span>{' '}
                            {p.admin && <span className="badge badge-primary">Admin</span>}{' '}
                            {p.id === me?.id && <span className="badge">Você</span>}
                          </td>
                          <td>
                            <div className="td-actions">
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => openProForm(p)}
                              >
                                Editar
                              </button>
                              {p.id === me?.id ? (
                                <button
                                  className="btn btn-ghost btn-sm"
                                  disabled
                                  title="Você não pode desativar o próprio acesso"
                                >
                                  Desativar
                                </button>
                              ) : (
                                <>
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => toggleAccess(p)}
                                  >
                                    {p.active ? 'Desativar' : 'Reativar'}
                                  </button>
                                  <button
                                    className="btn btn-danger btn-sm"
                                    onClick={() => removePro(p)}
                                  >
                                    Excluir
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="small muted mt-16">
                Somente administradores veem este painel. Você não pode desativar nem excluir o próprio
                acesso, e o sistema mantém ao menos um profissional e um administrador ativos.
              </p>
            </div>
          )}

          {isAdmin && abaAtual === 'identidade' && config && clinica && (
            <form onSubmit={e => { e.preventDefault(); handleSave('identidade', clinica); }}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="form-label" htmlFor="clinic-name">Nome da Clínica *</label>
                  <input id="clinic-name" type="text" className="form-input" required value={clinica.name || ''} onChange={e => setClinic('name', e.currentTarget.value)} />
                </div>
                <div>
                  <label className="form-label" htmlFor="clinic-unit">Unidade *</label>
                  <input id="clinic-unit" type="text" className="form-input" required value={clinica.unit || ''} onChange={e => setClinic('unit', e.currentTarget.value)} />
                </div>
                <div>
                  <label className="form-label" htmlFor="clinic-address">Endereço</label>
                  <input id="clinic-address" type="text" className="form-input" value={clinica.address || ''} onChange={e => setClinic('address', e.currentTarget.value)} />
                </div>
                <div>
                  <label className="form-label" htmlFor="clinic-phone">Telefone *</label>
                  <input id="clinic-phone" type="text" className="form-input" required value={clinica.phone || ''} onChange={e => setClinic('phone', e.currentTarget.value)} />
                </div>
                <div>
                  <label className="form-label" htmlFor="clinic-email">E-mail</label>
                  <input id="clinic-email" type="email" className="form-input" value={clinica.email || ''} onChange={e => setClinic('email', e.currentTarget.value)} />
                </div>
                <div>
                  <label className="form-label" htmlFor="clinic-website">Site</label>
                  <input id="clinic-website" type="url" className="form-input" value={clinica.website || ''} onChange={e => setClinic('website', e.currentTarget.value)} />
                </div>
                <div>
                  <label className="form-label" htmlFor="clinic-document">CNPJ/CPF</label>
                  <input id="clinic-document" type="text" className="form-input" value={clinica.document || ''} onChange={e => setClinic('document', e.currentTarget.value)} />
                </div>
                <div>
                  <label className="form-label" htmlFor="clinic-responsible">Responsável</label>
                  <input id="clinic-responsible" type="text" className="form-input" value={clinica.responsible || ''} onChange={e => setClinic('responsible', e.currentTarget.value)} />
                </div>
              </div>
              <div className="mt-6">
                <Button type="submit"><Save className="w-4 h-4 mr-2" /> Salvar Identidade</Button>
              </div>
              {config.brand && config.texts && (
                <div className="mt-6">
                  <IdentityPreview clinic={clinica} brand={config.brand} texts={config.texts} />
                </div>
              )}
            </form>
          )}

          {isAdmin && abaAtual === 'marca' && config && marca && (
            <form onSubmit={e => { e.preventDefault(); handleSave('marca', marca); }}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="form-label" htmlFor="brand-acronym">Sigla (até 3 letras)</label>
                  <input id="brand-acronym" type="text" maxLength={3} className="form-input" value={marca.acronym || ''} onChange={e => setBrand('acronym', e.currentTarget.value)} />
                </div>
                <div>
                  <label className="form-label" htmlFor="brand-primary">Cor Principal</label>
                  <input id="brand-primary" type="color" className="form-input h-10 w-20" value={marca.primaryColor || '#4f46e5'} onChange={e => setBrand('primaryColor', e.currentTarget.value)} />
                </div>
                <div>
                  <label className="form-label" htmlFor="brand-secondary">Cor Secundária</label>
                  <input id="brand-secondary" type="color" className="form-input h-10 w-20" value={marca.secondaryColor || '#7c3aed'} onChange={e => setBrand('secondaryColor', e.currentTarget.value)} />
                </div>
              </div>

              <div className="mt-6">
                <label className="form-label">Logo da clínica</label>
                <span className="form-hint">
                  PNG, JPG, WebP ou SVG de até {Math.round(LOGO_MAX_BYTES / 1024)} KB. A imagem fica
                  neste navegador (data URL) e aparece no login, na barra lateral e nos PDFs.
                </span>

                <div
                  className={`logo-upload mt-6${logoSobre ? ' over' : ''}`}
                  onDragOver={e => { e.preventDefault(); setLogoSobre(true); }}
                  onDragLeave={() => setLogoSobre(false)}
                  onDrop={e => {
                    e.preventDefault();
                    setLogoSobre(false);
                    const arquivo = e.dataTransfer.files?.[0];
                    if (arquivo) receberLogo(arquivo);
                  }}
                >
                  <div className="logo-preview">
                    <BrandMark brand={marca} />
                  </div>
                  {marca.logo ? (
                    <>
                      <div className="small muted" style={{ marginBottom: 10 }}>
                        Logo atual ({Math.round((marca.logo.length * 0.75) / 1024)} KB)
                      </div>
                      <div className="row" style={{ justifyContent: 'center' }}>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => inputLogo.current?.click()}
                        >
                          <ImageUp className="w-4 h-4 mr-2" /> Trocar arquivo
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => setBrand('logo', '')}
                        >
                          <Trash2 className="w-4 h-4 mr-2" /> Remover logo
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="small muted" style={{ marginBottom: 10 }}>
                        Arraste a imagem aqui ou
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => inputLogo.current?.click()}
                      >
                        <ImageUp className="w-4 h-4 mr-2" /> Escolher arquivo
                      </Button>
                      <div className="small muted" style={{ marginTop: 8 }}>
                        Sem logo, usamos a sigla com as cores acima.
                      </div>
                    </>
                  )}
                </div>
                <input
                  ref={inputLogo}
                  type="file"
                  className="sr-only"
                  accept={LOGO_MIME.join(',')}
                  aria-label="Arquivo do logo"
                  onChange={e => {
                    const arquivo = e.currentTarget.files?.[0];
                    if (arquivo) receberLogo(arquivo);
                    e.currentTarget.value = '';
                  }}
                />
              </div>

              <div className="mt-6">
                <Button type="submit"><Save className="w-4 h-4 mr-2" /> Salvar Marca</Button>
              </div>

              {config.clinic && config.texts && (
                <div className="mt-6 stack">
                  <BrandPreview brand={marca} clinic={config.clinic} texts={config.texts} />
                </div>
              )}
            </form>
          )}

          {isAdmin && abaAtual === 'textos' && config && (
            <form onSubmit={e => { e.preventDefault(); handleSave('textos', Object.fromEntries(new FormData(e.currentTarget))); }}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="form-label" htmlFor="text-system-name">Nome do Sistema *</label>
                  <input id="text-system-name" name="systemName" type="text" defaultValue={config.texts?.systemName} className="form-input" required />
                </div>
                <div>
                  <label className="form-label" htmlFor="text-login-subtitle">Subtítulo do Login</label>
                  <input id="text-login-subtitle" name="loginSubtitle" type="text" defaultValue={config.texts?.loginSubtitle} className="form-input" />
                </div>
                <div className="md:col-span-2">
                  <label className="form-label" htmlFor="text-footer">Rodapé</label>
                  <textarea id="text-footer" name="footer" className="form-textarea" defaultValue={config.texts?.footer} rows={3} />
                </div>
                <div className="md:col-span-2">
                  <label className="form-label" htmlFor="text-lgpd-notice">Aviso LGPD</label>
                  <textarea id="text-lgpd-notice" name="lgpdNotice" className="form-textarea" defaultValue={config.texts?.lgpdNotice} rows={3} />
                </div>
              </div>
              <div className="mt-6">
                <Button type="submit"><Save className="w-4 h-4 mr-2" /> Salvar Textos</Button>
              </div>
            </form>
          )}

          {isAdmin && abaAtual === 'lgpd' && config && modelos && (
            <form onSubmit={onSubmitConsent}>
              <div className="row-between mb-4" style={{ alignItems: 'flex-end' }}>
                <div style={{ flex: 1, maxWidth: 260 }}>
                  <label className="form-label" htmlFor="consent-version">Versão dos Modelos *</label>
                  <input
                    id="consent-version"
                    type="text"
                    className="form-input"
                    required
                    placeholder="1.0"
                    value={versaoTermos}
                    onChange={e => setVersaoTermos(e.currentTarget.value)}
                  />
                </div>
                <Button type="button" variant="secondary" size="sm" onClick={restaurarModelos}>
                  <RotateCcw className="w-4 h-4 mr-2" /> Restaurar modelos originais
                </Button>
              </div>

              <div className="small muted mb-4">
                Os modelos são usados no prontuário do paciente. Cada termo já assinado guarda uma cópia
                congelada do texto: editar aqui não muda documentos antigos.
              </div>

              <ConsentModelEditor models={modelos} config={config} onChange={setModelos} />

              <div className="mt-6">
                <Button type="submit"><Save className="w-4 h-4 mr-2" /> Salvar Modelos LGPD</Button>
              </div>
            </form>
          )}

          {abaAtual === 'meu-acesso' && <MeuAcessoPanel />}

          {abaAtual === 'dados' && (
            <DataPanel
              somenteBackup={!isAdmin}
              onReautenticar={async () => { await logout(); }}
              onAviso={(tipo, mensagem) => addToast({ type: tipo, message: mensagem })}
            />
          )}
        </div>
      </div>

      {editingPro !== undefined && (
        <ModalPortal
          isOpen
          onClose={closeProForm}
          title={editingPro ? 'Editar profissional' : 'Novo profissional'}
        >
          <form id="pro-form" onSubmit={savePro} autoComplete="off">
            {formError && (
              <p className="form-error" role="alert">
                {formError}
              </p>
            )}

            <div className="form-field">
              <label className="form-label" htmlFor="pro-name">
                Nome completo *
              </label>
              <input
                className={`form-input ${fieldErrors.name ? 'error' : ''}`}
                id="pro-name"
                name="name"
                type="text"
                maxLength={80}
                required
                autoFocus
                defaultValue={editingPro?.name || ''}
              />
              {fieldErrors.name && <span className="field-erro">{fieldErrors.name}</span>}
            </div>

            <div className="form-row">
              <div className="form-field">
                <label className="form-label" htmlFor="pro-email">
                  E-mail *
                </label>
                <input
                  className={`form-input ${fieldErrors.email ? 'error' : ''}`}
                  id="pro-email"
                  name="email"
                  type="email"
                  maxLength={120}
                  required
                  defaultValue={editingPro?.email || ''}
                />
                {fieldErrors.email && <span className="field-erro">{fieldErrors.email}</span>}
              </div>
              <div className="form-field">
                <label className="form-label" htmlFor="pro-crp">
                  CRP *
                </label>
                <input
                  className={`form-input ${fieldErrors.crp ? 'error' : ''}`}
                  id="pro-crp"
                  name="crp"
                  type="text"
                  maxLength={30}
                  required
                  defaultValue={editingPro?.crp || ''}
                />
                {fieldErrors.crp && <span className="field-erro">{fieldErrors.crp}</span>}
              </div>
            </div>

            <div className="form-row">
              <div className="form-field">
                <label className="form-label" htmlFor="pro-role">
                  Função
                </label>
                <input
                  className={`form-input ${fieldErrors.role ? 'error' : ''}`}
                  id="pro-role"
                  name="role"
                  type="text"
                  maxLength={60}
                  defaultValue={editingPro?.role || ''}
                />
                {fieldErrors.role && <span className="field-erro">{fieldErrors.role}</span>}
              </div>
              <div className="form-field">
                <label className="form-label" htmlFor="pro-password">
                  {editingPro ? 'Nova senha (opcional)' : 'Senha *'}
                </label>
                <input
                  className={`form-input ${fieldErrors.password ? 'error' : ''}`}
                  id="pro-password"
                  name="password"
                  type="password"
                  maxLength={40}
                  required={!editingPro}
                  placeholder={editingPro ? 'Deixe em branco para manter' : 'mínimo de 4 caracteres'}
                />
                {fieldErrors.password && <span className="field-erro">{fieldErrors.password}</span>}
              </div>
            </div>

            <div className="form-field">
              <label className="form-check" htmlFor="pro-active">
                <input
                  id="pro-active"
                  name="active"
                  type="checkbox"
                  defaultChecked={editingPro ? editingPro.active : true}
                />
                Acesso ativo
              </label>
              {fieldErrors.active && <span className="field-erro">{fieldErrors.active}</span>}
            </div>

            <div className="form-field">
              <label className="form-check" htmlFor="pro-admin">
                <input
                  id="pro-admin"
                  name="admin"
                  type="checkbox"
                  defaultChecked={editingPro?.admin === true}
                />
                Administrador (acessa Configurações)
              </label>
              {fieldErrors.admin && <span className="field-erro">{fieldErrors.admin}</span>}
            </div>

            {editingPro && (
              <p className="small muted">
                A senha atual nunca é exibida. Deixe o campo em branco para não alterá-la.
              </p>
            )}

            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={closeProForm}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={savingPro}>
                {savingPro ? 'Salvando…' : editingPro ? 'Salvar alterações' : 'Criar acesso'}
              </button>
            </div>
          </form>
        </ModalPortal>
      )}
    </div>
  );
}