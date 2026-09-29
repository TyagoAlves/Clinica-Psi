/**
 * DataService - backup, restauracao e manutencao dos dados locais.
 *
 * Tudo aqui passa pela porta `StorageAdapter`, e nao por `localStorage`
 * direto: no app empacotado o mesmo codigo precisa enxergar o arquivo
 * SQLite. O `LocalStorageAdapter.exportBackup()` le a chave 'db', que nao
 * existe neste app: cada colecao mora na sua propria chave. Por isso o
 * backup e montado aqui, chave a chave.
 */

import { storage } from '../adapters';
import {
  appointmentRepository,
  consentRepository,
  evolutionRepository,
  patientRepository,
  professionalRepository,
  serviceRepository,
} from '../repositories';
import { seedDemoData } from './bootstrap';
import { isTauri } from '../utils/tauri';
import { salvarArquivo } from '../utils/backupArquivo';

/** Identidade e equipe nao sao dados clinicos e sobrevivem a uma limpeza. */
export type ColecaoKey =
  | 'patients'
  | 'evolutions'
  | 'appointments'
  | 'consents'
  | 'services'
  | 'professionals';

export const COLECIONES_CLINICAS: ColecaoKey[] = [
  'patients',
  'evolutions',
  'appointments',
  'consents',
  'services',
];

export const LOGO_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
export const LOGO_MAX_BYTES = 200 * 1024;

export interface BackupFile {
  nome: string;
  conteudo: string;
  geradoEm: string;
  contagens: Record<ColecaoKey, number>;
}

export interface UsoArmazenamento {
  bytes: number;
  logoBytes: number;
  percentual: number;
  limite: number;
}

/** Chaves ja gravadas, sem prefixo. O backup precisa descobrir as colecoes. */
async function todasAsChaves(): Promise<string[]> {
  return storage.listKeys();
}

export async function contagens(): Promise<Record<ColecaoKey, number>> {
  const [patients, evolutions, appointments, consents, services, professionals] = await Promise.all([
    patientRepository.count(),
    evolutionRepository.count(),
    appointmentRepository.count(),
    consentRepository.count(),
    serviceRepository.count(),
    professionalRepository.count(),
  ]);
  return { patients, evolutions, appointments, consents, services, professionals };
}

export async function usoArmazenamento(): Promise<UsoArmazenamento> {
  let bytes = 0;
  let logoBytes = 0;

  for (const key of await todasAsChaves()) {
    const valor = await storage.get<Record<string, unknown>>(key);
    if (valor === null) continue;
    bytes += JSON.stringify(valor).length;
    if (key === 'config') {
      const logo = (valor as { brand?: { logo?: unknown } })?.brand?.logo;
      if (typeof logo === 'string') logoBytes = logo.length;
    }
  }

  const limite = 5 * 1024 * 1024;
  return {
    bytes,
    logoBytes,
    percentual: Math.min(100, Math.round((bytes / limite) * 100)),
    limite,
  };
}

export async function exportarBackup(): Promise<BackupFile> {
  const dados: Record<string, unknown> = {};
  for (const key of await todasAsChaves()) dados[key] = await storage.get(key);

  const geradoEm = new Date().toISOString();
  return {
    nome: `clinica-psi-backup-${geradoEm.slice(0, 10)}-${geradoEm.slice(11, 19).replace(/:/g, '')}.json`,
    conteudo: JSON.stringify({ app: 'clinica-psi', versao: 1, geradoEm, dados }, null, 2),
    geradoEm,
    contagens: await contagens(),
  };
}

export function baixarBackup(backup: BackupFile): void {
  const blob = new Blob([backup.conteudo], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = backup.nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Grava o backup no destino escolhido pelo usuario.
 *
 * No app empacotado usa o dialogo nativo; na web cai no download do
 * navegador, que e o comportamento de antes. Devolve `null` quando o
 * usuario cancela o dialogo, para o painel nao anunciar sucesso a toa.
 */
export async function salvarBackup(
  backup: BackupFile,
): Promise<{ ok: boolean; caminho?: string; cancelado?: boolean }> {
  if (!isTauri()) {
    baixarBackup(backup);
    return { ok: true };
  }
  try {
    const caminho = await salvarArquivo(backup.conteudo, backup.nome);
    if (!caminho) return { ok: false, cancelado: true };
    return { ok: true, caminho };
  } catch (e) {
    console.error('Failed to save backup:', e);
    return { ok: false };
  }
}

/**
 * Restaura um backup. Substitui tudo: pacientes, equipe, servicos, agenda e
 * termos. Valida antes de gravar para nao deixar o app sem identificacao.
 */
export async function importarBackup(texto: string): Promise<{ ok: boolean; erro?: string; resumo?: string }> {
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    return { ok: false, erro: 'Arquivo inválido: o conteúdo não é um JSON válido.' };
  }

  const dados = (bruto as { dados?: Record<string, unknown> })?.dados;
  if (!dados || typeof dados !== 'object') {
    return { ok: false, erro: 'Arquivo inválido: não parece um backup deste sistema.' };
  }
  if (!dados.config || !Array.isArray(dados.professionals) || (dados.professionals as unknown[]).length === 0) {
    return { ok: false, erro: 'Arquivo inválido: faltam a identidade da clínica ou a equipe.' };
  }

  try {
    for (const chave of Object.keys(dados)) {
      await storage.set(chave, dados[chave]);
    }
    // chaves que nao vieram no backup nao podem sobrar
    for (const key of await todasAsChaves()) {
      if (!(key in dados)) await storage.remove(key);
    }
  } catch (e) {
    console.error('Failed to import backup:', e);
    return { ok: false, erro: 'Não foi possível gravar o backup neste navegador.' };
  }

  const clinica =
    (dados.config as { clinic?: { name?: string } } | undefined)?.clinic?.name || 'clinic sem nome';
  return { ok: true, resumo: clinica };
}

/** Apaga os dados clínicos mantendo identidade, equipe e o acesso do usuário. */
export async function limparDadosClinicos(): Promise<Record<ColecaoKey, number>> {
  const antes = await contagens();
  for (const chave of COLECIONES_CLINICAS) await storage.set(chave, []);
  return antes;
}

/** Apaga tudo e recria a clinica de demonstracao. */
export async function restaurarDemonstracao(): Promise<void> {
  for (const key of await todasAsChaves()) await storage.remove(key);
  await seedDemoData();
}

export function validarLogo(arquivo: { type: string; size: number }): string {
  if (LOGO_MIME.indexOf(arquivo.type) === -1) {
    return 'Formato não suportado. Use PNG, JPG, WebP ou SVG.';
  }
  if (arquivo.size > LOGO_MAX_BYTES) {
    return `Imagem muito grande (máximo ${Math.round(LOGO_MAX_BYTES / 1024)} KB).`;
  }
  return '';
}

export function lerArquivoComoDataUrl(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result || ''));
    leitor.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    leitor.readAsDataURL(arquivo);
  });
}

export function lerArquivoComoTexto(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result || ''));
    leitor.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    leitor.readAsText(arquivo);
  });
}
