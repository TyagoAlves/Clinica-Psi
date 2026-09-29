import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Modo homologacao e ambiente vazio.
 *
 * Excluir um acesso de demonstracao liga o modo homologacao: o aviso fica
 * visivel em todas as telas e a limpeza total em Configuracoes > Dados passa a
 * executar direto, sem confirmacao extra.
 */

const errors: string[] = [];

test.beforeEach(async ({ page }) => {
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

/** Pula o tour para chegar as telas de administracao. */
async function semApresentacao(page: Page) {
  const fechar = page.getByRole('button', { name: 'Pular o tour' });
  if ((await fechar.count()) > 0) {
    await fechar.click();
    await expect(page.locator('.tour')).toHaveCount(0);
  }
}

const homologacao = (page: Page) => page.evaluate(() => {
  const cfg = JSON.parse(localStorage.getItem('clinica-psi-config') || '{}');
  return cfg?.homologacao;
});

/**
 * Cria um acesso proprio, limpa os dados clinicos e exclui Ana e Marcos: e o
 * caminho real para sair dos acessos padrao.
 */
async function entrarEmHomologacao(page: Page) {
  await login(page);
  await semApresentacao(page);

  // 1. cria um acesso admin proprio. Ana e Marcos nao podem ser apagados por
  //    eles mesmos (a propria linha so tem "Desativar" desabilitado), entao
  //    criamos o acesso e voltamos a entrar com ele.
  await page.evaluate(() => {
    const KEY = 'clinica-psi-professionals';
    const lista = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (lista.some((p: { email: string }) => p.email === 'teste@clinica.com.br')) return;
    lista.push({
      id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc',
      name: 'Dra. Teste Homologacao',
      email: 'teste@clinica.com.br',
      password: 'teste123',
      crp: 'CRP 06/99999',
      role: 'Psicóloga',
      active: true,
      admin: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    localStorage.setItem(KEY, JSON.stringify(lista));
  });

  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/login/);
  await semApresentacao(page);
  await page.locator('#email').fill('teste@clinica.com.br');
  await page.locator('#password').fill('teste123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await semApresentacao(page);

  // 2. limpar os dados clinicos libera a exclusao (ha vinculos)
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Dados', exact: true }).click();
  await page.getByRole('button', { name: 'Limpar dados clínicos' }).click();
  await page.getByRole('button', { name: 'Confirmar: Limpar' }).click();
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);

  // 3. excluir Ana e Marcos
  await page.getByRole('button', { name: 'Equipe', exact: true }).click();
  for (const nome of ['Ana Ribeiro', 'Marcos Lima']) {
    const linha = page.locator('tbody tr').filter({ hasText: nome });
    await expect(linha).toBeVisible();
    page.once('dialog', (d) => void d.accept());
    await linha.getByRole('button', { name: 'Excluir' }).click();
    // o toast da exclusao anterior pode ainda estar na tela
    await expect(page.getByText('Profissional excluído.').last()).toBeVisible();
    await expect(linha).toHaveCount(0);
  }
}

test('excluir um acesso padrão liga o modo homologação', async ({ page }) => {
  await entrarEmHomologacao(page);

  expect(await homologacao(page)).toBe(true);
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem('clinica-psi-professionals') || '[]')
        .filter((p: { demo?: boolean }) => p.demo === true).length
    )
  ).toBe(0);
});

test('o modo homologação avisa em todas as telas', async ({ page }) => {
  await entrarEmHomologacao(page);

  const aviso = page.locator('.homologacao-bar');
  await expect(aviso).toBeVisible();
  await expect(aviso.locator('.demo-badge')).toHaveText('Homologação');
  await expect(aviso).toContainText('Configurações › Dados');

  for (const [link, url] of [
    ['Pacientes', /\/patients$/],
    ['Agenda', /\/agenda$/],
    ['Relatórios', /\/reports$/],
    ['Configurações', /\/admin$/],
  ] as const) {
    await page.getByRole('link', { name: link }).click();
    await expect(page).toHaveURL(url);
    await expect(page.locator('.homologacao-bar')).toBeVisible();
  }
});

test('o aviso de homologação sobrevive ao recarregar', async ({ page }) => {
  await entrarEmHomologacao(page);

  await page.reload();
  await expect(page.locator('.homologacao-bar')).toBeVisible();
  expect(await homologacao(page)).toBe(true);
});

test('em homologação a limpeza total não pede confirmação', async ({ page }) => {
  await entrarEmHomologacao(page);

  await page.getByRole('button', { name: 'Dados', exact: true }).click();
  await expect(page.getByText('Modo homologação: estas duas ações já executam direto')).toBeVisible();

  await page.getByRole('button', { name: 'Limpar dados clínicos' }).click();

  // sem diálogo de confirmação: a ação já rodou
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  await expect(page.locator('.toast', { hasText: 'Dados clínicos apagados' })).toBeVisible();
  const pacientes = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('clinica-psi-patients') || '[]').length
  );
  expect(pacientes).toBe(0);
});

test('em homologação a restauração da demonstração também vai direto', async ({ page }) => {
  await entrarEmHomologacao(page);

  await page.getByRole('button', { name: 'Dados', exact: true }).click();
  await page.getByRole('button', { name: 'Restaurar demonstração' }).click();

  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  // a demo restaura os acessos padrão, então a equipe volta a ter o ana
  const emails = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('clinica-psi-professionals') || '[]').map(
      (p: { email: string }) => p.email
    )
  );
  expect(emails).toContain('ana@clinica.com.br');
});

test('fora da homologação as duas ações ainda pedem confirmação', async ({ page }) => {
  await login(page);
  await semApresentacao(page);

  await page.goto('/admin');
  await page.getByRole('button', { name: 'Dados', exact: true }).click();
  await expect(page.locator('.homologacao-bar')).toHaveCount(0);

  await page.getByRole('button', { name: 'Limpar dados clínicos' }).click();
  await expect(page.locator('[role="dialog"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmar: Limpar' })).toBeVisible();
});

test('sem nenhum acesso, o login orienta a criar o primeiro', async ({ page }) => {
  await page.goto('/login');
  await page.evaluate(() => {
    localStorage.removeItem('clinica-psi-professionals');
    localStorage.removeItem('clinica-psi-session');
  });
  await page.reload();

  await expect(page.getByText('Nenhum acesso cadastrado neste navegador')).toBeVisible();
  // o formulário de login some: não adianta tentar
  await expect(page.locator('#email')).toHaveCount(0);
  await expect(page.locator('#password')).toHaveCount(0);

  await page.getByRole('button', { name: 'Criar primeiro acesso' }).click();
  await expect(page.locator('#first-name')).toBeVisible();
  await expect(page.locator('#first-email')).toBeVisible();
  await expect(page.locator('#first-password')).toBeVisible();
  // nenhum valor de senha pré-preenchido
  await expect(page.locator('#first-password')).toHaveValue('');
});

test('criar o primeiro acesso libera o login e a apresentação', async ({ page }) => {
  await page.goto('/login');
  await page.evaluate(() => {
    localStorage.removeItem('clinica-psi-professionals');
    localStorage.removeItem('clinica-psi-session');
    localStorage.removeItem('clinica-psi-tour');
  });
  await page.reload();

  await page.getByRole('button', { name: 'Criar primeiro acesso' }).click();
  await page.locator('#first-name').fill('Dra. Primeira Psicologa');
  await page.locator('#first-email').fill('primeira@clinica.com.br');
  await page.locator('#first-password').fill('primeira1');
  await page.locator('#first-crp').fill('CRP 06/11111');
  await page.getByRole('button', { name: 'Criar acesso e entrar' }).click();

  // "Criar acesso e entrar" ja deixa o sistema pronto para uso
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.locator('.tour')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a criação do primeiro acesso exige nome, e-mail e senha mínima', async ({ page }) => {
  await page.goto('/login');
  await page.evaluate(() => {
    localStorage.removeItem('clinica-psi-professionals');
    localStorage.removeItem('clinica-psi-session');
  });
  await page.reload();

  await page.getByRole('button', { name: 'Criar primeiro acesso' }).click();
  await page.locator('#first-name').fill('Sem Senha');
  await page.locator('#first-email').fill('sem@clinica.com.br');
  await page.locator('#first-password').fill('123');
  await page.getByRole('button', { name: 'Criar acesso e entrar' }).click();

  await expect(page.getByText('A senha precisa de ao menos 6 caracteres')).toBeVisible();
  // nada foi criado
  expect(await page.evaluate(() => localStorage.getItem('clinica-psi-professionals'))).toBeNull();
});

test('com equipe cadastrada, o login não oferece criação de acesso', async ({ page }) => {
  await page.goto('/login');

  await expect(page.getByText('Nenhum acesso cadastrado neste navegador')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Criar primeiro acesso' })).toHaveCount(0);
  await expect(page.locator('#email')).toBeVisible();
});

test('a tela de login mostra o erro de credencial inválida', async ({ page }) => {
  await page.goto('/login');
  await page.locator('#email').fill('ana@clinica.com.br');
  await page.locator('#password').fill('senha-errada');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.getByRole('alert')).toContainText('E-mail ou senha inválidos');
});
