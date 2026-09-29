/**
 * TourService - roteiro do tour guiado e o progresso no cache.
 *
 * Diferente da apresentacao antiga (um modal estatico com o texto inteiro), o
 * tour aponta para o elemento real de cada tela: o passo carrega um seletor CSS
 * e o componente destaca aquele pedaco da tela enquanto o texto explica. Por
 * isso o roteiro fica aqui, separado do componente.
 *
 * O estado mora em `clinica-psi-tour`, separado das chaves de dominio: e estado
 * de interface, nao dado da clinica.
 */

import { storage } from '../adapters';

export const TOUR_KEY = 'tour';

export type TourPasso = {
  /** Rota para onde o tour navega. Vazio = fica na tela atual. */
  rota: string;
  /** Seletor CSS do elemento a destacar. Vazio = destaca a tela inteira. */
  alvo?: string;
  titulo: string;
  texto: string;
  /** Onde o tooltip tenta ficar em relacao ao elemento. */
  lado?: 'baixo' | 'cima' | 'direita' | 'esquerda' | 'centro';
};

export type TourEstado = {
  /** true depois de chegar ao fim ou pular. */
  concluido: boolean;
  concluidoEm?: string;
  /** Ultimo passo visto, para retomar de onde parou. */
  passo: number;
};

const INICIAL: TourEstado = { concluido: false, passo: 0 };

/**
 * Roteiro. A ordem conta a historia do trabalho clinico: como o dia comeca
 * (painel), quem atendo (pacientes), o que registro (prontuario/evolucao),
 * quando (agenda), quanto custa (servicos), o que o titular assinou (LGPD) e o
 * que exporto (relatorios).
 *
 * Nao entra aqui nada de administracao de equipe: essa parte fica em
 * Configuracoes, que so o admin ve, e a ajuda tambem nao cobre.
 */
export const PASSOS: TourPasso[] = [
  {
    rota: '/dashboard',
    alvo: '.stats',
    titulo: 'Seu dia começa aqui',
    texto:
      'Estes cartões mostram o tamanho da carteira e o que aconteceu hoje. Logo abaixo, a lista de próximos atendimentos leva direto ao prontuário de quem você vai atender.',
  },
  {
    rota: '/dashboard',
    alvo: '.sidebar',
    titulo: 'A navegação fica sempre à mão',
    texto:
      'Estas são as telas do dia a dia, nesta ordem de uso. A ajuda completa fica no mesmo menu, no fim da lista.',
  },
  {
    rota: '/patients',
    alvo: '.page-header',
    titulo: 'A carteira de pacientes',
    texto:
      'Busque pelo nome ou documento. Os filtros separam quem está em tratamento, pausado ou encerrado — e pausado não conta como pendência de LGPD.',
  },
  {
    rota: '/patients',
    alvo: '.patient-card',
    titulo: 'Clicar no cartão abre o prontuário',
    texto:
      'O cartão mostra nome, serviço em atendimento e status. Clicando, você entra na ficha completa daquele paciente. Este é o caminho mais usado do sistema.',
  },
  {
    rota: '/patients',
    alvo: '.page-header',
    lado: 'baixo',
    titulo: 'Cadastrar é o botão ao lado',
    texto:
      'Quando o paciente é novo, use "Novo paciente". Ele entra como em tratamento e já aparece na agenda e no painel.',
  },
  {
    rota: '/agenda',
    titulo: 'A agenda do dia',
    lado: 'centro',
    texto:
      'Os horários ficam organizados por dia. Clique num espaço livre para agendar e num agendamento existente para remarcar, reagendar ou cancelar. use os filtros para ver só a sua agenda.',
  },
  {
    rota: '/agenda',
    alvo: '.day-nav, .calendar-nav, .page-header',
    lado: 'baixo',
    titulo: 'Navegar entre os dias',
    texto:
      'As setas trocam o dia exibido. A sessão confirmada e a realizada aparecem com cores diferentes, então dá para ver rapidinho o que ainda está por acontecer.',
  },
  {
    rota: '/services',
    alvo: 'table.data',
    titulo: 'Serviços definem preço e duração',
    texto:
      'Cada tipo de atendimento tem preço e duração. O serviço escolhido no cadastro do paciente é o que entra nos relatórios. Desativar esconde das seleções novas sem apagar o histórico.',
  },
  {
    rota: '/evolution',
    titulo: 'Registro de evolução',
    lado: 'centro',
    texto:
      'É esta tela onde você escreve o que foi trabalhado na sessão. Salve ao final de cada atendimento: o prontuário é montado a partir daqui. Você chega aqui pelo botão "Nova evolução", no prontuário do paciente.',
  },
  {
    rota: '/lgpd',
    titulo: 'Consentimentos: a lista de pendências',
    lado: 'centro',
    texto:
      'Aqui ficam os termos assinados. O que já está assinado pode ser revogado, mas não some — o histórico é preservado. A coluna de situação mostra quem ainda não assinou a versão vigente.',
  },
  {
    rota: '/reports',
    titulo: 'Documentos prontos para gerar',
    lado: 'centro',
    texto:
      'Escolha o documento e o paciente ou período. O prontuário reúne cadastro, evoluções e termos; o controle LGPD lista a situação de todos. Tudo sai em PDF.',
  },
  {
    rota: '/reports',
    alvo: 'table.data, .card',
    lado: 'baixo',
    titulo: 'Gerar é só escolher e exportar',
    texto:
      'Nada é enviado para lugar nenhum: o PDF é montado no seu navegador. Se precisar de um documento específico, escolha o tipo antes de gerar.',
  },
];

export async function lerTour(): Promise<TourEstado> {
  const bruto = await storage.get<Partial<TourEstado>>(TOUR_KEY);
  if (!bruto || typeof bruto !== 'object') return { ...INICIAL };
  return {
    concluido: bruto.concluido === true,
    concluidoEm: typeof bruto.concluidoEm === 'string' ? bruto.concluidoEm : undefined,
    passo: typeof bruto.passo === 'number' && bruto.passo >= 0 ? bruto.passo : 0,
  };
}

/** Grava o progresso a cada passo, entao um recarregar nao reinicia do zero. */
export async function salvarPasso(passo: number): Promise<void> {
  const atual = await lerTour();
  await storage.set(TOUR_KEY, { ...atual, passo });
}

export async function concluir(): Promise<void> {
  await storage.set(TOUR_KEY, {
    concluido: true,
    concluidoEm: new Date().toISOString(),
    passo: 0,
  });
}

/** Usado pelo botao "Refazer o tour" da ajuda. */
export async function reiniciar(): Promise<void> {
  await storage.set(TOUR_KEY, { ...INICIAL });
}

/* ------------------------------------------------------------------ */
/* sinal de "refazer o tour"                                            */
/* ------------------------------------------------------------------ */

/**
 * O componente so consulta o estado no primeiro acesso, entao limpar a chave
 * nao bastaria para reabrir. A ajuda avisa por aqui.
 */
type Ouvinte = () => void;
const ouvintes = new Set<Ouvinte>();

export function aoPedirTour(fn: Ouvinte): () => void {
  ouvintes.add(fn);
  return () => {
    ouvintes.delete(fn);
  };
}

/** Zera o progresso e pede para o tour abrir, de onde o usuario estiver. */
export async function refazerTour(): Promise<void> {
  await reiniciar();
  ouvintes.forEach((fn) => fn());
}
