import { test, expect } from '@playwright/test';

import { semApresentacao } from './helpers';
const consoleErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  consoleErrors.length = 0;
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
});

test('carrega a pagina de login sem erro de runtime', async ({ page }) => {
  await page.goto('/login');
  await semApresentacao(page);
  await expect(page.getByRole('heading', { name: 'Clínica Psi' })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test('faz login com as credenciais de demonstracao e chega ao painel', async ({ page }) => {
  await page.goto('/login');
  await semApresentacao(page);
  await page.locator('#email').fill('ana@clinica.com.br');
  await page.locator('#password').fill('123456');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { name: 'Painel' })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test('bloqueia rota protegida sem sessao', async ({ page }) => {
  await page.goto('/patients');
  await expect(page).toHaveURL(/\/login/);
});

test('rejeita credenciais invalidas', async ({ page }) => {
  await page.goto('/login');
  await semApresentacao(page);
  await page.locator('#email').fill('ana@clinica.com.br');
  await page.locator('#password').fill('errada');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toContainText('inválidos');
  await expect(page).toHaveURL(/\/login/);
});

test('navega pelas paginas principais autenticado', async ({ page }) => {
  await page.goto('/login');
  await semApresentacao(page);
  await page.locator('#email').fill('ana@clinica.com.br');
  await page.locator('#password').fill('123456');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  for (const [link, url, heading] of [
    ['Pacientes', /\/patients$/, /Pacientes/i],
    ['Agenda', /\/agenda$/, /Agenda/i],
    ['Serviços', /\/services$/, /Servi/i],
    ['LGPD', /\/lgpd$/, /LGPD/i],
    ['Relatórios', /\/reports$/, /Relat/i],
    ['Configurações', /\/admin$/, /Configura/i],
  ] as const) {
    await page.getByRole('link', { name: link }).click();
    await expect(page).toHaveURL(url);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  }

  expect(consoleErrors).toEqual([]);
});

test('faz logout e volta para o login', async ({ page }) => {
  await page.goto('/login');
  await semApresentacao(page);
  await page.locator('#email').fill('ana@clinica.com.br');
  await page.locator('#password').fill('123456');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole('button', { name: 'Sair do sistema' }).click();
  await expect(page).toHaveURL(/\/login/);
});
