/**
 * Clinic Context - Provides the shared clinic config and applies branding.
 *
 * The zustand store is the single source of truth for the config, so this
 * provider only derives the DOM side effects (CSS vars, title, favicon) from it.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useConfig } from '../store';
import { darken, lighten, generateFavicon } from '../utils/branding';
import type { AppConfig } from '../domain/types';

interface ClinicContextType {
  config: AppConfig | null;
  loading: boolean;
  refresh: () => Promise<void>;
  applyBranding: () => void;
}

const ClinicContext = createContext<ClinicContextType | null>(null);

function updateFavicon(cfg: AppConfig): void {
  const favicon = generateFavicon(cfg.brand);
  let link = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = favicon;
}

function applyBranding(cfg: AppConfig): void {
  const root = document.documentElement;
  root.style.setProperty('--primary', cfg.brand.primaryColor);
  root.style.setProperty('--primary-dark', darken(cfg.brand.primaryColor, 0.15));
  root.style.setProperty('--primary-light', lighten(cfg.brand.primaryColor, 0.1));
  root.style.setProperty('--secondary', cfg.brand.secondaryColor);

  document.title = `${cfg.clinic.name} · ${cfg.texts.systemName}`;

  updateFavicon(cfg);
}

export function ClinicProvider({ children }: { children: ReactNode }) {
  const { config, loading, loadConfig } = useConfig();
  const [branding, setBranding] = useState<AppConfig | null>(null);

  useEffect(() => {
    if (!config) return;
    applyBranding(config);
    setBranding(config);
  }, [config]);

  const value: ClinicContextType = {
    config,
    loading,
    refresh: loadConfig,
    applyBranding: () => {
      if (branding) applyBranding(branding);
    },
  };

  return <ClinicContext.Provider value={value}>{children}</ClinicContext.Provider>;
}

export function useClinic() {
  const context = useContext(ClinicContext);
  if (!context) throw new Error('useClinic must be used within ClinicProvider');
  return context;
}
