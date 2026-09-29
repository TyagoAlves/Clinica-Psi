/**
 * Ajuda - o roteiro do sistema em texto, para consultar quando precisar.
 *
 * O tour ensina o caminho destacando os elementos reais da tela; esta
 * pagina e o contrario: fica parada, serve de busca e cobre o mesmo terreno
 * com mais calma. Nao entra aqui nada de administracao de equipe nem de
 * configuracao da clinica - quem usa o dia a dia nao precisa ver isso, e a
 * unica pessoa que mexe nessas telas ja sabe.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Users, FileText, Calendar, Stethoscope, Shield,
  BarChart3, Search, Sparkles, HelpCircle,
} from 'lucide-react';
import { refazerTour } from '../services/TourService';

type Secao = {
  id: string;
  titulo: string;
  icone: LucideIcon;
  resumo: string;
  itens?: string[];
  cartoes?: { titulo: string; texto: string }[];
  dica?: string;
};

const SECOES: Secao[] = [
  {
    id: 'painel',
    titulo: 'Painel',
    icone: LayoutDashboard,
    resumo: 'A primeira tela mostra o resumo do dia e o que pede atenção.',
    cartoes: [
      { titulo: 'Cartões do topo', texto: 'Totais de pacientes, evoluções, sessões de hoje e termos LGPD.' },
      { titulo: 'Próximos atendimentos', texto: 'Hora e paciente de cada sessão do dia. Clique para abrir o prontuário.' },
    ],
  },
  {
    id: 'pacientes',
    titulo: 'Pacientes',
    icone: Users,
    resumo: 'O cadastro de quem está em acompanhamento.',
    itens: [
      'Busque pelo nome ou documento no campo de busca.',
      'Os filtros separam quem está em tratamento, pausado ou encerrado.',
      'O botão "Novo paciente" abre o formulário de cadastro.',
      'Clicar no cartão abre o prontuário daquele paciente.',
    ],
    dica: 'O status importa: paciente pausado não aparece nas pendências de LGPD.',
  },
  {
    id: 'prontuario',
    titulo: 'Prontuário e evoluções',
    icone: FileText,
    resumo: 'O histórico clínico de cada paciente, escrito por sessão.',
    itens: [
      'A aba de dados cadastrais guarda contato, documento e serviço em atendimento.',
      'Cada evolução registra o que foi trabalhado na sessão.',
      'Escreva a evolução, salve, e o prontuário completo pode virar PDF.',
      'O botão "Gerar PDF" monta o documento pronto para imprimir.',
    ],
    dica: 'Nada é apagado do prontuário: o histórico do paciente é preservado.',
  },
  {
    id: 'agenda',
    titulo: 'Agenda',
    icone: Calendar,
    resumo: 'Os horários de atendimento, organizados por dia.',
    itens: [
      'Use os filtros de data e profissional para achatar a visão.',
      'Clique em um horário livre para agendar.',
      'Clique em um agendamento existente para reagendar, remarcar ou cancelar.',
      'Sessão confirmada e realizada aparecem com cores diferentes.',
    ],
  },
  {
    id: 'servicos',
    titulo: 'Serviços',
    icone: Stethoscope,
    resumo: 'Os tipos de atendimento que a clínica oferece.',
    itens: [
      'Cada serviço tem nome, duração e preço.',
      'O serviço fica vinculado ao paciente, e o preço alimenta os relatórios.',
      'Desativar um serviço esconde das seleções novas sem apagar o histórico.',
    ],
  },
  {
    id: 'lgpd',
    titulo: 'LGPD e consentimentos',
    icone: Shield,
    resumo: 'O registro de quem autorizou o tratamento e o uso de dados.',
    itens: [
      'Cada termo é assinado por uma pessoa e fica congelado: editar o modelo depois não muda documentos já assinados.',
      'Há dois modelos: consentimento de tratamento e aviso de uso de dados.',
      'O paciente assina como titular ou como responsável por menor.',
      'Quando o titular revoga, o termo passa a constar como revogado, sem apagar o histórico.',
    ],
    dica: 'A página de LGPD mostra quem está sem termo vigente — é a sua lista de pendências.',
  },
  {
    id: 'relatorios',
    titulo: 'Relatórios',
    icone: BarChart3,
    resumo: 'Documentos prontos para gerar em PDF.',
    itens: [
      'Escolha o tipo de documento e o paciente ou período.',
      'Prontuário reúne cadastro, evoluções e termos do paciente.',
      'O controle LGPD lista todos os termos com situação e data.',
      'A lista de frequência mostra atendimentos por status.',
    ],
  },
  {
    id: 'onde-ficam',
    titulo: 'Onde os dados ficam',
    icone: HelpCircle,
    resumo: 'Entender o que é local e o que sai daqui importa para responder ao titular.',
    itens: [
      'Tudo é salvo apenas neste navegador, sem servidor e sem internet.',
      'Use um e-mail individual e não senha compartilhada: quem tem o aparelho tem acesso.',
      'Para migrar para outro computador, faça o backup e restaure no destino.',
      'Limpando o histórico do navegador, tudo se perde. Faça backup antes de mexer nisso.',
    ],
  },
];

function normalizar(t: string): string {
  return t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function AjudaPage() {
  const [busca, setBusca] = useState('');
  const [ativa, setAtiva] = useState(SECOES[0].id);
  const [refazendo, setRefazendo] = useState(false);
  const navigate = useNavigate();
  const corpoRef = useRef<HTMLDivElement>(null);

  const termo = normalizar(busca.trim());
  const visiveis = useMemo(
    () =>
      !termo
        ? SECOES
        : SECOES.filter((s) =>
            normalizar(
              [s.titulo, s.resumo, ...(s.itens || []), ...(s.cartoes || []).map((c) => `${c.titulo} ${c.texto}`), s.dica || ''].join(' ')
            ).includes(termo)
          ),
    [termo]
  );

  // busca sem resultado: limpa a secao ativa para nao apontar para algo invisivel
  useEffect(() => {
    if (visiveis.length > 0 && !visiveis.some((s) => s.id === ativa)) {
      setAtiva(visiveis[0].id);
    }
  }, [visiveis, ativa]);

  const irPara = (id: string) => {
    setAtiva(id);
    corpoRef.current?.querySelector(`#${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const refazer = async () => {
    setRefazendo(true);
    await refazerTour();
    navigate('/dashboard');
    setRefazendo(false);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Ajuda</h1>
          <p className="muted">Como usar o sistema, área por área</p>
        </div>
        <button className="btn btn-secondary" onClick={() => void refazer()} disabled={refazendo}>
          <Sparkles className="w-4 h-4" /> {refazendo ? 'Abrindo...' : 'Refazer o tour'}
        </button>
      </div>

      <div className="ajuda">
        <aside className="ajuda-lateral">
          <div className="ajuda-busca">
            <label className="sr-only" htmlFor="ajuda-busca">
              Buscar na ajuda
            </label>
            <div className="search">
              <input
                id="ajuda-busca"
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.currentTarget.value)}
                placeholder="Buscar na ajuda..."
              />
            </div>
          </div>

          <nav className="ajuda-lista">
            {visiveis.map((s) => {
              const Icone = s.icone;
              return (
                <button
                  key={s.id}
                  className={`ajuda-link ${ativa === s.id ? 'active' : ''}`}
                  onClick={() => irPara(s.id)}
                >
                  <Icone className="w-4 h-4" /> {s.titulo}
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="ajuda-conteudo" ref={corpoRef}>
          {visiveis.length === 0 ? (
            <div className="ajuda-vazio">
              <Search className="w-8 h-8" style={{ opacity: 0.4, margin: '0 auto 10px' }} />
              Nada encontrado para <strong>"{busca}"</strong>.
            </div>
          ) : (
            visiveis.map((s) => {
              const Icone = s.icone;
              return (
                <section key={s.id} id={s.id} className="ajuda-secao">
                  <h2>
                    <Icone className="w-5 h-5" /> {s.titulo}
                  </h2>
                  <p>{s.resumo}</p>

                  {s.cartoes && (
                    <div className="ajuda-cartoes">
                      {s.cartoes.map((c) => (
                        <div key={c.titulo} className="ajuda-cartao">
                          <h3>{c.titulo}</h3>
                          <p>{c.texto}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {s.itens && (
                    <ul className="ajuda-lista-itens">
                      {s.itens.map((i) => (
                        <li key={i}>{i}</li>
                      ))}
                    </ul>
                  )}

                  {s.dica && (
                    <div className="ajuda-dica">
                      <strong>Dica:</strong> {s.dica}
                    </div>
                  )}
                </section>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
