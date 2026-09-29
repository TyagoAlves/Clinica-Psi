/**
 * ConsentService - gera o texto dos termos LGPD a partir dos modelos em
 * Configurações, substituindo os placeholders {{TITULAR}}, {{DOCUMENTO}},
 * {{CLINICA}}, {{PSICOLOGO}} e {{CRP}}.
 */

import type { AppConfig, ConsentModel, Patient, Professional } from '../domain/types';

export interface ConsentVars {
  titular: string;
  documento: string;
  clinica: string;
  psicologo: string;
  crp: string;
}

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function preencher(texto: string, vars: ConsentVars): string {
  // os modelos usam placeholders em caixa alta: {{TITULAR}}, {{CLINICA}}, ...
  const mapa = vars as unknown as Record<string, string>;
  return texto.replace(/\{\{([A-Z_]+)\}\}/g, (_match, tag: string) => {
    const valor = mapa[tag.toLowerCase()];
    return valor !== undefined && valor !== '' ? esc(valor) : '-';
  });
}

/** Converte os blocos do modelo no HTML congelado que vai para o registro. */
export function renderConsentText(model: ConsentModel, vars: ConsentVars): string {
  const partes = [`<h1>${esc(model.title)}</h1>`];

  for (const bloco of model.blocks) {
    if (bloco.type === 'heading') {
      partes.push(`<h2>${preencher(bloco.text, vars)}</h2>`);
    } else if (bloco.type === 'paragraph') {
      partes.push(`<p>${preencher(bloco.text, vars)}</p>`);
    } else {
      const itens = bloco.items
        .filter((item) => item && item.trim())
        .map((item) => `<li>${preencher(item, vars)}</li>`)
        .join('');
      if (itens) {
        partes.push(bloco.ordered ? `<ol>${itens}</ol>` : `<ul>${itens}</ul>`);
      }
    }
  }

  return partes.join('');
}

export function buildConsentVars(
  patient: Patient | undefined,
  config: AppConfig,
  professional: Professional | undefined,
  signedBy: string
): ConsentVars {
  const c = config.clinic;
  return {
    titular: signedBy.trim() || patient?.name || '-',
    documento: patient?.document || '-',
    clinica: [c.name, c.unit].filter(Boolean).join(' - ') || '-',
    psicologo: professional?.name || '-',
    crp: professional?.crp || '-',
  };
}

export const CONSENT_TYPE_LABEL: Record<'treatment' | 'data', string> = {
  treatment: 'Consentimento para Tratamento Psicológico',
  data: 'Aviso de Privacidade (LGPD)',
};

export const CONSENT_TITLE_LABEL: Record<'treatment' | 'data', string> = {
  treatment: 'Termo de consentimento',
  data: 'Aviso de privacidade (LGPD)',
};

export const CONSENT_STATUS_LABEL: Record<string, string> = {
  active: 'Vigente',
  revoked: 'Revogado',
  replaced: 'Substituído',
};
