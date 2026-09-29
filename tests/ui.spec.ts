import { test, expect } from '@playwright/test';

import { semApresentacao } from './helpers';
const errs: string[] = [];

test('estrutura e estilos das telas', async ({ page }) => {
  errs.length = 0;
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));

  await page.goto('/login');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  // depois do reload: o tour reabre e bloqueia os cliques
  await semApresentacao(page);
  await page.reload();

  // login: card centralizado, logo, sem imagem externa
  await expect(page.locator('.login-page .login-container')).toBeVisible();
  await expect(page.locator('.login-brand .logo')).toBeVisible();
  const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  console.log('LOGIN font:', font);
  console.log('LOGIN bg:', await page.evaluate(() => getComputedStyle(document.querySelector('.login-page')).backgroundColor));

  await page.locator('#email').fill('ana@clinica.com.br');
  await page.locator('#password').fill('123456');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  // shell
  const sidebar = page.locator('.sidebar');
  await expect(sidebar).toBeVisible();
  console.log('SIDEBAR bg:', await page.evaluate(() => getComputedStyle(document.querySelector('.sidebar')).backgroundColor));
  console.log('TOPBAR h1:', await page.locator('.topbar h1').textContent());

  // dashboard
  await expect(page.locator('.stats')).toBeVisible();
  await expect(page.locator('.stat').first()).toBeVisible();
  await expect(page.locator('.patient-card').first()).toBeVisible();
  await expect(page.locator('.timeline .tl-item').first()).toBeVisible();
  console.log('STATS labels:', await page.locator('.stat .label').allTextContents());
  console.log('STATS values:', await page.locator('.stat .value').allTextContents());

  // sem imagem externa
  const extImgs = await page.evaluate(() =>
    Array.from(document.images).filter((i) => !i.src.startsWith('data:')).map((i) => i.src)
  );
  console.log('EXTERNAL IMAGES:', JSON.stringify(extImgs));

  // tabela de servicos
  await page.getByRole('link', { name: 'Serviços' }).click();
  await expect(page.locator('table.data tbody tr').first()).toBeVisible();
  console.log('SERVICOS rows:', await page.locator('table.data tbody tr').count());

  // modal de novo paciente realmente abre e tem formulario
  await page.locator('.topbar .btn-primary').click();
  await expect(page.locator('.modal')).toBeVisible();
  await expect(page.locator('.modal #np-name')).toBeVisible();
  await expect(page.locator('.modal #np-phone')).toBeVisible();
  console.log('MODAL title:', await page.locator('.modal-head h3').textContent());

  // criar paciente de verdade
  await page.locator('.modal #np-name').fill('Paciente Teste E2E');
  await page.locator('.modal #np-phone').fill('(11) 90000-0000');
  await page.getByRole('button', { name: 'Cadastrar paciente' }).click();
  await expect(page).toHaveURL(/\/patients\/.+/);
  await expect(page.getByText('Paciente Teste E2E').first()).toBeVisible();
  console.log('APOS CRIAR url:', page.url());

  // modal de servico cria servico e a lista atualiza
  await page.getByRole('link', { name: 'Serviços' }).click();
  await expect(page.locator('table.data tbody tr').first()).toBeVisible();
  const before = await page.locator('table.data tbody tr').count();
  await page.getByRole('button', { name: '+ Novo serviço' }).click();
  await expect(page.locator('.modal #sv-name')).toBeVisible();
  await page.locator('.modal #sv-name').fill('Serviço Teste E2E');
  await page.getByRole('button', { name: 'Criar serviço' }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  await expect(page.locator('table.data tbody tr')).toHaveCount(before + 1);
  console.log('SERVICOS apos criar:', before, '->', await page.locator('table.data tbody tr').count());

  // base sem profissionais (equipe removida de proposito) NAO ressuscita a
  // equipe de demonstracao: o login orienta a criar o primeiro acesso.
  await page.goto('/login');
  await page.evaluate(() => {
    localStorage.setItem('clinica-psi-professionals', '[]');
    Object.keys(localStorage)
      .filter((k) => k.startsWith('clinica-psi-session'))
      .forEach((k) => localStorage.removeItem(k));
  });
  await page.reload();

  await expect(page.getByText('Nenhum acesso cadastrado neste navegador')).toBeVisible();
  await expect(page.locator('#email')).toHaveCount(0);
  const rec = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('clinica-psi-professionals') || '[]').map((p: any) => p.email)
  );
  console.log('EQUIPE continua vazia apos recarregar:', JSON.stringify(rec));

  console.log('ERROS:', JSON.stringify(errs, null, 2));
  expect(errs).toEqual([]);
});
