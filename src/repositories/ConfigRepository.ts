import type { AppConfig, ConsentModel, ConsentModels } from '../domain/types';
import { storage } from '../adapters';

const CONFIG_KEY = 'config';

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(patch)) return base;
  if (!isPlainObject(base)) return patch as T;

  const result: Record<string, any> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    result[key] = isPlainObject(value) && isPlainObject(result[key])
      ? deepMerge(result[key], value)
      : value;
  }
  return result as T;
}

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export const TREATMENT_CONSENT: ConsentModel = {
  label: 'Termo de Consentimento para Tratamento Psicológico',
  title: 'Termo de Consentimento para Tratamento Psicológico',
  version: '1.0',
  blocks: [
    { type: 'paragraph', text: 'Eu, {{TITULAR}}, portador(a) do documento {{DOCUMENTO}}, autorizo o atendimento psicológico realizado por {{PSICOLOGO}}, CRP {{CRP}}, na {{CLINICA}}.' },
    { type: 'heading', text: '1. Objetivo do atendimento' },
    { type: 'paragraph', text: 'O atendimento tem como finalidade o acompanhamento psicológico, com interventions voltadas ao bem-estar e ao desenvolvimento do paciente.' },
    { type: 'heading', text: '2. Sigilo' },
    { type: 'paragraph', text: 'Todas as informações compartilhadas durante o atendimento são confidenciais e protegidas por sigilo profissional, salvo exceções previstas em lei.' },
    { type: 'heading', text: '3. Direitos do paciente' },
    { type: 'list', items: [
      'Solicitar informações sobre o andamento do atendimento',
      'Interromper o tratamento a qualquer momento',
      'Solicitar a exclusão dos dados registrados, nos termos da LGPD',
    ] },
  ],
};

export const DATA_CONSENT: ConsentModel = {
  label: 'Termo de Consentimento para Uso de Dados (LGPD)',
  title: 'Termo de Consentimento para Uso de Dados',
  version: '1.0',
  blocks: [
    { type: 'paragraph', text: 'Eu, {{TITULAR}}, portador(a) do documento {{DOCUMENTO}}, autorizo a {{CLINICA}} a tratar meus dados pessoais para fins de atendimento psicológico.' },
    { type: 'heading', text: '1. Dados coletados' },
    { type: 'list', items: [
      'Dados de identificação e contato',
      'Dados clínicos e de evolução do atendimento',
      'Registros de agendamento',
    ] },
    { type: 'heading', text: '2. Finalidade e base legal' },
    { type: 'paragraph', text: 'O tratamento tem como base legal o consentimento do titular, nos termos do art. 7º da Lei nº 13.709/2018 (LGPD).' },
    { type: 'heading', text: '3. Compartilhamento' },
    { type: 'paragraph', text: 'Os dados não serão compartilhados com terceiros, salvo obrigação legal ou judicial.' },
  ],
};

function getDefaults(): AppConfig {
  return {
    clinic: {
      name: 'Clínica Psi',
      unit: 'Unidade Pinheiros',
      address: 'Rua das Acácias, 120 - São Paulo/SP',
      phone: '(11) 3000-0000',
      email: 'contato@clinica.com.br',
      website: 'https://clinica.com.br',
      document: '12.345.678/0001-90',
      responsible: 'Ana Ribeiro',
    },
    brand: {
      acronym: 'CP',
      primaryColor: '#4f46e5',
      secondaryColor: '#7c3aed',
      logo: '',
    },
    texts: {
      systemName: 'Prontuário Eletrônico',
      loginSubtitle: 'Prontuário psicológico',
      footer: 'Documento confidencial',
      lgpdNotice: 'Este sistema atende à Lei Geral de Proteção de Dados (LGPD).',
    },
    consent: {
      version: '1.0',
      models: {
        treatment: TREATMENT_CONSENT,
        data: DATA_CONSENT,
      },
    },
    demo: true,
    homologacao: false,
  };
}

/** Modelos de termo originais, usados pelo botao "Restaurar modelos". */
export const DEFAULT_CONSENT_MODELS: ConsentModels = {
  treatment: TREATMENT_CONSENT,
  data: DATA_CONSENT,
};

export class ConfigRepository {
  private storage = storage;
  private key = CONFIG_KEY;

  async get(): Promise<AppConfig> {
    const config = await this.storage.get<Partial<AppConfig>>(this.key);
    if (!config || !isPlainObject(config)) return getDefaults();
    return deepMerge(getDefaults(), config);
  }

  async set(config: DeepPartial<AppConfig>): Promise<AppConfig> {
    const current = await this.get();
    const updated = deepMerge(current, config);
    await this.storage.set(this.key, updated);
    return updated;
  }

  async updateClinic(data: DeepPartial<AppConfig['clinic']>): Promise<AppConfig> {
    return this.set({ clinic: data });
  }

  async updateBrand(data: DeepPartial<AppConfig['brand']>): Promise<AppConfig> {
    return this.set({ brand: data });
  }

  async updateTexts(data: DeepPartial<AppConfig['texts']>): Promise<AppConfig> {
    return this.set({ texts: data });
  }

  async updateConsent(data: DeepPartial<AppConfig['consent']>): Promise<AppConfig> {
    return this.set({ consent: data });
  }

  async resetToDefaults(): Promise<AppConfig> {
    const defaults = getDefaults();
    await this.storage.set(this.key, defaults);
    return defaults;
  }

  async setHomologacao(value: boolean): Promise<AppConfig> {
    return this.set({ homologacao: value });
  }

  async isHomologacao(): Promise<boolean> {
    return (await this.get()).homologacao === true;
  }

  async isDemo(): Promise<boolean> {
    const config = await this.get();
    return config.demo === true;
  }

  async setDemo(value: boolean): Promise<AppConfig> {
    const current = await this.get();
    const updated = { ...current, demo: value };
    await this.storage.set(this.key, updated);
    return updated;
  }
}

export const configRepository = new ConfigRepository();
