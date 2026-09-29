/**
 * PrintService - gera documentos e abre a janela de impressão do navegador
 * (equivalente ao `PDF.js` da POC: sem licenca, sem upload).
 *
 * O conteudo e injetado em `#print-root`, que fica oculto na tela e e
 * revealed apenas pela regra `@media print` do globals.css. Assim o que sai
 * na impressora e o documento, nunca o shell da aplicacao.
 */

import type { AppConfig, Appointment, Consent, Evolution, Patient, Professional, Service } from '../domain/types';

const EMPTY_CONFIG = {
  clinic: { name: '', unit: '', address: '', phone: '', email: '', website: '', document: '', responsible: '' },
  brand: { acronym: 'CP', primaryColor: '', secondaryColor: '' },
  texts: { systemName: '', loginSubtitle: '', footer: '', lgpdNotice: '' },
  consent: { version: '1.0', models: { treatment: null, data: null } },
  demo: true,
} as unknown as AppConfig;

export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatDate(value?: string): string {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('pt-BR');
}

export function formatDateTime(value?: string): string {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? '-'
    : `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

export function age(birthDate?: string): number | null {
  if (!birthDate) return null;
  const born = new Date(birthDate);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - born.getFullYear();
  const m = now.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < born.getDate())) years--;
  return years;
}

export const PATIENT_STATUS_LABEL: Record<string, string> = {
  active: 'Em tratamento',
  paused: 'Pausado',
  discharged: 'Alta/Encerrado',
  inactive: 'Inativo',
};

export const CONSENT_STATUS_LABEL: Record<string, string> = {
  active: 'Vigente',
  revoked: 'Revogado',
  replaced: 'Substituído',
};

export const APPOINTMENT_STATUS_LABEL: Record<string, string> = {
  scheduled: 'Agendado',
  confirmed: 'Confirmado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  'no-show': 'Nãocompareceu',
};

function header(config: AppConfig): string {
  const c = config.clinic;
  const contato = [c.phone, c.email, c.website].filter(Boolean);
  // nome e unidade na mesma linha: "Clinica Psi Unidade Pinheiros"
  const titulo = [c.name, c.unit].filter(Boolean).join(' ');

  return (
    '<div class="print-clinic">' +
    `<div><h1>${esc(titulo)}</h1>` +
    '<div class="pc-meta">' +
    (c.address ? esc(c.address) : '') +
    (c.document ? `<br>${esc(c.document)}` : '') +
    '</div></div>' +
    `<div class="pc-meta center" style="text-align:right">${contato.map(esc).join('<br>')}` +
    `<br>Emitido em ${esc(formatDateTime(new Date().toISOString()))}</div>` +
    '</div>'
  );
}

function patientBlock(patient: Patient, service?: Service): string {
  const anos = age(patient.birthDate);
  const linhas: [string, string][] = [
    ['Paciente', patient.name],
    ['Nascimento', patient.birthDate ? `${formatDate(patient.birthDate)}${anos !== null ? ` (${anos} anos)` : ''}` : '-'],
    ['Telefone', patient.phone || '-'],
    ['E-mail', patient.email || '-'],
    ['Documento', patient.document || '-'],
    ['Endereço', patient.address || '-'],
    ['Responsável', patient.responsible || '-'],
    ['Serviço', service?.name || '-'],
    ['Início do tratamento', patient.startDate ? formatDate(patient.startDate) : '-'],
    ['Situação', PATIENT_STATUS_LABEL[patient.status] || patient.status],
  ];

  return (
    '<div class="print-patient">' +
    linhas
      .map(([k, v]) => `<div><div class="k">${esc(k)}</div><div>${esc(v)}</div></div>`)
      .join('') +
    '</div>'
  );
}

function signature(professional?: Professional): string {
  return (
    '<div class="print-sign">' +
    `<div class="who">${esc(professional?.name || '')}<br>${esc(professional?.crp || '')}</div>` +
    '<div class="line"></div>' +
    '<div class="who small">Assinatura do profissional responsável</div>' +
    '</div>'
  );
}

function footer(config: AppConfig, description: string): string {
  const c = config.clinic;
  return (
    '<div class="print-footer">' +
    `<span>${esc(c.name)}${c.unit ? ` - ${esc(c.unit)}` : ''}</span>` +
    `<span>${esc(description)}</span>` +
    `<span>${esc(config.texts.footer || 'Documento confidencial')}</span>` +
    '</div>'
  );
}

function evoBlock(evo: Evolution, index: number, professional?: Professional): string {
  return (
    '<div class="print-evo">' +
    '<div class="print-evo-head">' +
    `<div><strong>${esc(evo.title || `Evolução ${index + 1}`)}</strong><br>${esc(formatDateTime(evo.date))}</div>` +
    `<div class="small">${esc(professional?.name || 'Não informado')}</div>` +
    '</div>' +
    `<div class="print-body">${evo.content || '<p>-</p>'}</div>` +
    '</div>'
  );
}

function print(html: string, title: string): void {
  const root = document.getElementById('print-root');
  if (!root) throw new Error('Elemento #print-root nao encontrado');

  const anterior = root.innerHTML;
  const tituloAnterior = document.title;

  root.innerHTML = `<div class="print-sheet">${html}</div>`;
  document.title = title;
  window.print();

  window.setTimeout(() => {
    root.innerHTML = anterior;
    document.title = tituloAnterior;
  }, 800);
}

export interface PrintContext {
  config: AppConfig;
  services: Service[];
  professionals: Professional[];
  patients: Patient[];
}

function findService(ctx: PrintContext, id: string): Service | undefined {
  return ctx.services.find((s) => s.id === id);
}

function findProfessional(ctx: PrintContext, id: string): Professional | undefined {
  return ctx.professionals.find((p) => p.id === id);
}

export function printEvolution(evo: Evolution, patient: Patient, ctx: PrintContext): void {
  const profissional = findProfessional(ctx, evo.professionalId);
  print(
    header(ctx.config) +
      '<div class="print-doc-title"><h2>Registro de Evolução</h2></div>' +
      patientBlock(patient, findService(ctx, patient.serviceId)) +
      evoBlock(evo, 0, profissional) +
      signature(profissional) +
      footer(ctx.config, 'Registro de evolução'),
    `Evolução - ${patient.name}`
  );
}

export function printProntuario(patient: Patient, evolutions: Evolution[], ctx: PrintContext): void {
  const sorted = [...evolutions].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const profissional =
    findProfessional(ctx, sorted[0]?.professionalId || '') || ctx.professionals[0];

  const corpo = sorted.length
    ? sorted.map((e, i) => evoBlock(e, i, findProfessional(ctx, e.professionalId))).join('')
    : '<p class="small">Nenhuma evolução registrada para este paciente.</p>';

  print(
    header(ctx.config) +
      `<div class="print-doc-title"><h2>Prontuário Completo</h2><div class="small">${sorted.length} registro(s)</div></div>` +
      patientBlock(patient, findService(ctx, patient.serviceId)) +
      corpo +
      signature(profissional) +
      footer(ctx.config, 'Prontuário completo'),
    `Prontuário - ${patient.name}`
  );
}

export function printAllEvolutions(patient: Patient, evolutions: Evolution[], ctx: PrintContext): void {
  if (!evolutions.length) return;
  // uma sessao por folha, com pausa para o navegador processar cada impressao
  evolutions.forEach((evo, i) => {
    window.setTimeout(() => printEvolution(evo, patient, ctx), i * 250);
  });
}

export interface AttendanceRow {
  paciente: string;
  servico: string;
  data: string;
  profissional: string;
  titulo: string;
}

export function printAttendanceReport(rows: AttendanceRow[], ctx: PrintContext): void {
  const body = rows
    .map(
      (r) =>
        '<tr>' +
        `<td>${esc(r.paciente)}</td><td>${esc(r.servico)}</td><td>${esc(r.data)}</td>` +
        `<td>${esc(r.profissional)}</td><td>${esc(r.titulo)}</td></tr>`
    )
    .join('');

  print(
    header(ctx.config) +
      '<div class="print-doc-title"><h2>Relatório de Atendimentos</h2></div>' +
      '<div class="print-body"><table class="print-table"><thead><tr>' +
      ['Paciente', 'Serviço', 'Data', 'Profissional', 'Título']
        .map((h) => `<th>${esc(h)}</th>`)
        .join('') +
      `</tr></thead><tbody>${body}</tbody></table>` +
      (rows.length ? '' : '<p class="small">Nenhuma evolução registrada.</p>') +
      '</div>' +
      footer(ctx.config, 'Relatório de atendimentos'),
    'Relatório de Atendimentos'
  );
}

export function printConsentReport(consents: Consent[], patients: Patient[], ctx: PrintContext): void {
  const name = (id: string) => patients.find((p) => p.id === id)?.name || '-';
  const type = (t: string) => (t === 'data' ? 'Dados' : 'Tratamento');

  const body = consents
    .map(
      (c) =>
        '<tr>' +
        `<td>${esc(name(c.patientId))}</td><td>${esc(type(c.type))}</td><td>v${esc(c.version)}</td>` +
        `<td>${esc(c.signedBy)}</td><td>${esc(formatDate(c.signedAt))}</td>` +
        `<td>${esc(CONSENT_STATUS_LABEL[c.status] || c.status)}</td></tr>`
    )
    .join('');

  print(
    header(ctx.config) +
      '<div class="print-doc-title"><h2>Controle de Termos LGPD</h2></div>' +
      '<div class="print-body"><table class="print-table"><thead><tr>' +
      ['Paciente', 'Tipo', 'Versão', 'Assinado por', 'Data', 'Situação']
        .map((h) => `<th>${esc(h)}</th>`)
        .join('') +
      `</tr></thead><tbody>${body}</tbody></table>` +
      (consents.length ? '' : '<p class="small">Nenhum termo registrado.</p>') +
      '</div>' +
      footer(ctx.config, 'Controle de termos LGPD'),
    'Controle LGPD'
  );
}

export function printDayAgenda(date: string, appointments: Appointment[], ctx: PrintContext): void {
  const name = (id: string, list: { id: string; name: string }[]) =>
    list.find((x) => x.id === id)?.name || '-';

  const body = appointments
    .map((a) => {
      const start = new Date(a.start);
      const end = new Date(start.getTime() + (a.durationMin || 50) * 60_000);
      return (
        '<tr>' +
        `<td>${esc(start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))} - ${esc(end.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))}</td>` +
        `<td>${esc(name(a.patientId, ctx.patients))}</td>` +
        `<td>${esc(name(a.serviceId, ctx.services))}</td>` +
        `<td>${esc(name(a.professionalId, ctx.professionals))}</td>` +
        `<td>${esc(APPOINTMENT_STATUS_LABEL[a.status] || a.status)}</td></tr>`
      );
    })
    .join('');

  print(
    header(ctx.config) +
      `<div class="print-doc-title"><h2>Agenda do Dia</h2><div class="small">${esc(formatDate(date))}</div></div>` +
      '<div class="print-body"><table class="print-table"><thead><tr>' +
      ['Horário', 'Paciente', 'Serviço', 'Profissional', 'Situação']
        .map((h) => `<th>${esc(h)}</th>`)
        .join('') +
      `</tr></thead><tbody>${body}</tbody></table>` +
      (appointments.length ? '' : '<p class="small">Nenhuma sessão agendada para este dia.</p>') +
      '</div>' +
      footer(ctx.config, 'Agenda do dia'),
    `Agenda - ${formatDate(date)}`
  );
}

export function printConsent(consent: Consent, patient: Patient, ctx: PrintContext): void {
  const profissional = findProfessional(ctx, consent.registeredBy) || ctx.professionals[0];

  const linhas: [string, string][] = [
    ['Paciente', patient.name],
    ['Tipo', consent.type === 'data' ? 'Dados' : 'Tratamento'],
    ['Versão do modelo', consent.version],
    ['Assinado por', consent.signedBy],
    ['Qualidade', consent.relationship === 'guardian' ? 'Responsável' : 'Titular'],
    ['Data', formatDate(consent.signedAt)],
    ['Situação', CONSENT_STATUS_LABEL[consent.status] || consent.status],
  ];
  if (consent.revokedAt) linhas.push(['Revogado em', formatDate(consent.revokedAt)]);
  if (consent.revocationReason) linhas.push(['Motivo informado', consent.revocationReason]);

  print(
    header(ctx.config) +
      '<div class="print-doc-title"><h2>Termo de Consentimento</h2></div>' +
      '<div class="print-patient">' +
      linhas
        .map(([k, v]) => `<div><div class="k">${esc(k)}</div><div>${esc(v)}</div></div>`)
        .join('') +
      '</div>' +
      `<div class="print-body">${consent.text || '<p>-</p>'}</div>` +
      signature(profissional) +
      `<div class="print-sign"><div class="line" style="width:62%"></div>` +
      `<div class="who small">Assinatura de ${esc(consent.signedBy)}</div></div>` +
      footer(ctx.config, 'Termo de consentimento'),
    `Termo - ${patient.name}`
  );
}

export { EMPTY_CONFIG };
