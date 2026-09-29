import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Tela de Ajuda: o mesmo conteúdo do tour, em texto, com índice e busca.
 *
 * Não entra aqui nada de administração de equipe nem de configuração da
 * clínica: quem usa o dia a dia não precisa ver isso.
 */

const errors: string[] = [];

test.beforeEach(async ({ page }) => {
  // o tour trava a tela; aqui ele so atrapalharia
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'clinica-psi-tour',
      JSON.stringify({ concluido: true, passo: 0 })
    );
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

const ajuda = (page: Page) => page.locator('.ajuda');
const secao = (page: Page, id: string) => page.locator(`#${id}`);

test('Ajuda aparece no menu e abre pelo link', async ({ page }) => {
  await login(page);

  const link = page.getByRole('link', { name: 'Ajuda' });
  await expect(link).toBeVisible();
  await link.click();

  await expect(page).toHaveURL(/\/ajuda/);
  await expect(page.locator('.page-header h1')).toHaveText('Ajuda');
  // o subtitulo aparece na topbar e no cabecalho da pagina
  await expect(page.getByText('Como usar o sistema, área por área').first()).toBeVisible();
});

test('a ajuda tem índice com todas as áreas e seções', async ({ page }) => {
  await login(page);
  await page.goto('/ajuda');

  const esperadas = [
    'Painel',
    'Pacientes',
    'Prontuário e evoluções',
    'Agenda',
    'Serviços',
    'LGPD e consentimentos',
    'Relatórios',
    'Onde os dados ficam',
  ];

  const indice = ajuda(page).locator('.ajuda-link');
  await expect(indice).toHaveCount(esperadas.length);
  for (const titulo of esperadas) {
    await expect(indice.filter({ hasText: titulo })).toHaveCount(1);
  }

  // os ids sao estaveis e nao derivam do titulo
  const ids = ['painel', 'pacientes', 'prontuario', 'agenda', 'servicos', 'lgpd', 'relatorios', 'onde-ficam'];
  for (const id of ids) {
    await expect(secao(page, id)).toBeVisible();
  }
});

test('a ajuda não documenta equipe nem administração', async ({ page }) => {
  await login(page);
  await page.goto('/ajuda');

  const texto = await ajuda(page).innerText();
  // a tela de Configurações continua existindo, mas não é assunto da ajuda
  for (const proibido of ['Equipe', 'Administrador', 'admin', 'Criar acesso', 'Desativar acesso', 'Restaurar demonstração']) {
    expect(texto, `ajuda não deveria falar de "${proibido}"`).not.toContain(proibido);
  }
  // e o índice também não tem seção de configuração
  await expect(ajuda(page).locator('.ajuda-link').filter({ hasText: 'Configuraç' })).toHaveCount(0);
});

test('cada área explica o que dá para fazer', async ({ page }) => {
  await login(page);
  await page.goto('/ajuda');

  await expect(secao(page, 'pacientes').locator('.ajuda-lista-itens li')).toHaveCount(4);
  await expect(secao(page, 'agenda').locator('.ajuda-lista-itens li')).toHaveCount(4);
  await expect(secao(page, 'relatorios').locator('.ajuda-lista-itens li')).toHaveCount(4);
  await expect(secao(page, 'painel').locator('.ajuda-cartao')).toHaveCount(2);
});

test('as dicas aparecem nas seções que têm', async ({ page }) => {
  await login(page);
  await page.goto('/ajuda');

  await expect(secao(page, 'lgpd').locator('.ajuda-dica')).toContainText('lista de pendências');
  await expect(secao(page, 'prontuario').locator('.ajuda-dica')).toBeVisible();
});

test('a busca filtra as seções', async ({ page }) => {
  await login(page);
  await page.goto('/ajuda');

  const indice = ajuda(page).locator('.ajuda-link');
  const antes = await indice.count();

  await page.locator('#ajuda-busca').fill('agenda');
  await expect(indice).toHaveCount(1);
  await expect(secao(page, 'agenda')).toBeVisible();
  await expect(secao(page, 'pacientes')).toHaveCount(0);

  await page.locator('#ajuda-busca').fill('');
  await expect(indice).toHaveCount(antes);
});

test('a busca acha conteúdo dentro das seções', async ({ page }) => {
  await login(page);
  await page.goto('/ajuda');

  // "pausado" só aparece no texto de pacientes
  await page.locator('#ajuda-busca').fill('pausado');
  await expect(ajuda(page).locator('.ajuda-link')).toHaveCount(1);
  await expect(ajuda(page).locator('.ajuda-link')).toHaveText('Pacientes');
});

test('a busca ignora acentos', async ({ page }) => {
  await login(page);
  await page.goto('/ajuda');

  await page.locator('#ajuda-busca').fill('evolucoes');
  await expect(ajuda(page).locator('.ajuda-link').filter({ hasText: 'Prontuário' })).toHaveCount(1);
});

test('busca sem resultado mostra aviso', async ({ page }) => {
  await login(page);
  await page.goto('/ajuda');

  await page.locator('#ajuda-busca').fill('xyzabc123');
  await expect(page.locator('.ajuda-vazio')).toContainText('Nada encontrado');
  await expect(ajuda(page).locator('.ajuda-link')).toHaveCount(0);
});

test('o índice navega até a seção', async ({ page }) => {
  await login(page);
  await page.goto('/ajuda');

  await ajuda(page).locator('.ajuda-link').filter({ hasText: 'Relatórios' }).click();
  await expect(ajuda(page).locator('.ajuda-link.active')).toHaveText('Relatórios');
  // a seção alvo está visível depois do scroll
  await expect(secao(page, 'relatorios')).toBeInViewport();
});

test('a busca com acento mantém a seção ativa coerente', async ({ page }) => {
  await login(page);
  await page.goto('/ajuda');

  await ajuda(page).locator('.ajuda-link').filter({ hasText: 'Serviços' }).click();
  await expect(ajuda(page).locator('.ajuda-link.active')).toHaveText('Serviços');

  // filtrando para outra área, o destaque não fica apontando para algo invisível
  // ("frequência" só existe em Relatórios; "relatórios" também aparece em Serviços)
  await page.locator('#ajuda-busca').fill('frequência');
  await expect(ajuda(page).locator('.ajuda-link')).toHaveCount(1);
  await expect(ajuda(page).locator('.ajuda-link.active')).toHaveText('Relatórios');
});

test('"Refazer o tour" reinicia e abre o tour de novo', async ({ page }) => {
  await login(page);
  await page.goto('/ajuda');

  await page.getByRole('button', { name: 'Refazer o tour' }).click();

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.locator('.tour')).toBeVisible();
  await expect(page.locator('#tour-titulo')).toHaveText('Seu dia começa aqui');
});

test('depois do tour refeito, concluí-lo não abre outra vez', async ({ page }) => {
  await login(page);
  await page.goto('/ajuda');
  await page.getByRole('button', { name: 'Refazer o tour' }).click();
  await expect(page.locator('.tour')).toBeVisible();

  await page.locator('[aria-label="Pular o tour"]').click();
  await expect(page.locator('.tour')).toHaveCount(0);

  await page.reload();
  await expect(page.locator('.tour')).toHaveCount(0);
});

test('a ajuda abre sem erro de runtime', async ({ page }) => {
  await login(page);
  await page.goto('/ajuda');
  await expect(ajuda(page)).toBeVisible();
  expect(errors).toEqual([]);
});
