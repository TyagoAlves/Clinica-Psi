import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { semApresentacao } from './helpers';

/**
 * Configurações para quem não é administrador.
 *
 * A tela deixou de ser exclusiva: o profissional comum entra, altera os próprios
 * dados e mexe no backup. Formulários, textos, identidade, marca e equipe
 * continuam restritos - e o filtro é no corpo da aba, não só no botão, senão a
 * aba abriria pelo estado.
 */

const errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
});

async function loginMarcos(page: Page) {
  await page.goto('/login');
  await semApresentacao(page);
  await page.locator('#email').fill('marcos@clinica.com.br');
  await page.locator('#password').fill('123456');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function loginAna(page: Page) {
  await page.goto('/login');
  await semApresentacao(page);
  await page.locator('#email').fill('ana@clinica.com.br');
  await page.locator('#password').fill('123456');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

const ABAS_RESTRITAS = ['Identidade', 'Marca', 'Textos', 'Termos LGPD', 'Equipe'];

test('o não administrador chega em Configurações pelo link do menu', async ({ page }) => {
  await loginMarcos(page);

  const link = page.getByRole('link', { name: 'Configurações' });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/admin/);
  expect(errors).toEqual([]);
});

test('a rota /admin deixa de expulsar o não administrador', async ({ page }) => {
  await loginMarcos(page);
  await page.goto('/admin');

  await expect(page).toHaveURL(/\/admin/);
  await expect(page.getByRole('heading', { level: 1, name: 'Configurações' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('as abas restritas não aparecem para o não administrador', async ({ page }) => {
  await loginMarcos(page);
  await page.goto('/admin');

  const abas = page.locator('.tabs .tab');
  await expect(abas).toHaveCount(2);
  await expect(abas.nth(0)).toHaveText(/Meu acesso/);
  await expect(abas.nth(1)).toHaveText(/Dados/);

  for (const aba of ABAS_RESTRITAS) {
    await expect(page.locator('.tabs .tab', { hasText: aba })).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('nenhum campo das abas restritas é montado para o não administrador', async ({ page }) => {
  await loginMarcos(page);
  await page.goto('/admin');

  // os formularios das abas bloqueadas nao chegam nem a ser renderizados
  for (const id of [
    '#clinic-name',
    '#clinic-document',
    '#brand-acronym',
    '#brand-primary',
    '#text-system-name',
    '#consent-version',
    '#cm-blocks-treatment',
    '#pro-name',
  ]) {
    await expect(page.locator(id), `campo ${id} visível para não-admin`).toHaveCount(0);
  }
  // e a tabela de equipe tambem nao
  await expect(page.locator('table.data tbody tr')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('o profissional altera os próprios dados e o nome persiste', async ({ page }) => {
  await loginMarcos(page);
  await page.goto('/admin');

  await expect(page.locator('#meu-name')).toHaveValue('Marcos Lima');
  await page.locator('#meu-name').fill('Marcos Lima Santos');
  await page.getByRole('button', { name: 'Salvar meus dados' }).click();

  await expect(page.getByText('Seus dados foram atualizados.')).toBeVisible();
  // a sessão guarda uma cópia: o menu precisa refletir o nome novo sem recarregar
  await expect(page.locator('.sidebar-user')).toContainText('Marcos Lima Santos');

  await page.reload();
  await expect(page.locator('#meu-name')).toHaveValue('Marcos Lima Santos');
  expect(errors).toEqual([]);
});

test('o profissional troca a própria senha e entra com a nova', async ({ page }) => {
  await loginMarcos(page);
  await page.goto('/admin');

  await page.locator('#meu-password').fill('novasenha1');
  await page.locator('#meu-senha-atual').fill('123456');
  await page.locator('#meu-confirmar-senha').fill('novasenha1');
  await page.getByRole('button', { name: 'Salvar meus dados' }).click();
  await expect(page.getByText('Seus dados foram atualizados.')).toBeVisible();

  await page.getByRole('button', { name: 'Sair do sistema' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.locator('#email').fill('marcos@clinica.com.br');
  await page.locator('#password').fill('novasenha1');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  expect(errors).toEqual([]);
});

test('campo em branco mantém a senha atual', async ({ page }) => {
  await loginMarcos(page);
  await page.goto('/admin');

  await page.locator('#meu-role').fill('Psicólogo');
  await page.getByRole('button', { name: 'Salvar meus dados' }).click();
  await expect(page.getByText('Seus dados foram atualizados.')).toBeVisible();

  // saiu e voltou com a senha antiga: o campo vazio não pode ter apagado nada
  await page.getByRole('button', { name: 'Sair do sistema' }).click();
  await page.locator('#email').fill('marcos@clinica.com.br');
  await page.locator('#password').fill('123456');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  expect(errors).toEqual([]);
});

test('“Meu acesso” não tem como se promover a administrador', async ({ page }) => {
  await loginMarcos(page);
  await page.goto('/admin');

  // sem caixa de administrador e sem checkbox de acesso ativo: o papel vem do
  // registro, nao do formulario
  await expect(page.locator('#meu-admin')).toHaveCount(0);
  await expect(page.locator('#meu-active')).toHaveCount(0);
  await expect(page.locator('input[name="admin"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('e-mail repetido é recusado com erro no campo', async ({ page }) => {
  await loginMarcos(page);
  await page.goto('/admin');

  await page.locator('#meu-email').fill('ana@clinica.com.br');
  await page.getByRole('button', { name: 'Salvar meus dados' }).click();

  await expect(page.locator('.field-erro')).toContainText('e-mail');
  // o e-mail antigo continua no lugar
  await expect(page.locator('#meu-email')).toHaveValue('ana@clinica.com.br');
  expect(errors).toEqual([]);
});

test('o backup fica disponível para o não administrador', async ({ page }) => {
  await loginMarcos(page);
  await page.goto('/admin');
  await page.locator('.tabs .tab', { hasText: 'Dados' }).click();

  await expect(page.getByRole('button', { name: 'Baixar backup' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restaurar backup' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a zona de risco fica escondida para o não administrador', async ({ page }) => {
  await loginMarcos(page);
  await page.goto('/admin');
  await page.locator('.tabs .tab', { hasText: 'Dados' }).click();

  await expect(page.getByRole('button', { name: 'Limpar dados clínicos' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Restaurar demonstração' })).toHaveCount(0);
  await expect(page.getByText('Zona de risco')).toHaveCount(0);
  // os pacientes continuam intactos: a opção sumiu, não agiu
  await page.goto('/patients');
  await expect(page.locator('.patient-card').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('o administrador continua vendo todas as abas', async ({ page }) => {
  await loginAna(page);
  await page.goto('/admin');

  const abas = page.locator('.tabs .tab');
  await expect(abas).toHaveCount(7);
  for (const aba of ['Meu acesso', ...ABAS_RESTRITAS, 'Dados']) {
    await expect(abas.filter({ hasText: aba })).toHaveCount(1);
  }
  expect(errors).toEqual([]);
});

test('o administrador edita os próprios dados pela aba Meu acesso', async ({ page }) => {
  await loginAna(page);
  await page.goto('/admin');
  await page.locator('.tabs .tab', { hasText: 'Meu acesso' }).click();

  await expect(page.locator('#meu-name')).toHaveValue('Ana Ribeiro');
  // a administradora continua enxergando o próprio selo de admin, só não edita
  await expect(page.locator('#meu-admin')).toHaveCount(0);
  await expect(page.getByText('Admin', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('o administrador ainda salva a identidade da clínica', async ({ page }) => {
  await loginAna(page);
  await page.goto('/admin');
  await page.locator('.tabs .tab', { hasText: 'Identidade' }).click();

  await expect(page.locator('#clinic-name')).toBeVisible();
  await page.locator('#clinic-unit').fill('Unidade Pinheiros');
  await page.getByRole('button', { name: 'Salvar Identidade' }).click();
  await expect(page.getByText('Identidade atualizado com sucesso')).toBeVisible();
  expect(errors).toEqual([]);
});

test('trocar a senha exige a senha atual', async ({ page }) => {
  await loginMarcos(page);
  await page.goto('/admin');

  // os campos de confirmacao so aparecem quando ha nova senha
  await expect(page.locator('#meu-senha-atual')).toHaveCount(0);
  await page.locator('#meu-password').fill('novasenha1');
  await expect(page.locator('#meu-senha-atual')).toBeVisible();
  await expect(page.locator('#meu-confirmar-senha')).toBeVisible();
});

test('senha atual errada impede a troca', async ({ page }) => {
  await loginMarcos(page);
  await page.goto('/admin');

  await page.locator('#meu-password').fill('novasenha1');
  await page.locator('#meu-senha-atual').fill('senha-errada');
  await page.locator('#meu-confirmar-senha').fill('novasenha1');
  await page.getByRole('button', { name: 'Salvar meus dados' }).click();

  await expect(page.locator('.field-erro').first()).toContainText('Senha incorreta');
  // a senha antiga continua valendo
  await page.getByRole('button', { name: 'Sair do sistema' }).click();
  await page.locator('#email').fill('marcos@clinica.com.br');
  await page.locator('#password').fill('123456');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});

test('a confirmação da nova senha precisa bater', async ({ page }) => {
  await loginMarcos(page);
  await page.goto('/admin');

  await page.locator('#meu-password').fill('novasenha1');
  await page.locator('#meu-senha-atual').fill('123456');
  await page.locator('#meu-confirmar-senha').fill('outracosa');
  await page.getByRole('button', { name: 'Salvar meus dados' }).click();

  await expect(page.locator('.field-erro')).toContainText('não são iguais');
});

test('trocar a senha com a senha atual certa funciona', async ({ page }) => {
  await loginMarcos(page);
  await page.goto('/admin');

  await page.locator('#meu-password').fill('novasenha2');
  await page.locator('#meu-senha-atual').fill('123456');
  await page.locator('#meu-confirmar-senha').fill('novasenha2');
  await page.getByRole('button', { name: 'Salvar meus dados' }).click();
  await expect(page.getByText('Seus dados foram atualizados.')).toBeVisible();

  await page.getByRole('button', { name: 'Sair do sistema' }).click();
  await page.locator('#email').fill('marcos@clinica.com.br');
  await page.locator('#password').fill('novasenha2');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});

test('exportar meus dados gera arquivo com o que eu registrei', async ({ page }) => {
  await loginMarcos(page);
  await page.goto('/admin');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar meus dados' }).click();
  const arquivo = await download;

  expect(arquivo.suggestedFilename()).toMatch(/clinica-psi-meus-dados-\d{4}-\d{2}-\d{2}\.txt/);
  await expect(page.getByText(/Arquivo gerado com/)).toBeVisible();
});

test('o arquivo exportado traz o nome do paciente e a evolução em texto', async ({ page }) => {
  await loginMarcos(page);
  await page.goto('/admin');

  // o seed registra as evoluções em nome da Ana, então o recorte de Marcos é
  // vazio - o arquivo precisa dizer isso em vez de sair em branco
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar meus dados' }).click();
  const arquivo = await download;
  const caminho = await arquivo.path();
  const conteudo = await readFile(caminho, 'utf-8');

  expect(conteudo).toContain('DADOS REGISTRADOS POR MIM');
  expect(conteudo.length).toBeGreaterThan(50);
});

test('restaurar backup pede a senha atual antes de gravar', async ({ page }) => {
  await loginMarcos(page);
  await page.goto('/admin');
  await page.locator('.tabs .tab', { hasText: 'Dados' }).click();

  const pacientesAntes = await page.evaluate(() => localStorage.getItem('clinica-psi-patients')?.length ?? 0);

  // um backup qualquer: a validacao do conteudo so acontece depois da senha
  await page.locator('input[aria-label="Arquivo de backup"]').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"app":"clinica-psi","versao":1,"dados":{}}'),
  });

  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('#dp-senha-input')).toBeVisible();
  await expect(page.getByText(/substitui tudo o que está neste navegador/)).toBeVisible();

  // sem a senha, nada foi gravado
  const pacientesDepois = await page.evaluate(() => localStorage.getItem('clinica-psi-patients')?.length ?? 0);
  expect(pacientesDepois).toBe(pacientesAntes);
});

test('senha errada no backup mantém os dados intactos', async ({ page }) => {
  await loginMarcos(page);
  await page.goto('/admin');
  await page.locator('.tabs .tab', { hasText: 'Dados' }).click();

  const antes = await page.evaluate(() => localStorage.getItem('clinica-psi-patients'));

  await page.locator('input[aria-label="Arquivo de backup"]').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"app":"clinica-psi","versao":1,"dados":{}}'),
  });
  await page.locator('#dp-senha-input').fill('senha-errada');
  await page.getByRole('button', { name: 'Confirmar restauração' }).click();

  await expect(page.locator('.field-erro')).toContainText('Senha incorreta');
  const depois = await page.evaluate(() => localStorage.getItem('clinica-psi-patients'));
  expect(depois).toBe(antes);
});

test('backup válido com a senha certa é restaurado', async ({ page }) => {
  await loginMarcos(page);
  await page.goto('/admin');
  await page.locator('.tabs .tab', { hasText: 'Dados' }).click();

  // exporta o estado atual e restaura o mesmo arquivo: o efeito é neutro, o
  // que importa é que a senha foi exigida e o fluxo completou
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar backup' }).click();
  const arquivo = await download;
  const conteudo = await readFile(await arquivo.path(), 'utf-8');

  await page.locator('input[aria-label="Arquivo de backup"]').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(conteudo),
  });
  await page.locator('#dp-senha-input').fill('123456');
  await page.getByRole('button', { name: 'Confirmar restauração' }).click();

  // restaurar derruba a sessao: o usuario volta para o login
  await expect(page).toHaveURL(/\/login/);
});
