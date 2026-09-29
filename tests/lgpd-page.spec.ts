import { test, expect } from '@playwright/test';

import { semApresentacao } from './helpers';
/**
 * Controle LGPD operacional: uma linha por termo (como a POC), 4 cards,
 * filtros Todos/Vigentes/Revogados/Sem termo, PDF do controle e as acoes
 * por linha (PDF, Ver, Revogar, Gerar termo).
 */

const errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
});

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await semApresentacao(page);
  await page.locator('#email').fill('ana@clinica.com.br');
  await page.locator('#password').fill('123456');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function abrirLgpd(page: import('@playwright/test').Page) {
  await page.getByRole('link', { name: 'LGPD' }).click();
  await expect(page).toHaveURL(/\/lgpd/);
  await expect(page.locator('.card').first()).toBeVisible();
}

const linhas = (page: import('@playwright/test').Page) => page.locator('table.data tbody tr');
/** Acoes dentro da tabela: o chip "Baixar controle em PDF" fica de fora. */
const acoes = (page: import('@playwright/test').Page) => page.locator('table.data tbody .td-actions');

/** Revoga o primeiro termo vigente, para os filtros de revogado/pendente terem o que mostrar. */
async function revogarPrimeiro(page: import('@playwright/test').Page, motivo = 'Solicitação do titular') {
  await linhas(page).filter({ hasText: 'Vigente' }).first().getByRole('button', { name: 'Revogar' }).click();
  const modal = page.locator('[role="dialog"]');
  await expect(modal).toBeVisible();
  await modal.locator('#rc-reason').fill(motivo);
  await modal.getByRole('button', { name: 'Revogar' }).click();
  await expect(modal).toHaveCount(0);
}

test('mostra os quatro cards com os totais do seed', async ({ page }) => {
  await login(page);
  await abrirLgpd(page);

  const card = (rotulo: string) =>
    page.locator('.card.stat').filter({ hasText: rotulo });

  await expect(card('Pacientes ativos')).toBeVisible();
  await expect(card('Sem termo')).toBeVisible();
  await expect(card('Termos vigentes')).toBeVisible();
  await expect(card('Revogados')).toBeVisible();

  // Juliana e Rafael ativos; Beatriz esta pausada e nao conta
  await expect(card('Pacientes ativos').locator('.value')).toHaveText('2');
  expect(errors).toEqual([]);
});

test('a lista traz uma linha por termo, com tipo, versão, data e situação', async ({ page }) => {
  await login(page);
  await abrirLgpd(page);

  await expect(linhas(page).first()).toBeVisible();
  // o CSS uppercaseza o thead, entao comparamos sem caixa
  const cabecalhos = await page.locator('table.data thead th').allInnerTexts();
  expect(cabecalhos.map((h) => h.trim().toLowerCase())).toEqual([
    'paciente',
    'tipo',
    'versão',
    'assinado por',
    'data',
    'situação',
    '',
  ]);

  const primeira = linhas(page).first();
  await expect(primeira.locator('td').nth(0)).not.toBeEmpty();
  await expect(primeira.locator('td').nth(1)).toHaveText(/Consentimento|Aviso LGPD/);
  await expect(primeira.locator('td').nth(2)).toHaveText(/^v\d/);
  await expect(primeira.locator('td').nth(3)).not.toBeEmpty();
  await expect(primeira.locator('.badge')).toHaveText(/Vigente|Revogado|Substituído/);
});

test('cada linha vigente oferece PDF, Ver e Revogar', async ({ page }) => {
  await login(page);
  await abrirLgpd(page);

  const linha = linhas(page).filter({ hasText: 'Vigente' }).first();
  await expect(linha).toBeVisible();
  await expect(linha.getByRole('button', { name: 'PDF' })).toBeVisible();
  await expect(linha.getByRole('button', { name: 'Ver' })).toBeVisible();
  await expect(linha.getByRole('button', { name: 'Revogar' })).toBeVisible();
});

test('o filtro Vigentes esconde revogados e substituições', async ({ page }) => {
  await login(page);
  await abrirLgpd(page);

  await page.getByRole('button', { name: 'Vigentes', exact: true }).click();
  const badges = await page.locator('table.data tbody .badge').allInnerTexts();
  expect(badges.length).toBeGreaterThan(0);
  for (const b of badges) expect(b.trim()).toBe('Vigente');

  // so os vigentes podem ser revogados
  await expect(acoes(page).getByRole('button', { name: 'Revogar' })).toHaveCount(badges.length);
});

test('revogar um termo muda a situação para Revogado e tira a ação de revogar', async ({ page }) => {
  await login(page);
  await abrirLgpd(page);

  const alvo = linhas(page).filter({ hasText: 'Vigente' }).first();
  const nome = (await alvo.locator('td').nth(0).innerText()).split('\n')[0];
  await revogarPrimeiro(page);

  const linha = linhas(page).filter({ hasText: nome });
  await expect(linha.locator('.badge')).toHaveText('Revogado');
  await expect(linha.getByRole('button', { name: 'Revogar' })).toHaveCount(0);
  await expect(linha.getByRole('button', { name: 'PDF' })).toBeVisible();
  await expect(linha.getByRole('button', { name: 'Ver' })).toBeVisible();
});

test('o filtro Revogados mostra apenas revogados', async ({ page }) => {
  await login(page);
  await abrirLgpd(page);
  await revogarPrimeiro(page);

  await page.getByRole('button', { name: 'Revogados', exact: true }).click();
  const badges = await page.locator('table.data tbody .badge').allInnerTexts();
  expect(badges.length).toBeGreaterThan(0);
  for (const b of badges) expect(b.trim()).toBe('Revogado');
  await expect(acoes(page).getByRole('button', { name: 'Revogar' })).toHaveCount(0);
  await expect(acoes(page).getByRole('button', { name: 'PDF' })).toHaveCount(badges.length);
});

test('o filtro Sem termo avisa quando nenhum paciente ativo está pendente', async ({ page }) => {
  await login(page);
  await abrirLgpd(page);

  await page.getByRole('button', { name: 'Sem termo', exact: true }).click();
  await expect(page.getByText('Todos os pacientes ativos possuem termo vigente')).toBeVisible();
});

test('quem fica sem termo vigente aparece como Pendente, com botão Gerar termo', async ({ page }) => {
  await login(page);
  await abrirLgpd(page);
  await revogarPrimeiro(page);

  await page.getByRole('button', { name: 'Sem termo', exact: true }).click();
  const linha = linhas(page).first();
  await expect(linha.locator('.badge')).toHaveText('Pendente');
  await expect(linha.getByRole('button', { name: 'Gerar termo' })).toBeVisible();
  await expect(linha.getByRole('button', { name: 'Revogar' })).toHaveCount(0);
});

test('o aviso de pendências leva ao filtro Sem termo', async ({ page }) => {
  await login(page);
  await abrirLgpd(page);

  // com o seed ninguém está pendente; o aviso nasce depois da revogação
  const aviso = page.locator('.card').filter({ hasText: 'sem termo de consentimento vigente' });
  await expect(aviso).toHaveCount(0);
  await revogarPrimeiro(page);
  await expect(aviso).toBeVisible();

  await aviso.getByRole('button', { name: 'Ver pendências' }).click();
  await expect(page.getByRole('button', { name: 'Sem termo', exact: true })).toHaveClass(/active/);
  for (const linha of await linhas(page).all()) {
    await expect(linha.locator('.badge')).toHaveText('Pendente');
  }
});

test('Gerar termo abre o formulário já com o paciente', async ({ page }) => {
  await login(page);
  await abrirLgpd(page);
  await revogarPrimeiro(page);

  await page.getByRole('button', { name: 'Sem termo', exact: true }).click();
  const linha = linhas(page).first();
  const nome = (await linha.locator('td').nth(0).innerText()).split('\n')[0];
  await linha.getByRole('button', { name: 'Gerar termo' }).click();

  const modal = page.locator('[role="dialog"]');
  await expect(modal).toBeVisible();
  await expect(modal).toContainText(nome);
});

test('Ver abre o termo assinado e mostra o histórico congelado', async ({ page }) => {
  await login(page);
  await abrirLgpd(page);

  await linhas(page).first().getByRole('button', { name: 'Ver' }).click();
  const modal = page.locator('[role="dialog"]');
  await expect(modal).toBeVisible();
  await expect(modal.locator('.doc, .consent-doc, .doc-body').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('o botão PDF do controle abre a impressão', async ({ page }) => {
  await login(page);
  await abrirLgpd(page);

  await page.getByRole('button', { name: 'Baixar controle em PDF' }).click();
  // o PrintService monta a folha oculta e chama window.print
  await expect(page.locator('.print-root, #print-root, [id*=print]').first()).toBeAttached();
  expect(errors).toEqual([]);
});

test('o PDF de controle inclui o termo revogado', async ({ page }) => {
  await login(page);
  await abrirLgpd(page);
  await revogarPrimeiro(page);

  await page.getByRole('button', { name: 'Baixar controle em PDF' }).click();
  const impresso = await page.locator('#print-root').innerText();
  expect(impresso).toContain('Controle de Termos LGPD');
  expect(impresso).toContain('Revogado');
});
