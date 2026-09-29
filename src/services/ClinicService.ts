/**
 * Clinic Service - Business logic for clinic configuration
 */

import { configRepository } from '../repositories';
import { darken, lighten, generateFavicon } from '../utils/branding';
import type { AppConfig } from '../domain/types';

export class ClinicService {
  async getConfig(): Promise<AppConfig> {
    return configRepository.get();
  }

  async updateClinic(data: Partial<any>): Promise<any> {
    return configRepository.updateClinic(data);
  }

  async updateBrand(data: Partial<any>): Promise<any> {
    return configRepository.updateBrand(data);
  }

  async updateTexts(data: Partial<any>): Promise<any> {
    return configRepository.updateTexts(data);
  }

  async updateConsent(data: Partial<any>): Promise<any> {
    return configRepository.updateConsent(data);
  }

  async resetToDefaults(): Promise<any> {
    return configRepository.resetToDefaults();
  }

  async setHomologacao(value: boolean): Promise<void> {
    await configRepository.setHomologacao(value);
  }

  async isHomologacao(): Promise<boolean> {
    return configRepository.isHomologacao();
  }

  async isDemo(): Promise<boolean> {
    return configRepository.isDemo();
  }

  async setDemo(value: boolean): Promise<any> {
    return configRepository.setDemo(value);
  }

  // Validation
  validateConfig(config: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.clinic?.name?.trim()) errors.push('Nome da clínica é obrigatório');
    if (!config.clinic?.unit?.trim()) errors.push('Unidade é obrigatória');
    if (!config.clinic?.phone?.trim()) errors.push('Telefone é obrigatório');
    if (config.clinic?.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.clinic.email)) {
      errors.push('E-mail inválido');
    }
    if (config.brand?.acronym && config.brand.acronym.length > 3) {
      errors.push('Sigla deve ter no máximo 3 caracteres');
    }

    return { valid: errors.length === 0, errors };
  }

  // Generate text for consent
  async generateConsentText(type: 'treatment' | 'data', data: {
    titular: string;
    documento: string;
    clinica: string;
    psicologo: string;
    crp: string;
  }): Promise<string> {
    const config = await this.getConfig();
    const model = config.consent?.models?.[type];
    if (!model) throw new Error(`CONSENT_MODEL_NOT_FOUND: ${type}`);

    const replace = (text: string): string =>
      text
        .replace(/\{\{TITULAR\}\}/g, data.titular)
        .replace(/\{\{DOCUMENTO\}\}/g, data.documento)
        .replace(/\{\{CLINICA\}\}/g, data.clinica)
        .replace(/\{\{PSICOLOGO\}\}/g, data.psicologo)
        .replace(/\{\{CRP\}\}/g, data.crp);

    let html = `<h1>${replace(model.title)}</h1>`;

    for (const block of model.blocks ?? []) {
      if (block.type === 'list') {
        const tag = block.ordered ? 'ol' : 'ul';
        const items = block.items.map((item) => `<li>${replace(item)}</li>`).join('');
        html += `<${tag}>${items}</${tag}>`;
        continue;
      }

      const text = replace(block.text);
      if (block.type === 'heading') {
        html += `<h2>${text}</h2>`;
      } else {
        html += `<p>${text}</p>`;
      }
    }

    return html;
  }

  // Apply branding to document
  applyBranding(config: AppConfig): { cssVars: Record<string, string>; favicon: string } {
    const brand = config.brand;
    return {
      cssVars: {
        '--primary': brand.primaryColor,
        '--primary-dark': darken(brand.primaryColor, 0.15),
        '--primary-light': lighten(brand.primaryColor, 0.1),
        '--secondary': brand.secondaryColor,
      },
      favicon: generateFavicon(brand),
    };
  }
}

export const clinicService = new ClinicService();