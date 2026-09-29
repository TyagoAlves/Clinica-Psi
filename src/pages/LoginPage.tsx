/**
 * Login Page - layout alinhado com a POC
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useConfig } from '../store';
import { Loader2, UserPlus } from 'lucide-react';
import { professionalRepository } from '../repositories';

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { config } = useConfig();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Nao mostramos senha nem e-mail de exemplo na tela. Se nao houver nenhum
  // acesso cadastrado, sobra explicar como criar o primeiro.
  const [semAcessos, setSemAcessos] = useState(false);
  const [criando, setCriando] = useState(false);
  const [primeiro, setPrimeiro] = useState({
    name: '',
    email: '',
    password: '',
    crp: '',
    role: 'Psicólogo(a)',
    admin: true,
  });
  const [erroPrimeiro, setErroPrimeiro] = useState('');

  useEffect(() => {
    let vivo = true;
    professionalRepository
      .findAll()
      .then((lista) => {
        if (vivo) setSemAcessos(lista.length === 0);
      })
      .catch((e) => console.error('Failed to check professionals:', e));
    return () => {
      vivo = false;
    };
  }, []);

  const salvarPrimeiro = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroPrimeiro('');

    if (!primeiro.name.trim()) return setErroPrimeiro('Informe o nome.');
    if (!primeiro.email.trim()) return setErroPrimeiro('Informe o e-mail.');
    if (primeiro.password.length < 6) return setErroPrimeiro('A senha precisa de ao menos 6 caracteres.');

    // So offer a criacao quando nao existe ninguem: nunca e uma rota de
    // escalonamento de privilegio numa instalacao com equipe.
    const existentes = await professionalRepository.findAll();
    if (existentes.length > 0) {
      setSemAcessos(false);
      setErroPrimeiro('Já existe um acesso cadastrado neste navegador.');
      return;
    }

    setLoading(true);
    try {
      await professionalRepository.create({
        name: primeiro.name.trim(),
        email: primeiro.email.trim().toLowerCase(),
        password: primeiro.password,
        crp: primeiro.crp.trim(),
        role: primeiro.role,
        active: true,
        admin: primeiro.admin,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any);
      // o botao promete "criar acesso e entrar", entao entra na sequencia
      const novoEmail = primeiro.email.trim().toLowerCase();
      const result = await login(novoEmail, primeiro.password);
      if (result.success) {
        navigate('/dashboard');
        return;
      }
      setCriando(false);
      setSemAcessos(false);
      setEmail(novoEmail);
      setPassword(primeiro.password);
    } catch (err) {
      console.error('Failed to create first access:', err);
      setErroPrimeiro('Não foi possível criar o acesso. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const systemName = config?.clinic?.name || config?.texts?.systemName || 'Clínica Psi';
  const subtitle = config?.texts?.loginSubtitle || 'Prontuário psicológico';
  const acronym = (config?.brand?.acronym || 'CP').slice(0, 3);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(email, password);
    setLoading(false);

    if (result.success) {
      navigate('/dashboard');
    } else {
      setError(result.error || 'Erro ao entrar');
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-brand">
          <div className="logo">{acronym}</div>
          <div>
            <h1>{systemName}</h1>
            <p>{subtitle}</p>
          </div>
        </div>

        {!semAcessos && (
        <form onSubmit={handleSubmit} className="login-form" autoComplete="off" noValidate>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          <label className="field" htmlFor="email">
            <span>E-mail</span>
            <input
              type="email"
              id="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nome@clinica.com.br"
              required
              autoComplete="email"
              autoFocus
            />
          </label>

          <label className="field" htmlFor="password">
            <span>Senha</span>
            <input
              type="password"
              id="password"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </label>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Entrando...
              </>
            ) : (
              'Entrar'
            )}
          </button>
        </form>
        )}

        {semAcessos && !criando && (
          <div className="login-hint" style={{ borderColor: '#fde68a', background: 'var(--warn-soft)' }}>
            <strong>Nenhum acesso cadastrado neste navegador</strong>
            <p className="small" style={{ margin: '6px 0 10px' }}>
              Não há nenhum usuário ainda, então não é possível entrar. Crie o primeiro acesso para
              começar — ele entra automaticamente como administrador.
            </p>
            <button className="btn btn-primary btn-sm" onClick={() => setCriando(true)}>
              <UserPlus className="w-4 h-4 mr-2" /> Criar primeiro acesso
            </button>
          </div>
        )}

        {semAcessos && criando && (
          <form className="login-form" onSubmit={salvarPrimeiro} autoComplete="off" noValidate>
            <strong>Primeiro acesso</strong>
            {erroPrimeiro && (
              <p className="form-error" role="alert">
                {erroPrimeiro}
              </p>
            )}

            <label className="field" htmlFor="first-name">
              <span>Nome *</span>
              <input
                type="text"
                id="first-name"
                value={primeiro.name}
                onChange={(e) => setPrimeiro({ ...primeiro, name: e.currentTarget.value })}
                placeholder="Seu nome"
                required
              />
            </label>

            <label className="field" htmlFor="first-email">
              <span>E-mail *</span>
              <input
                type="email"
                id="first-email"
                value={primeiro.email}
                onChange={(e) => setPrimeiro({ ...primeiro, email: e.currentTarget.value })}
                placeholder="nome@clinica.com.br"
                required
              />
            </label>

            <label className="field" htmlFor="first-password">
              <span>Senha * (mínimo 6)</span>
              <input
                type="password"
                id="first-password"
                value={primeiro.password}
                onChange={(e) => setPrimeiro({ ...primeiro, password: e.currentTarget.value })}
                required
              />
            </label>

            <label className="field" htmlFor="first-crp">
              <span>CRP</span>
              <input
                type="text"
                id="first-crp"
                value={primeiro.crp}
                onChange={(e) => setPrimeiro({ ...primeiro, crp: e.currentTarget.value })}
                placeholder="CRP 06/00000"
              />
            </label>

            <label className="field" htmlFor="first-role">
              <span>Função</span>
              <input
                type="text"
                id="first-role"
                value={primeiro.role}
                onChange={(e) => setPrimeiro({ ...primeiro, role: e.currentTarget.value })}
              />
            </label>

            <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                id="first-admin"
                checked={primeiro.admin}
                onChange={(e) => setPrimeiro({ ...primeiro, admin: e.currentTarget.checked })}
              />
              <span>Administrador (acessa Configurações)</span>
            </label>

            <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
              {loading ? 'Criando…' : 'Criar acesso e entrar'}
            </button>
            <button type="button" className="btn btn-ghost btn-block" onClick={() => setCriando(false)}>
              Voltar
            </button>
          </form>
        )}

        {semAcessos && !criando && (
          <p className="small muted center" style={{ marginTop: 14 }}>
            O sistema guarda tudo apenas neste navegador. Nada é enviado para servidores.
          </p>
        )}
      </div>
    </div>
  );
}
