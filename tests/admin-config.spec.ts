import { test, expect } from '@playwright/test';

import { semApresentacao } from './helpers';
/**
 * Regressão das abas de Configurações:
 *  - botões primários legíveis (o `button { color: inherit }` do globals.css
 *    vencia o `text-white` do Tailwind e deixava texto escuro sobre azul);
 *  - prévia da aba Identidade;
 *  - upload de logo por arquivo (a POC permitia, o app só tinha campo de URL);
 *  - editor de blocos dos termos LGPD no lugar do JSON cru;
 *  - aba Dados com contagens e backup.
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

async function abrirConfig(page: import('@playwright/test').Page, aba: string) {
  await page.getByRole('link', { name: 'Configurações' }).click();
  await expect(page).toHaveURL(/\/admin/);
  await page.getByRole('button', { name: aba, exact: true }).click();
}

/** 1x1 PNG, o menor PNG valido possivel. */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

test('o botão primário de Configurações fica azul com texto branco', async ({ page }) => {
  await login(page);
  await abrirConfig(page, 'Identidade');

  const salvar = page.getByRole('button', { name: 'Salvar Identidade' });
  await expect(salvar).toBeVisible();

  const cores = await salvar.evaluate((el) => {
    const s = getComputedStyle(el);
    return { bg: s.backgroundColor, fg: s.color };
  });

  expect(cores.fg).toBe('rgb(255, 255, 255)');
  expect(cores.bg).not.toBe('rgba(0, 0, 0, 0)');
  expect(cores.bg).not.toBe('rgb(15, 23, 42)');
});

test('os botões da aba Dados têm texto legível sobre o próprio fundo', async ({ page }) => {
  await login(page);
  await abrirConfig(page, 'Dados');

  // btn-danger é soft por design (texto vermelho sobre rosa): o requisito é
  // contraste, não cor branca. btn-primary precisa de texto branco.
  const esperado: Record<string, string> = {
    'Restaurar demonstração': 'rgb(220, 38, 38)',
    'Baixar backup': 'rgb(255, 255, 255)',
    'Restaurar backup': 'rgb(15, 23, 42)',
  };

  for (const [nome, fg] of Object.entries(esperado)) {
    const btn = page.getByRole('button', { name: nome });
    await expect(btn).toBeVisible();
    const cores = await btn.evaluate((el) => {
      const s = getComputedStyle(el);
      return { bg: s.backgroundColor, fg: s.color };
    });
    expect(cores.fg, `texto de "${nome}"`).toBe(fg);
    expect(cores.fg, `fundo de "${nome}"`).not.toBe(cores.bg);
  }
});

test('a prévia da Identidade reflete o que está sendo digitado', async ({ page }) => {
  await login(page);
  await abrirConfig(page, 'Identidade');

  const previa = page.locator('.preview-box').first();
  await expect(previa).toBeVisible();
  await expect(previa.locator('.preview-brand strong')).toContainText('Clínica');

  await page.locator('#clinic-name').fill('Instituto Teste de Preview');
  // a prévia é ao vivo: não precisa salvar
  await expect(previa.locator('.preview-brand strong')).toHaveText('Instituto Teste de Preview');

  // salvar confirma e persiste
  await page.getByRole('button', { name: 'Salvar Identidade' }).click();
  await expect(page.locator('.toast', { hasText: 'Identidade atualizado' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('enviar um arquivo de logo mostra a prévia e salva como data URL', async ({ page }) => {
  await login(page);
  await abrirConfig(page, 'Marca');

  await expect(page.getByRole('button', { name: 'Escolher arquivo' })).toBeVisible();

  await page.setInputFiles('input[aria-label="Arquivo do logo"]', {
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: PNG_1PX,
  });

  const enviar = page.locator('input[aria-label="Arquivo do logo"]');
  await expect(enviar).toHaveValue(''); // input é limpo para permitir reenvio

  const preview = page.locator('.logo-preview');
  await expect(preview.locator('.logo-img')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remover logo' })).toBeVisible();

  await page.getByRole('button', { name: 'Salvar Marca' }).click();
  await expect(page.locator('.toast', { hasText: 'Marca atualizado' })).toBeVisible();

  // persistiu no storage com prefixo do app
  const logo = await page.evaluate(() => {
    const cfg = JSON.parse(localStorage.getItem('clinica-psi-config') || '{}');
    return cfg?.brand?.logo;
  });
  expect(typeof logo).toBe('string');
  expect(logo.startsWith('data:image/')).toBe(true);
  expect(errors).toEqual([]);
});

test('logo em formato inválido é recusado com aviso', async ({ page }) => {
  await login(page);
  await abrirConfig(page, 'Marca');

  await page.setInputFiles('input[aria-label="Arquivo do logo"]', {
    name: 'nota.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('isso nao e uma imagem'),
  });

  await expect(page.locator('.toast', { hasText: 'Formato não suportado' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Escolher arquivo' })).toBeVisible();
});

test('os termos LGPD usam editor de blocos, não JSON cru', async ({ page }) => {
  await login(page);
  await abrirConfig(page, 'Termos LGPD');

  await expect(page.locator('#consent-version')).toBeVisible();
  // sem textarea de JSON
  await expect(page.locator('#consent-treatment')).toHaveCount(0);
  await expect(page.locator('#consent-data')).toHaveCount(0);

  const blocoTratamento = page.locator('#cm-blocks-treatment');
  await expect(blocoTratamento).toBeVisible();
  await expect(page.locator('#cm-blocks-data')).toBeVisible();

  // a prévia do editor existe e renderiza o modelo
  const previa = page.locator('[data-model="treatment"] .doc');
  await expect(previa).toBeVisible();
  await expect(previa.locator('h1')).toContainText('Termo de Consentimento');
  expect(errors).toEqual([]);
});

test('editar um bloco de título do modelo reflete na prévia', async ({ page }) => {
  await login(page);
  await abrirConfig(page, 'Termos LGPD');

  const editor = page.locator('#cm-blocks-treatment');
  const original = await editor.inputValue();
  expect(original.length).toBeGreaterThan(50);

  const previa = page.locator('[data-model="treatment"] .doc');
  await editor.fill('- Titulo de Teste Editado\n\nParagrafo de verificacao.');
  await expect(previa.locator('h2')).toHaveText('Titulo de Teste Editado');

  // "Restaurar modelos originais" volta ao conteúdo do seed
  await page.getByRole('button', { name: 'Restaurar modelos originais' }).click();
  await expect(editor).toHaveValue(original);
});

test('a aba Dados mostra as contagens do seed', async ({ page }) => {
  await login(page);
  await abrirConfig(page, 'Dados');

  const previa = page.locator('.preview-box').first();
  await expect(previa.locator('h4')).toContainText('sistema');

  const linha = (rotulo: string) =>
    previa.locator('.row-between').filter({ has: page.locator('span', { hasText: rotulo }) });

  await expect(linha('Pacientes')).toContainText('3');
  // Ana + Marcos sao as duas credenciais de demonstracao
  await expect(linha('Equipe')).toContainText('2');
  await expect(previa).not.toContainText('Carregando…');
  expect(errors).toEqual([]);
});

test('a aba Dados não mostra mais o aviso de página em desenvolvimento', async ({ page }) => {
  await login(page);
  await abrirConfig(page, 'Dados');
  await expect(page.getByText('Página em desenvolvimento')).toHaveCount(0);
});

test('Limpar dados clínicos pede confirmação e mantém a equipe', async ({ page }) => {
  await login(page);
  await abrirConfig(page, 'Dados');

  // a identidade so vira chave no storage quando e salva; salvar antes para
  // provar que a limpeza preserva config
  await abrirConfig(page, 'Identidade');
  await page.getByRole('button', { name: 'Salvar Identidade' }).click();
  await expect(page.locator('.toast', { hasText: 'Identidade atualizado' })).toBeVisible();

  await abrirConfig(page, 'Dados');
  await page.getByRole('button', { name: 'Limpar dados clínicos' }).click();

  const modal = page.locator('[role="dialog"]');
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('Serão apagados');
  // nenhum apagamento antes de confirmar
  const antes = await page.evaluate(() => JSON.parse(localStorage.getItem('clinica-psi-patients') || '[]').length);
  expect(antes).toBe(3);

  await page.getByRole('button', { name: 'Confirmar: Limpar' }).click();
  await expect(modal).toHaveCount(0);

  const depois = await page.evaluate(() => ({
    patients: JSON.parse(localStorage.getItem('clinica-psi-patients') || '[]').length,
    professionals: JSON.parse(localStorage.getItem('clinica-psi-professionals') || '[]').length,
    config: !!localStorage.getItem('clinica-psi-config'),
  }));
  expect(depois).toEqual({ patients: 0, professionals: 2, config: true });

  // a contagem reflete a limpeza
  await expect(
    page
      .locator('.preview-box')
      .first()
      .locator('.row-between')
      .filter({ has: page.locator('span', { hasText: 'Pacientes' }) })
  ).toContainText('0');
});

test('Cancelar a limpeza não apaga nada', async ({ page }) => {
  await login(page);
  await abrirConfig(page, 'Dados');

  await page.getByRole('button', { name: 'Limpar dados clínicos' }).click();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);

  const patients = await page.evaluate(() => JSON.parse(localStorage.getItem('clinica-psi-patients') || '[]').length);
  expect(patients).toBe(3);
});

test('restaurar um backup inválido mostra o erro e não apaga os dados', async ({ page }) => {
  await login(page);
  await abrirConfig(page, 'Dados');

  await page.setInputFiles('input[aria-label="Arquivo de backup"]', {
    name: 'ruim.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{ isso nao e json'),
  });
  await expect(page.locator('.toast', { hasText: 'inválido' })).toBeVisible();

  await page.setInputFiles('input[aria-label="Arquivo de backup"]', {
    name: 'incompleto.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ app: 'clinica-psi', versao: 1, dados: {} })),
  });
  await expect(page.locator('.toast', { hasText: 'faltam a identidade' })).toBeVisible();

  const patients = await page.evaluate(() => JSON.parse(localStorage.getItem('clinica-psi-patients') || '[]').length);
  expect(patients).toBe(3);
  expect(errors).toEqual([]);
});
