/**
 * Tela de inicio: entrar ou cadastrar-se.
 *
 * O cadastro e em dois passos porque os dados sao de duas naturezas
 * diferentes: quem usa o sistema e a clinica onde ele atende. Pedir tudo de
 * uma vez so produz um formulario longo, e a segunda parte (a clinica) e a
 * que a pessoa quer ver preenchida - as configuracoes dela sao as que
 * aparecem em todo documento impresso.
 *
 * A senha entra guardada como hash (PBKDF2) desde o primeiro momento: o
 * `professionalRepository.save` deriva antes de gravar, entao nem o caminho
 * de cadastro nem o de criacao de equipe guardam a senha em si.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useConfig } from '../store';
import { ArrowRight, Building2, Loader2, ShieldCheck, UserPlus } from 'lucide-react';
import { professionalRepository } from '../repositories';
import { gerarHashSenha, serializarHash } from '../services/CryptoService';

type Cadastro = {
  name: string;
  email: string;
  password: string;
  confirmar: string;
  crp: string;
  role: string;
};

type Clinica = {
  name: string;
  unit: string;
  document: string;
  phone: string;
  email: string;
  address: string;
  responsible: string;
  acronym: string;
  color: string;
};

const CADASTRO_VAZIO: Cadastro = {
  name: '',
  email: '',
  password: '',
  confirmar: '',
  crp: '',
  role: 'Psicólogo(a)',
};

const CLINICA_VAZIA: Clinica = {
  name: '',
  unit: '',
  document: '',
  phone: '',
  email: '',
  address: '',
  responsible: '',
  acronym: '',
  color: '#4f46e5',
};

export function LoginPage() {
  const navigate = useNavigate();
  const { config, updateConfig, loadConfig } = useConfig();
  const entrar = useAuth().login;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Nao mostramos senha nem e-mail de exemplo na tela. Se nao houver nenhum
  // acesso cadastrado, sobra explicar como criar o primeiro.
  const [semAcessos, setSemAcessos] = useState(false);
  const [criando, setCriando] = useState(false);
  const [passo, setPasso] = useState<1 | 2>(1);
  const [pessoa, setPessoa] = useState<Cadastro>(CADASTRO_VAZIO);
  const [clinica, setClinica] = useState<Clinica>(CLINICA_VAZIA);
  const [erro, setErro] = useState('');

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

  const abrirCadastro = () => {
    setCriando(true);
    setPasso(1);
    setErro('');
    setPessoa(CADASTRO_VAZIO);
    setClinica(CLINICA_VAZIA);
  };

  const fecharCadastro = () => {
    setCriando(false);
    setPasso(1);
    setErro('');
  };

  /** Passo 1: valida quem sera o usuario e so entao mostra a clinica. */
  const validarPasso1 = (): boolean => {
    if (!pessoa.name.trim()) return setErro('Informe o nome.'), false;
    if (!pessoa.email.trim()) return setErro('Informe o e-mail.'), false;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pessoa.email.trim())) {
      return setErro('E-mail inválido.'), false;
    }
    if (pessoa.password.length < 6) {
      return setErro('A senha precisa de ao menos 6 caracteres.'), false;
    }
    if (pessoa.password !== pessoa.confirmar) {
      return setErro('As senhas não são iguais.'), false;
    }
    setErro('');
    // o responsavel pela clinica costuma ser a propria pessoa
    setClinica((c) => (c.responsible ? c : { ...c, responsible: pessoa.name.trim() }));
    setPasso(2);
    return true;
  };

  const concluir = async () => {
    if (!clinica.name.trim()) return setErro('Informe o nome da clínica.');

    setLoading(true);
    setErro('');
    try {
      const emailNovo = pessoa.email.trim().toLowerCase();
      const existentes = await professionalRepository.findAll();
      if (existentes.some((p) => p.email?.toLowerCase() === emailNovo)) {
        setErro('Já existe um acesso com este e-mail neste navegador.');
        setPasso(1);
        return;
      }

      // Instalar sem servidor significa uma unica conta que faz tudo: e o
      // cadastro que o sistema promete, entao o acesso nasce completo em vez
      // de obrigar quem sobe a abrir uma tela de permissao.
      const agora = new Date().toISOString();
      await professionalRepository.create({
        name: pessoa.name.trim(),
        email: emailNovo,
        crp: pessoa.crp.trim(),
        role: pessoa.role.trim() || 'Psicólogo(a)',
        active: true,
        admin: true,
        demo: false,
        passwordHash: serializarHash(await gerarHashSenha(pessoa.password)),
        createdAt: agora,
        updatedAt: agora,
      });

      await updateConfig({
        clinic: {
          name: clinica.name.trim(),
          unit: clinica.unit.trim(),
          address: clinica.address.trim(),
          phone: clinica.phone.trim(),
          email: clinica.email.trim(),
          document: clinica.document.trim(),
          responsible: clinica.responsible.trim(),
          website: '',
        },
        brand: { acronym: clinica.acronym.trim().slice(0, 3) },
        // saiu do estado de demonstracao: quem cadastrou a clinica e o caso real
        demo: false,
      });
      await loadConfig();

      const result = await entrar(emailNovo, pessoa.password);
      if (result.success) {
        navigate('/dashboard');
        return;
      }
      setCriando(false);
      setEmail(emailNovo);
      setPassword(pessoa.password);
    } catch (e) {
      console.error('Failed to create account:', e);
      setErro('Não foi possível criar o acesso. Tente novamente.');
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

    const result = await entrar(email, password);
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

        {!semAcessos && !criando && (
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
                onChange={(e) => setEmail(e.currentTarget.value)}
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
                onChange={(e) => setPassword(e.currentTarget.value)}
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

            <button
              type="button"
              className="btn btn-ghost btn-block"
              onClick={abrirCadastro}
              data-testid="abrir-cadastro"
            >
              <UserPlus className="w-4 h-4" />
              Cadastrar-se
            </button>
          </form>
        )}

        {semAcessos && !criando && (
          <div
            className="login-hint"
            style={{ borderColor: '#fde68a', background: 'var(--warn-soft)' }}
          >
            <strong>Nenhum acesso cadastrado neste navegador</strong>
            <p className="small" style={{ margin: '6px 0 10px' }}>
              Ainda não há nenhum usuário. Cadastre-se para começar: em dois passos, seus dados e os
              dados da clínica.
            </p>
            <button className="btn btn-primary btn-sm" onClick={abrirCadastro}>
              <UserPlus className="w-4 h-4 mr-2" /> Cadastrar-se
            </button>
          </div>
        )}

        {criando && (
          <div className="cadastro-steps" data-testid="cadastro">
            <div className="passos-indice" role="status">
              <span className={passo === 1 ? 'ativo' : 'feito'}>
                {passo === 2 ? '1' : '1'} Seus dados
              </span>
              <span className={passo === 2 ? 'ativo' : ''}>2 Dados da clínica</span>
            </div>

            {erro && (
              <p className="form-error" role="alert">
                {erro}
              </p>
            )}

            {passo === 1 && (
              <div className="login-form" data-testid="passo-pessoa">
                <strong>Quem vai usar o sistema</strong>

                <label className="field" htmlFor="first-name">
                  <span>Nome completo *</span>
                  <input
                    type="text"
                    id="first-name"
                    value={pessoa.name}
                    onChange={(e) => setPessoa({ ...pessoa, name: e.currentTarget.value })}
                    placeholder="Como você quer aparecer no sistema"
                    required
                  />
                </label>

                <label className="field" htmlFor="first-email">
                  <span>E-mail de acesso *</span>
                  <input
                    type="email"
                    id="first-email"
                    value={pessoa.email}
                    onChange={(e) => setPessoa({ ...pessoa, email: e.currentTarget.value })}
                    placeholder="nome@clinica.com.br"
                    required
                  />
                </label>

                <label className="field" htmlFor="first-password">
                  <span>Senha * (mínimo 6)</span>
                  <input
                    type="password"
                    id="first-password"
                    value={pessoa.password}
                    onChange={(e) => setPessoa({ ...pessoa, password: e.currentTarget.value })}
                    required
                  />
                </label>

                <label className="field" htmlFor="first-confirmar">
                  <span>Repetir a senha *</span>
                  <input
                    type="password"
                    id="first-confirmar"
                    value={pessoa.confirmar}
                    onChange={(e) => setPessoa({ ...pessoa, confirmar: e.currentTarget.value })}
                    required
                  />
                </label>

                <label className="field" htmlFor="first-crp">
                  <span>CRP</span>
                  <input
                    type="text"
                    id="first-crp"
                    value={pessoa.crp}
                    onChange={(e) => setPessoa({ ...pessoa, crp: e.currentTarget.value })}
                    placeholder="CRP 06/00000"
                  />
                </label>

                <label className="field" htmlFor="first-role">
                  <span>Função</span>
                  <input
                    type="text"
                    id="first-role"
                    value={pessoa.role}
                    onChange={(e) => setPessoa({ ...pessoa, role: e.currentTarget.value })}
                  />
                </label>

                <p className="small muted" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <ShieldCheck className="w-4 h-4" style={{ flexShrink: 0, marginTop: 2 }} />
                  A senha não é guardada: o sistema guarda só um derivado dela, e é esse derivado
                  que compara no login.
                </p>

                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  onClick={validarPasso1}
                  data-testid="passo-continuar"
                >
                  Continuar
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button type="button" className="btn btn-ghost btn-block" onClick={fecharCadastro}>
                  Voltar
                </button>
              </div>
            )}

            {passo === 2 && (
              <div className="login-form" data-testid="passo-clinica">
                <strong>
                  <Building2 className="w-4 h-4" style={{ verticalAlign: -2, marginRight: 6 }} />
                  Sua clínica
                </strong>
                <p className="small muted">
                  Estes dados aparecem no cabeçalho das fichas, nos termos e no rodapé dos
                  documentos. Dá para ajustar depois em Configurações.
                </p>

                <label className="field" htmlFor="cli-name">
                  <span>Nome da clínica *</span>
                  <input
                    type="text"
                    id="cli-name"
                    value={clinica.name}
                    onChange={(e) => setClinica({ ...clinica, name: e.currentTarget.value })}
                    placeholder="ClínicaPsi"
                    required
                  />
                </label>

                <label className="field" htmlFor="cli-unit">
                  <span>Unidade</span>
                  <input
                    type="text"
                    id="cli-unit"
                    value={clinica.unit}
                    onChange={(e) => setClinica({ ...clinica, unit: e.currentTarget.value })}
                    placeholder="Unidade Pinheiros"
                  />
                </label>

                <label className="field" htmlFor="cli-responsible">
                  <span>Responsável técnico</span>
                  <input
                    type="text"
                    id="cli-responsible"
                    value={clinica.responsible}
                    onChange={(e) => setClinica({ ...clinica, responsible: e.currentTarget.value })}
                  />
                </label>

                <label className="field" htmlFor="cli-document">
                  <span>CNPJ / documento</span>
                  <input
                    type="text"
                    id="cli-document"
                    value={clinica.document}
                    onChange={(e) => setClinica({ ...clinica, document: e.currentTarget.value })}
                    placeholder="12.345.678/0001-90"
                  />
                </label>

                <label className="field" htmlFor="cli-phone">
                  <span>Telefone</span>
                  <input
                    type="tel"
                    id="cli-phone"
                    value={clinica.phone}
                    onChange={(e) => setClinica({ ...clinica, phone: e.currentTarget.value })}
                    placeholder="(11) 3000-0000"
                  />
                </label>

                <label className="field" htmlFor="cli-email">
                  <span>E-mail da clínica</span>
                  <input
                    type="email"
                    id="cli-email"
                    value={clinica.email}
                    onChange={(e) => setClinica({ ...clinica, email: e.currentTarget.value })}
                    placeholder="contato@clinica.com.br"
                  />
                </label>

                <label className="field" htmlFor="cli-address">
                  <span>Endereço</span>
                  <input
                    type="text"
                    id="cli-address"
                    value={clinica.address}
                    onChange={(e) => setClinica({ ...clinica, address: e.currentTarget.value })}
                    placeholder="Rua das Acácias, 120 - São Paulo/SP"
                  />
                </label>

                <label className="field" htmlFor="cli-acronym">
                  <span>Sigla (aparece no ícone)</span>
                  <input
                    type="text"
                    id="cli-acronym"
                    maxLength={3}
                    value={clinica.acronym}
                    onChange={(e) => setClinica({ ...clinica, acronym: e.currentTarget.value })}
                    placeholder={pessoa.name.trim().slice(0, 2).toUpperCase() || 'CP'}
                  />
                </label>

                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  onClick={concluir}
                  disabled={loading}
                  data-testid="passo-concluir"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Criando acesso…
                    </>
                  ) : (
                    <>
                      Concluir e entrar
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
                <button type="button" className="btn btn-ghost btn-block" onClick={() => setPasso(1)}>
                  Voltar
                </button>
              </div>
            )}
          </div>
        )}

        {!criando && (
          <p className="small muted center" style={{ marginTop: 14 }}>
            O sistema guarda tudo apenas neste navegador. Nada é enviado para servidores.
          </p>
        )}
      </div>
    </div>
  );
}
