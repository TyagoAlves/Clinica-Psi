/**
 * Compartilhamento de configuracoes entre pessoas.
 *
 * O caso de uso: uma clinica com dois ou mais psicologos no mesmo computador,
 * ou o mesmo escritorio em dois lugares. Um preenche identidade, marca, textos
 * e termos, e manda o arquivo. O outro importa e ja entra com tudo aquilo
 * preenchido, em vez de digitar de novo.
 *
 * O que viaja no arquivo e so configuracao: identidade da clinica, marca,
 * textos da interface, modelos de termo de consentimento e a lista de servicos
 * oferecidos. Nada de paciente: nao entra prontuario, evolucao, agendamento,
 * termo registrado nem dado de acesso de ninguem. Quem manda o arquivo entrega
 * a identidade da clinica, entao isso precisa estar escrito no proprio arquivo
 * (o `aviso`) e no botao, e nao escondido aqui.
 */

import { configRepository } from '../repositories/ConfigRepository';
import { serviceRepository } from '../repositories/ServiceRepository';
import { storage } from '../adapters';
import type { AppConfig, Service } from '../domain/types';

export const CONFIG_FILE_VERSION = 1;

/** Chave que guarda o recibo da ultima importacao, para a tela avisar depois. */
export const CONFIG_IMPORT_STAMP = 'config-import';

export interface ConfigTransferFile {
  app: 'clinica-psi';
  tipo: 'configuracoes';
  versao: number;
  geradoEm: string;
  origem: string;
  /**
   *Escrito dentro do arquivo de proposito.Quem recebe precisa saber o que esta
   * recebendo antes de abrir, e um arquivo que pode ser reencaminhado nao pode
   * esconder o que tem dentro.
   */
  aviso: string;
  dados: {
    config: AppConfig;
    services: Service[];
  };
}

export interface ImportResult {
  ok: boolean;
  erro?: string;
  /** Resumo do que foi aplicado, para a tela confirmar. */
  resumo?: string;
  clinica?: string;
  servicos?: number;
}

const AVISO_PADRAO =
  'Arquivo de configuracoes do prontuario psicologico. Contem a identidade da clinica, ' +
  'textos, marca e modelos de termo. Nao contem dados de pacientes, nem agendamentos, ' +
  'nem senhas.';

function hoje(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Nome de arquivo seguro, sem acentos nem espaco. */
function paraNomeArquivo(texto: string): string {
  return (
    texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'clinica'
  );
}

export async function exportarConfiguracoes(): Promise<{ nome: string; conteudo: string }> {
  const config = await configRepository.get();
  const services = await serviceRepository.findAll({ orderBy: 'name', orderDir: 'asc' });

  const arquivo: ConfigTransferFile = {
    app: 'clinica-psi',
    tipo: 'configuracoes',
    versao: CONFIG_FILE_VERSION,
    geradoEm: new Date().toISOString(),
    origem: config.clinic.name,
    aviso: AVISO_PADRAO,
    dados: { config, services },
  };

  const slug = paraNomeArquivo(config.clinic.name);
  return {
    nome: `configuracoes-${slug}-${hoje()}.json`,
    conteudo: JSON.stringify(arquivo, null, 2),
  };
}

export function baixarArquivo(nome: string, conteudo: string, mime = 'application/json'): void {
  const blob = new Blob([conteudo], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function validar(texto: string): { config?: AppConfig; services?: Service[]; erro?: string; origem?: string } {
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    return { erro: 'Arquivo inválido: o conteúdo não é um JSON válido.' };
  }

  const arq = bruto as Partial<ConfigTransferFile>;
  if (!arq || typeof arq !== 'object') {
    return { erro: 'Arquivo inválido: não parece um arquivo de configurações.' };
  }
  if (arq.app !== 'clinica-psi' || arq.tipo !== 'configuracoes') {
    return { erro: 'Arquivo inválido: não é um arquivo de configurações deste sistema.' };
  }
  if (typeof arq.versao !== 'number' || arq.versao > CONFIG_FILE_VERSION) {
    return { erro: 'Arquivo de uma versão mais nova: atualize o sistema antes de importar.' };
  }

  const dados = arq.dados;
  if (!dados || typeof dados !== 'object' || !dados.config || !dados.config.clinic) {
    return { erro: 'Arquivo inválido: faltam os dados da clínica.' };
  }
  if (!String(dados.config.clinic.name || '').trim()) {
    return { erro: 'Arquivo inválido: a clínica não tem nome.' };
  }
  if (dados.services != null && !Array.isArray(dados.services)) {
    return { erro: 'Arquivo inválido: a lista de serviços está fora de formato.' };
  }

  return { config: dados.config, services: dados.services || [], origem: arq.origem };
}

/**
 * Aplica as configuracoes do arquivo.
 *
 * `modo` decide o que acontece com o que ja existe:
 *  - 'substituir' (padrao): o arquivo manda. E o que a pessoa quer quando
 *    recebeu o arquivo de outra pessoa da mesma clinica.
 *  - 'mesclar': so preenche o que estiver vazio aqui, preservando o que ja foi
 *    ajustado. Util quando se quer completar sem perder o que foi
 *    ajustado antes.
 */
export async function importarConfiguracoes(
  texto: string,
  modo: 'substituir' | 'mesclar' = 'substituir'
): Promise<ImportResult> {
  const { config, services, erro, origem } = validar(texto);
  if (erro || !config || !services) return { ok: false, erro: erro || 'Arquivo inválido.' };

  try {
    if (modo === 'substituir') {
      // o arquivo manda, mas o que ele nao trouxer cai no padrao do sistema.
      // Um arquivo montado a mao vem incompleto, e a clinica nao pode ficar
      // sem cor nem sem logotipo so por isso
      await configRepository.resetToDefaults();
      await configRepository.set(config);
    } else {
      const atual = await configRepository.get();
      await storage.set('config', mesclarConfig(atual, config));
    }

    let quantosServicos = 0;
    if (modo === 'substituir' && services.length > 0) {
      // os servicos referenciados por paciente nao existem no arquivo (por
      // desenho), entao a lista nova nao pode quebrar os agendamentos antigos
      const atuais = await serviceRepository.findAll();
      const porId = new Map(atuais.map((s) => [s.id, s]));
      for (const s of services) {
        if (s?.id) porId.set(s.id, s);
      }
      const merged = Array.from(porId.values());
      await storage.set('services', merged);
      quantosServicos = merged.length;
    } else if (modo === 'mesclar') {
      const atuais = await serviceRepository.findAll();
      const existentes = new Set(atuais.map((s) => s.name.toLowerCase()));
      const novos = services.filter((s) => s?.name && !existentes.has(s.name.toLowerCase()));
      if (novos.length > 0) {
        await storage.set('services', [...atuais, ...novos]);
        quantosServicos = novos.length;
      }
    }

    await storage.set(CONFIG_IMPORT_STAMP, {
      em: new Date().toISOString(),
      origem: origem || config.clinic.name,
      modo,
    });

    const partes = [`configurações de ${config.clinic.name}`];
    if (quantosServicos > 0) partes.push(`${quantosServicos} serviço(s)`);
    return {
      ok: true,
      resumo: partes.join(' · '),
      clinica: config.clinic.name,
      servicos: quantosServicos,
    };
  } catch (e) {
    console.error('Failed to import settings:', e);
    return { ok: false, erro: 'Não foi possível gravar as configurações neste navegador.' };
  }
}

function estaVazio(valor: unknown): boolean {
  return valor === undefined || valor === null || valor === '';
}

/**
 * Preenche so o que estiver vazio no atual, sem sobrescrever o que a pessoa ja
 * ajustou. Usado pelo modo "mesclar": completa o cadastro sem perder o que
 * estava diferente.
 */
function mesclarConfig(atual: AppConfig, incoming: AppConfig): AppConfig {
  const atualRec = atual as unknown as Record<string, unknown>;
  const incomingRec = incoming as unknown as Record<string, unknown>;
  const saida: Record<string, unknown> = { ...atualRec };

  for (const [chave, valor] of Object.entries(incomingRec)) {
    if (estaVazio(valor)) continue;
    const meu = atualRec[chave];
    if (estaVazio(meu)) {
      saida[chave] = valor;
    } else if (
      typeof valor === 'object' &&
      !Array.isArray(valor) &&
      typeof meu === 'object' &&
      meu !== null &&
      !Array.isArray(meu)
    ) {
      saida[chave] = mesclarObjetos(
        meu as Record<string, unknown>,
        valor as Record<string, unknown>
      );
    }
  }
  return saida as unknown as AppConfig;
}

/** Mescla um nivel, repetindo o suficiente para descer na arvore da config. */
function mesclarObjetos(
  meu: Record<string, unknown>,
  theirs: Record<string, unknown>
): Record<string, unknown> {
  const saida: Record<string, unknown> = { ...meu };
  for (const [chave, valor] of Object.entries(theirs)) {
    if (estaVazio(valor)) continue;
    const meuValor = meu[chave];
    if (estaVazio(meuValor)) {
      saida[chave] = valor;
    } else if (
      typeof valor === 'object' && !Array.isArray(valor) &&
      typeof meuValor === 'object' && meuValor !== null && !Array.isArray(meuValor)
    ) {
      saida[chave] = mesclarObjetos(
        meuValor as Record<string, unknown>,
        valor as Record<string, unknown>
      );
    }
  }
  return saida;
}

/** Ultima importacao registrada, para a tela avisar "veio da clinica X". */
export async function ultimaImportacao(): Promise<{ em: string; origem: string; modo: string } | null> {
  return storage.get<{ em: string; origem: string; modo: string }>(CONFIG_IMPORT_STAMP);
}
