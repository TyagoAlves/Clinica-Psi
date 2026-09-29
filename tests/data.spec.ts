import { test, expect } from '@playwright/test';

import { semApresentacao } from './helpers';
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

test('o seed cria pacientes e o painel mostra os totais', async ({ page }) => {
  await login(page);
  await expect(page.getByText('Total de Pacientes')).toBeVisible();

  const totalCard = page.locator('.stats > *').first();
  await expect(totalCard).toContainText('3');
  expect(errors).toEqual([]);
});

test('a lista de pacientes mostra os registros do seed e filtra por busca', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Pacientes' }).click();
  await expect(page).toHaveURL(/\/patients$/);

  const cards = page.locator('.patient-card');
  await expect(cards).toHaveCount(3);
  await expect(cards.filter({ hasText: 'Juliana Martins' })).toHaveCount(1);
  await expect(cards.filter({ hasText: 'Rafael Duarte' })).toHaveCount(1);
  await expect(cards.filter({ hasText: 'Beatriz Rocha' })).toHaveCount(1);

  const search = page.getByPlaceholder('Buscar por nome, telefone ou email...');
  await search.fill('Rafael');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Rafael Duarte');
  expect(errors).toEqual([]);
});

test('servicos do seed sao listados', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Serviços' }).click();
  await expect(page).toHaveURL(/\/services$/);
  const rows = page.locator('table.data tbody tr');
  await expect(rows.first()).toBeVisible();
  await expect(rows.filter({ hasText: 'Terapia Individual' })).toHaveCount(1);
  await expect(rows.filter({ hasText: 'Avaliação Psicológica' })).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('salvar a identidade da clinica no admin persiste e atualiza o branding', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Configurações' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { level: 1, name: /Configura/i })).toBeVisible();

  // aba Identidade
  await page.getByLabel('Nome da Clínica *').fill('Clínica Teste E2E');
  await page.getByRole('button', { name: 'Salvar Identidade' }).click();
  await expect(page.getByText('Identidade atualizado com sucesso')).toBeVisible();
  // a sidebar reflete o novo nome sem recarregar
  await expect(page.locator('.sidebar-title strong')).toHaveText('Clínica Teste E2E');

  // aba Marca -> branding aplicado no documento
  await page.getByRole('button', { name: 'Marca' }).click();
  await page.getByLabel('Cor Principal').fill('#ff0000');
  await page.getByLabel('Sigla (até 3 letras)').fill('CT');
  await page.getByRole('button', { name: 'Salvar Marca' }).click();
  await expect(page.getByText('Marca atualizado com sucesso')).toBeVisible();

  await expect
    .poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--primary')))
    .toBe('#ff0000');

  // persiste apos recarregar
  await page.reload();
  await expect(page.locator('.sidebar-title strong')).toHaveText('Clínica Teste E2E');
  await page.getByRole('button', { name: 'Marca' }).click();
  await expect(page.getByLabel('Sigla (até 3 letras)')).toHaveValue('CT');

  expect(errors).toEqual([]);
});

test('os modelos LGPD sao editados por blocos e persistidos', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Configurações' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole('button', { name: 'Termos LGPD' }).click();

  // versão em branco é recusado pela validação do próprio campo
  await page.locator('#consent-version').fill('');
  await page.getByRole('button', { name: 'Salvar Modelos LGPD' }).click();
  expect(
    await page.locator('#consent-version').evaluate((el: HTMLInputElement) => !el.checkValidity())
  ).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('clinica-psi-config'))).toBeNull();

  await page.locator('#consent-version').fill('2.0');
  await page.locator('#cm-blocks-treatment').fill('- Cabecalho Novo\n\nCorpo do termo.\n\n* item um\n* item dois');
  await page.getByRole('button', { name: 'Salvar Modelos LGPD' }).click();
  await expect(page.getByText('Termos LGPD atualizado com sucesso')).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Termos LGPD' }).click();
  await expect(page.locator('#consent-version')).toHaveValue('2.0');
  await expect(page.locator('#cm-blocks-treatment')).toHaveValue(
    '- Cabecalho Novo\n\nCorpo do termo.\n\n* item um\n* item dois'
  );

  // os blocos viraram estrutura de verdade, com titulo e lista
  const salvo = await page.evaluate(() => {
    const cfg = JSON.parse(localStorage.getItem('clinica-psi-config') || '{}');
    return cfg?.consent?.models?.treatment?.blocks;
  });
  expect(salvo).toEqual([
    { type: 'heading', text: 'Cabecalho Novo' },
    { type: 'paragraph', text: 'Corpo do termo.' },
    { type: 'list', items: ['item um', 'item dois'] },
  ]);

  // a versao global tambem carimba cada modelo
  const versoes = await page.evaluate(() => {
    const cfg = JSON.parse(localStorage.getItem('clinica-psi-config') || '{}');
    return {
      global: cfg?.consent?.version,
      treatment: cfg?.consent?.models?.treatment?.version,
      data: cfg?.consent?.models?.data?.version,
    };
  });
  expect(versoes).toEqual({ global: '2.0', treatment: '2.0', data: '2.0' });
});
