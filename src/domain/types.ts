/**
 * Domain Types - Core business entities
 * Independent of any framework or persistence layer
 */

export type UUID = string & { readonly __brand: unique symbol };
export const uuid = (): UUID => crypto.randomUUID() as UUID;

export interface ClinicConfig {
  name: string;
  unit: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  document: string;
  responsible: string;
}

export interface BrandConfig {
  acronym: string;
  primaryColor: string;
  secondaryColor: string;
  logo?: string; // data URL
}

export interface TextConfig {
  systemName: string;
  loginSubtitle: string;
  footer: string;
  lgpdNotice: string;
}

export interface ConsentConfig {
  version: string;
  models: ConsentModels;
}

export interface ConsentModels {
  treatment: ConsentModel;
  data: ConsentModel;
}

export interface ConsentModel {
  label: string;
  title: string;
  version: string;
  blocks: ConsentBlock[];
}

export type ConsentBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[]; ordered?: boolean };

export interface AppConfig {
  clinic: ClinicConfig;
  brand: BrandConfig;
  texts: TextConfig;
  consent: ConsentConfig;
  demo: boolean;
  /**
   * Ambiente de teste. Entra em vigor quando os acessos padrao de
   * demonstracao saem da equipe: o aviso fica visivel e as acoes que
   * apagam dados deixam de pedir confirmacao extra.
   */
  homologacao: boolean;
}

export interface Professional {
  id: UUID;
  name: string;
  email: string;
  password: string; // hashed in production
  crp: string;
  role: string;
  active: boolean;
  admin: boolean;
  /** Acesso criado automaticamente como demonstracao (nao e da clinica). */
  demo?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Patient {
  id: UUID;
  name: string;
  phone: string;
  email: string;
  birthDate: string;
  document: string;
  responsible: string;
  address: string;
  serviceId: UUID;
  status: PatientStatus;
  startDate: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export type PatientStatus = 'active' | 'paused' | 'discharged' | 'inactive';

export interface Service {
  id: UUID;
  name: string;
  description: string;
  durationMin: number;
  color: ServiceColor;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ServiceColor = 'primary' | 'success' | 'warning' | 'danger';

export interface Appointment {
  id: UUID;
  patientId: UUID;
  serviceId: UUID;
  professionalId: UUID;
  start: string; // ISO
  durationMin: number;
  status: AppointmentStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'completed'
  | 'no-show'
  | 'cancelled';

export interface Evolution {
  id: UUID;
  patientId: UUID;
  professionalId: UUID;
  title: string;
  date: string; // ISO
  content: string; // HTML
  createdAt: string;
  updatedAt: string;
}

export interface Consent {
  id: UUID;
  patientId: UUID;
  type: 'treatment' | 'data';
  signedBy: string;
  relationship: 'holder' | 'guardian';
  document: string;
  signedAt: string;
  version: string;
  registeredBy: UUID;
  text: string; // frozen HTML snapshot
  status: ConsentStatus;
  revokedAt?: string;
  revocationReason?: string;
  createdAt: string;
}

export type ConsentStatus = 'active' | 'revoked' | 'replaced';

export interface BackupData {
  version: number;
  exportedAt: string;
  clinic: AppConfig;
  professionals: Professional[];
  patients: Patient[];
  services: Service[];
  appointments: Appointment[];
  evolutions: Evolution[];
  consents: Consent[];
}

// Storage keys
export const STORAGE_KEYS = {
  DB: 'clinica-psi-db-v1',
  SESSION: 'clinica-psi-session-v1',
  TELEMETRY: 'clinica-psi-telemetry',
} as const;

// Cookie options
export const COOKIE_OPTIONS = {
  maxAge: 60 * 60 * 24 * 365, // 1 year
  sameSite: 'lax' as const,
  secure: false, // true in production with HTTPS
  path: '/',
};