import { test, expect } from '@playwright/test';

import { semApresentacao } from './helpers';
const errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
});

async function loginAdmin(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.evaluate(() => localStorage.clear());
  // o tour volta a abrir depois do clear e bloqueia os cliques
  await semApresentacao(page);
  await page.reload();
  await page.locator('#email').fill('ana@clinica.com.br');
  await page.locator('#password').fill('123456');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.getByRole('link', { name: 'Configurações' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test('aba Equipe lista a equipe do seed com badges de situacao', async ({ page }) => {
  await loginAdmin(page);
  await page.getByRole('button', { name: 'Equipe' }).click();

  const rows = page.locator('table.data tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: 'Ana Ribeiro' })).toHaveCount(1);
  await expect(rows.filter({ hasText: 'Marcos Lima' })).toHaveCount(1);

  const ana = rows.filter({ hasText: 'Ana Ribeiro' });
  await expect(ana.getByText('Admin', { exact: true })).toBeVisible();
  await expect(ana.getByText('Você', { exact: true })).toBeVisible();
  await expect(ana.getByRole('button', { name: 'Desativar' })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('cria um profissional novo e o login passa a funcionar', async ({ page }) => {
  await loginAdmin(page);
  await page.getByRole('button', { name: 'Equipe' }).click();

  await page.getByRole('button', { name: 'Novo profissional' }).click();
  await expect(page.locator('.modal #pro-name')).toBeVisible();
  await expect(page.locator('.modal-head h3')).toHaveText('Novo profissional');

  await page.locator('.modal #pro-name').fill('Carla Nunes');
  await page.locator('.modal #pro-email').fill('CARLA@clinica.com.br');
  await page.locator('.modal #pro-crp').fill('CRP 06/99999');
  await page.locator('.modal #pro-role').fill('Psicóloga');
  await page.locator('.modal #pro-password').fill('abc123');
  await page.getByRole('button', { name: 'Criar acesso' }).click();

  await expect(page.locator('.modal')).toHaveCount(0);
  await expect(page.getByText('Acesso criado.')).toBeVisible();
  // e-mail normalizado para minusculas
  await expect(page.locator('table.data tbody tr').filter({ hasText: 'carla@clinica.com.br' })).toHaveCount(1);

  // o novo acesso entra no sistema
  await page.getByRole('button', { name: 'Sair do sistema' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.locator('#email').fill('carla@clinica.com.br');
  await page.locator('#password').fill('abc123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  // nao-admin ve Configuracoes, mas so as abas de dados e de perfil proprio
  // (o detalhe esta em config-permissao.spec.ts)
  await expect(page.getByRole('link', { name: 'Configurações' })).toBeVisible();

  expect(errors).toEqual([]);
});

test('bloqueia e-mail duplicado e senha curta', async ({ page }) => {
  await loginAdmin(page);
  await page.getByRole('button', { name: 'Equipe' }).click();
  await page.getByRole('button', { name: 'Novo profissional' }).click();

  await page.locator('.modal #pro-name').fill('Duplicado');
  await page.locator('.modal #pro-email').fill('ana@clinica.com.br');
  await page.locator('.modal #pro-crp').fill('CRP 06/00000');
  await page.locator('.modal #pro-password').fill('abc');
  await page.getByRole('button', { name: 'Criar acesso' }).click();

  await expect(
    page.locator('.modal .field-erro', { hasText: 'Ja existe um profissional com este e-mail' })
  ).toBeVisible();
  await expect(page.locator('.modal .field-erro', { hasText: '4 caracteres' })).toBeVisible();
  await expect(page.locator('.modal')).toBeVisible();
  expect(errors).toEqual([]);
});

test('nao permite rebaixar a unica administradora ativa', async ({ page }) => {
  await loginAdmin(page);
  await page.getByRole('button', { name: 'Equipe' }).click();

  const ana = page.locator('table.data tbody tr').filter({ hasText: 'Ana Ribeiro' });
  await ana.getByRole('button', { name: 'Editar' }).click();
  await expect(page.locator('.modal #pro-name')).toBeVisible();
  await page.locator('.modal #pro-admin').uncheck();
  await page.getByRole('button', { name: 'Salvar alterações' }).click();

  await expect(
    page.locator('.modal .field-erro', { hasText: 'manter ao menos um administrador ativo' })
  ).toBeVisible();
  await expect(page.locator('.modal')).toBeVisible();
  expect(errors).toEqual([]);
});

test('nao permite desativar o ultimo profissional ativo', async ({ page }) => {
  await loginAdmin(page);
  await page.getByRole('button', { name: 'Equipe' }).click();

  // desativa o outro profissional via acao rapida
  await page
    .locator('table.data tbody tr')
    .filter({ hasText: 'Marcos Lima' })
    .getByRole('button', { name: 'Desativar' })
    .click();
  await expect(page.getByText('Acesso desativado.')).toBeVisible();

  // agora Ana e a unica ativa: tentar desativar tambem deve falhar
  const ana = page.locator('table.data tbody tr').filter({ hasText: 'Ana Ribeiro' });
  await ana.getByRole('button', { name: 'Editar' }).click();
  await page.locator('.modal #pro-active').uncheck();
  await page.getByRole('button', { name: 'Salvar alterações' }).click();

  await expect(
    page.locator('.modal .field-erro', { hasText: 'manter ao menos um profissional ativo' })
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('desativar e reativar preserva o historico clinico', async ({ page }) => {
  await loginAdmin(page);
  await page.getByRole('button', { name: 'Equipe' }).click();

  const rows = page.locator('table.data tbody tr');
  const marcos = rows.filter({ hasText: 'Marcos Lima' });

  await marcos.getByRole('button', { name: 'Desativar' }).click();
  await expect(page.getByText('Acesso desativado.')).toBeVisible();
  await expect(marcos.getByText('Inativo', { exact: true })).toBeVisible();

  // profissional inativo nao consegue entrar
  await page.getByRole('button', { name: 'Sair do sistema' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.locator('#email').fill('marcos@clinica.com.br');
  await page.locator('#password').fill('123456');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.locator('.login-page .form-error')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);

  // reativa voltando como admin
  await page.locator('#email').fill('ana@clinica.com.br');
  await page.locator('#password').fill('123456');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.getByRole('link', { name: 'Configurações' }).click();
  await page.getByRole('button', { name: 'Equipe' }).click();
  await page
    .locator('table.data tbody tr')
    .filter({ hasText: 'Marcos Lima' })
    .getByRole('button', { name: 'Reativar' })
    .click();
  await expect(page.getByText('Acesso reativado.')).toBeVisible();

  // as evolucoes continuam intactas no prontuario. A linha do tempo mostra
  // apenas o sobrenome de quem registrou, entao o nome completo do autor
  // so aparecia no menu lateral - esta checagem nunca olhou o prontuario.
  await page.getByRole('link', { name: 'Pacientes' }).click();
  await page.getByRole('button', { name: /Juliana Martins/ }).click();
  await expect(page.locator('.tl-item').first()).toBeVisible();
  await expect(page.locator('.tl-date').first()).toContainText('Ribeiro');
  expect(errors).toEqual([]);
});
