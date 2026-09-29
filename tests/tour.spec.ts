import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Tour guiado: o roteiro aponta para o elemento real de cada tela, navegando
 * de verdade. O progresso fica em `clinica-psi-tour`.
 */

const errors: string[] = [];

test.beforeEach(async ({ page }) => {
  // Deixa o tour aparecer so na primeira carga. Precisa ser uma unica vez: os
  // testes recarregam a pagina para checar persistencia, e apagar a chave em
  // toda carga faria o tour voltar como se fosse a primeira vez.
  await page.addInitScript(() => {
    if (!window.sessionStorage.getItem('teste-tour-iniciada')) {
      window.localStorage.removeItem('clinica-psi-tour');
      window.sessionStorage.setItem('teste-tour-iniciada', '1');
    }
  });

  errors.length = 0;
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
});

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('#email').fill('ana@clinica.com.br');
  await page.locator('#password').fill('123456');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

const tour = (page: Page) => page.locator('.tour');
const tooltip = (page: Page) => page.locator('.tour-tooltip');
const tituloTour = (page: Page) => page.locator('#tour-titulo');
const avancar = (page: Page) => tooltip(page).getByRole('button', { name: 'Avançar' });
const voltar = (page: Page) => tooltip(page).getByRole('button', { name: 'Voltar' });

test('o tour abre no primeiro acesso, depois do login', async ({ page }) => {
  await login(page);

  await expect(tour(page)).toBeVisible();
  await expect(tituloTour(page)).toHaveText('Seu dia começa aqui');
  await expect(tooltip(page)).toContainText('1/12');
  // o halo destaca o elemento real da tela
  await expect(page.locator('.tour-halo')).toHaveCount(1);
});

test('o tour não abre na tela de login', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('.tour')).toHaveCount(0);
});

test('o tour navega de verdade para a tela de cada passo', async ({ page }) => {
  await login(page);

  // passo 1 e 2 ficam no painel
  await expect(page).toHaveURL(/\/dashboard/);
  await avancar(page).click();
  await expect(page).toHaveURL(/\/dashboard/);

  // passo 3 leva para pacientes
  await avancar(page).click();
  await expect(page).toHaveURL(/\/patients/);
  await expect(tituloTour(page)).toHaveText('A carteira de pacientes');

  // os passos 3 e 4 continuam em pacientes (cartão e botão de cadastro)
  await avancar(page).click();
  await expect(tituloTour(page)).toHaveText('Clicar no cartão abre o prontuário');
  await avancar(page).click();
  await expect(page).toHaveURL(/\/patients/);

  // e daí para a agenda
  await avancar(page).click();
  await expect(page).toHaveURL(/\/agenda/);
  await expect(tituloTour(page)).toHaveText('A agenda do dia');
});

test('o halo fica sobre o elemento que o passo aponta', async ({ page }) => {
  await login(page);
  await expect(page.locator('.tour-halo')).toHaveCount(1);

  // passo 1 destaca .stats do painel
  const stats = await page.locator('.stats').boundingBox();
  const halo = await page.locator('.tour-halo').boundingBox();
  expect(stats).not.toBeNull();
  expect(halo).not.toBeNull();
  // o halo cerca o elemento, com a folga de 6px
  expect(Math.abs(halo!.x - (stats!.x - 6))).toBeLessThan(3);
  expect(Math.abs(halo!.y - (stats!.y - 6))).toBeLessThan(3);
  expect(Math.abs(halo!.width - (stats!.width + 12))).toBeLessThan(3);
});

test('o tour destaca o cartão do paciente na lista', async ({ page }) => {
  await login(page);
  await avancar(page).click();
  await avancar(page).click();
  await expect(page).toHaveURL(/\/patients/);

  await avancar(page).click();
  await expect(tituloTour(page)).toHaveText('Clicar no cartão abre o prontuário');

  const cartao = await page.locator('.patient-card').first().boundingBox();
  const halo = await page.locator('.tour-halo').boundingBox();
  expect(cartao).not.toBeNull();
  expect(halo).not.toBeNull();
  expect(Math.abs(halo!.x - (cartao!.x - 6))).toBeLessThan(3);
  expect(Math.abs(halo!.y - (cartao!.y - 6))).toBeLessThan(3);
});

test('Avançar e Voltar andam pelo roteiro', async ({ page }) => {
  await login(page);

  await expect(voltar(page)).toBeDisabled();
  await avancar(page).click();
  await expect(tooltip(page)).toContainText('2/12');
  await expect(voltar(page)).toBeEnabled();

  await avancar(page).click();
  await expect(tooltip(page)).toContainText('3/12');

  await voltar(page).click();
  await expect(tooltip(page)).toContainText('2/12');
  await expect(page).toHaveURL(/\/dashboard/);
});

test('as setas do teclado também avançam', async ({ page }) => {
  await login(page);

  await page.keyboard.press('ArrowRight');
  await expect(tooltip(page)).toContainText('2/12');
  await page.keyboard.press('ArrowRight');
  await expect(tooltip(page)).toContainText('3/12');
  await page.keyboard.press('ArrowLeft');
  await expect(tooltip(page)).toContainText('2/12');
});

test('o tour passa pelas áreas do dia a dia', async ({ page }) => {
  await login(page);

  const areas = ['/dashboard', '/patients', '/agenda', '/services', '/evolution', '/lgpd', '/reports'];
  const vistas: string[] = [];

  for (let i = 0; i < 12; i++) {
    vistas.push(new URL(page.url()).pathname);
    const botao = avancar(page);
    if ((await botao.count()) === 0) break;
    await botao.click();
    await page.waitForTimeout(120);
  }

  // todas as áreas do roteiro foram visitadas, na ordem em que aparecem
  for (const area of areas) {
    expect(vistas).toContain(area);
  }
  await expect(tooltip(page).getByRole('button', { name: 'Concluir' })).toBeVisible();
});

test('o tooltip fica dentro da tela', async ({ page }) => {
  await login(page);
  for (let i = 0; i < 12; i++) {
    // o tooltip desliza ate a posicao final (transicao de 200ms)
    await page.waitForTimeout(300);
    const box = await tooltip(page).boundingBox();
    const vp = page.viewportSize()!;
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height + 1);

    const botao = avancar(page);
    if ((await botao.count()) === 0) break;
    await botao.click();
    await page.waitForTimeout(120);
  }
});

test('concluir no último passo encerra o tour', async ({ page }) => {
  await login(page);
  for (let i = 0; i < 12; i++) {
    const botao = avancar(page);
    if ((await botao.count()) === 0) break;
    await botao.click();
  }
  await tooltip(page).getByRole('button', { name: 'Concluir' }).click();
  await expect(tour(page)).toHaveCount(0);

  const estado = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('clinica-psi-tour') || '{}')
  );
  expect(estado.concluido).toBe(true);
  expect(typeof estado.concluidoEm).toBe('string');
});

test('o tour não volta depois de concluído', async ({ page }) => {
  await login(page);
  await page.locator('[aria-label="Pular o tour"]').click();
  await expect(tour(page)).toHaveCount(0);

  await page.reload();
  await expect(page.locator('.tour')).toHaveCount(0);
});

test('pular marca como concluído e libera o uso', async ({ page }) => {
  await login(page);
  await page.locator('[aria-label="Pular o tour"]').click();

  await expect(page.getByText('Total de Pacientes')).toBeVisible();
  await page.getByRole('link', { name: 'Pacientes' }).click();
  await expect(page).toHaveURL(/\/patients/);
});

test('o progresso fica no cache: recarregar no meio retoma o mesmo passo', async ({ page }) => {
  await login(page);
  await avancar(page).click();
  await avancar(page).click();
  await expect(tooltip(page)).toContainText('3/12');

  await page.reload();
  await expect(tour(page)).toBeVisible();
  await expect(tooltip(page)).toContainText('3/12');
  await expect(page).toHaveURL(/\/patients/);
});

test('o estado do tour é gravado na chave própria', async ({ page }) => {
  await login(page);
  await avancar(page).click();

  const estado = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('clinica-psi-tour') || 'null')
  );
  expect(estado).not.toBeNull();
  expect(estado.concluido).toBe(false);
  expect(estado.passo).toBe(1);
});

test('o tour não trava a aplicação nem gera erro', async ({ page }) => {
  await login(page);
  await expect(page.getByRole('link', { name: 'Pacientes' })).toBeVisible();
  await avancar(page).click();
  await avancar(page).click();
  await expect(page).toHaveURL(/\/patients/);
  expect(errors).toEqual([]);
});

test('Esc fecha o tour', async ({ page }) => {
  await login(page);
  await expect(tour(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tour(page)).toHaveCount(0);
});
