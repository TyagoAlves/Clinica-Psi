import { useState, type FormEvent } from 'react';
import { Download, Save } from 'lucide-react';
import { professionalRepository } from '../../repositories';
import { authService } from '../../services/AuthService';
import { baixarTexto, exportarDadosDoProfissional } from '../../services/DataService';
import { useAuth, useUI } from '../../store';
import { Button } from '../ui';

/**
 * Aba "Meu acesso": o profissional ajusta os proprios dados.
 *
 * `active` e `admin` nao vem do formulario. Vem do registro ja gravado, senao
 * bastaria marcar a caixa de administrador para a propria conta subir de
 * privilegio. Nao ha como um profissional se reativar nem se promover por
 * aqui; isso continua sendo da administracao da equipe.
 */
export function MeuAcessoPanel() {
  const { professional: me, checkAuth } = useAuth();
  const { addToast } = useUI();
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  // os campos de confirmacao so fazem sentido junto de uma nova senha
  const [novaSenha, setNovaSenha] = useState('');
  const temNovaSenha = novaSenha.length > 0;
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');

  if (!me) return null;

  const exportarMeusDados = async () => {
    setExporting(true);
    try {
      const dados = await exportarDadosDoProfissional(me.id);
      baixarTexto(dados.nome, dados.texto);
      addToast({ type: 'success', message: `Arquivo gerado com ${dados.resumo}.` });
    } catch (err) {
      console.error('Failed to export own data:', err);
      addToast({ type: 'error', message: 'Não foi possível exportar seus dados.' });
    } finally {
      setExporting(false);
    }
  };

  const salvar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError('');
    setFieldErrors({});

    const form = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;

    // trocar a senha e o unico campo que mexe em credencial: exige a senha
    // atual, senao quem abrir o aparelho trocaria o acesso da pessoa
    if (form.password) {
      const confere = await authService.confirmarSenha(form.senhaAtual || '');
      if (!confere) {
        setFieldErrors({ senhaAtual: 'Senha incorreta.' });
        return;
      }
      // o campo do formulario chama-se "password"; "senha" nunca chegou aqui
      if (form.password !== form.confirmarSenha) {
        setFieldErrors({ confirmarSenha: 'As senhas não são iguais.' });
        return;
      }
    }

    setSaving(true);
    try {
      const result = await professionalRepository.save({
        id: me.id,
        name: form.name || '',
        email: form.email || '',
        crp: form.crp || '',
        role: form.role || '',
        password: form.password || '',
        active: me.active,
        admin: me.admin,
      });

      if (!result.ok || !result.professional) {
        setFieldErrors(result.campos || {});
        setFormError(result.error || 'Não foi possível salvar.');
        return;
      }

      // a sessão guarda uma copia do profissional: sem isto o menu continuaria
      // mostrando o nome e o e-mail antigos ate recarregar a pagina
      await checkAuth();
      addToast({ type: 'success', message: 'Seus dados foram atualizados.' });
    } catch (err) {
      console.error('Failed to save own profile:', err);
      setFormError('Erro ao salvar seus dados.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={salvar} autoComplete="off">
      <div className="row-between mb-4" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <strong>Meu acesso</strong>
          <div className="small muted">
            Confira seus dados de entrada. O e-mail e a senha são usados para entrar no sistema.
          </div>
        </div>
        <span>
          {me.active ? <span className="badge badge-success">Ativo</span> : <span className="badge">Inativo</span>}{' '}
          {me.admin && <span className="badge badge-primary">Admin</span>}
        </span>
      </div>

      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}

      <div className="form-field">
        <label className="form-label" htmlFor="meu-name">
          Nome completo *
        </label>
        <input
          className={`form-input ${fieldErrors.name ? 'error' : ''}`}
          id="meu-name"
          name="name"
          type="text"
          maxLength={80}
          required
          defaultValue={me.name}
        />
        {fieldErrors.name && <span className="field-erro">{fieldErrors.name}</span>}
      </div>

      <div className="form-row">
        <div className="form-field">
          <label className="form-label" htmlFor="meu-email">
            E-mail *
          </label>
          <input
            className={`form-input ${fieldErrors.email ? 'error' : ''}`}
            id="meu-email"
            name="email"
            type="email"
            maxLength={120}
            required
            defaultValue={me.email}
          />
          {fieldErrors.email && <span className="field-erro">{fieldErrors.email}</span>}
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="meu-crp">
            CRP *
          </label>
          <input
            className={`form-input ${fieldErrors.crp ? 'error' : ''}`}
            id="meu-crp"
            name="crp"
            type="text"
            maxLength={30}
            required
            defaultValue={me.crp}
          />
          {fieldErrors.crp && <span className="field-erro">{fieldErrors.crp}</span>}
        </div>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label className="form-label" htmlFor="meu-role">
            Função
          </label>
          <input
            className={`form-input ${fieldErrors.role ? 'error' : ''}`}
            id="meu-role"
            name="role"
            type="text"
            maxLength={60}
            defaultValue={me.role}
          />
          {fieldErrors.role && <span className="field-erro">{fieldErrors.role}</span>}
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="meu-password">
            Nova senha
          </label>
          <input
            className={`form-input ${fieldErrors.password ? 'error' : ''}`}
            id="meu-password"
            name="password"
            type="password"
            maxLength={40}
            placeholder="Deixe em branco para manter"
            autoComplete="new-password"
            onChange={(e) => setNovaSenha(e.currentTarget.value)}
          />
          {fieldErrors.password && <span className="field-erro">{fieldErrors.password}</span>}
        </div>
      </div>

      {/*
        A senha atual e a confirmacao so aparecem quando ha nova senha: no dia a
        dia o profissional so quer corrigir o nome ou o CRP.
      */}
      {temNovaSenha && (
        <div className="form-row">
          <div className="form-field">
            <label className="form-label" htmlFor="meu-senha-atual">
              Senha atual *
            </label>
            <input
              className={`form-input ${fieldErrors.senhaAtual ? 'error' : ''}`}
              id="meu-senha-atual"
              name="senhaAtual"
              type="password"
              maxLength={40}
              required
              autoComplete="current-password"
            />
            {fieldErrors.senhaAtual && <span className="field-erro">{fieldErrors.senhaAtual}</span>}
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="meu-confirmar-senha">
              Repetir a nova senha *
            </label>
            <input
              className={`form-input ${fieldErrors.confirmarSenha ? 'error' : ''}`}
              id="meu-confirmar-senha"
              name="confirmarSenha"
              type="password"
              maxLength={40}
              required
              autoComplete="new-password"
            />
            {fieldErrors.confirmarSenha && <span className="field-erro">{fieldErrors.confirmarSenha}</span>}
          </div>
        </div>
      )}

      <p className="small muted">
        A senha atual nunca é exibida. Deixe o campo em branco para não alterá-la. Sua situação de acesso e
        seu perfil são definidos por um administrador da clínica.
      </p>

      <div className="mt-6 row">
        <Button type="submit" disabled={saving}>
          <Save className="w-4 h-4 mr-2" /> {saving ? 'Salvando…' : 'Salvar meus dados'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={exportarMeusDados}
          disabled={exporting}
          aria-label="Exportar meus dados"
        >
          <Download className="w-4 h-4 mr-2" /> {exporting ? 'Gerando…' : 'Exportar meus dados'}
        </Button>
      </div>

      <p className="small muted mt-4">
        O arquivo sai em texto, com os pacientes em que você registrou evolução e o conteúdo dessas
        evoluções. Serve para conferir o que está no prontuário ou entregar ao titular.
      </p>
    </form>
  );
}
