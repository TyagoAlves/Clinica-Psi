import { test, expect } from '@playwright/test';
import { semApresentacao } from './helpers';
import type { Page } from '@playwright/test';

/**
 * Senha guardada como hash e compartilhamento de configuracoes.
 *
 * As duas coisas andam juntas porque tocam no mesmo lugar: o arquivo de
 * configuracoes viaja entre maquinas, entao ele nao pode levar senha de
 * ninguem nem um byte de prontuario.
 */

const errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
});

type Profissional = {
  email: string;
  password?: string;
  passwordHash?: string;
};

/** Entra como Ana e espera o painel, que é o ponto de partida da maioria. */
async function login(page: Page) {
  await abrirLogin(page);
  await page.locator('#email').fill('ana@clinica.com.br');
  await page.locator('#password').fill('123456');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/dashboard/);
  await semApresentacao(page);
}

/**
 * Abre a tela de login já com o app montado.
 *
 * main.tsx só desenha a tela depois do bootstrap, e é o bootstrap que popula a
 * base. Sem esperar o formulário aparecer, um teste que mexe no armazenamento
 * chega no meio do seed e a base volta a ser recriada no reload seguinte.
 */
async function abrirLogin(page: Page) {
  await page.goto('/login');
  await expect(page.locator('#email')).toBeVisible();
}

/** Escolhe um arquivo de configurações pelo botão que define o modo. */
async function escolherArquivo(page: Page, botao: string, buffer: Buffer) {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: botao }).click(),
  ]);
  await chooser.setFiles({ name: 'configuracoes.json', mimeType: 'application/json', buffer });
}

function lerProfissionais(page: Page) {
  return page.evaluate(
    () => JSON.parse(localStorage.getItem('clinica-psi-professionals') || '[]') as unknown[]
  );
}

test('a instalação não guarda senha em texto puro', async ({ page }) => {
  await login(page);

  const lista = (await lerProfissionais(page)) as Profissional[];
  expect(lista.length).toBeGreaterThan(0);
  for (const p of lista) {
    expect(p.password).toBeUndefined();
    expect(p.passwordHash).toMatch(/^pbkdf2-sha256\$\d+\$[0-9a-f]+\$[0-9a-f]+$/);
  }

  // e a sessão aberta também não carrega nada disso
  const sessao = await page.evaluate(() => localStorage.getItem('clinica-psi-session'));
  expect(sessao).not.toContain('123456');
  expect(sessao).not.toContain('passwordHash');
  expect(errors).toEqual([]);
});

test('senha errada continua sendo recusada com o hash no lugar', async ({ page }) => {
  await page.goto('/login');
  await page.locator('#email').fill('ana@clinica.com.br');
  await page.locator('#password').fill('senha-errada');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.getByRole('alert')).toContainText('E-mail ou senha inválidos');
  await expect(page).toHaveURL(/\/login/);
});

test('quem entrou com senha antiga tem a senha migrada para hash', async ({ page }) => {
  await abrirLogin(page);
  // base de instalação antiga: senha em texto puro, sem hash
  await page.evaluate(() => {
    const KEY = 'clinica-psi-professionals';
    const lista = JSON.parse(localStorage.getItem(KEY) || '[]');
    const ana = lista.find((p: Profissional) => p.email === 'ana@clinica.com.br');
    if (!ana) throw new Error('demo nao encontrada');
    delete ana.passwordHash;
    ana.password = '123456';
    localStorage.setItem(KEY, JSON.stringify(lista));
  });
  await page.reload();

  await page.locator('#email').fill('ana@clinica.com.br');
  await page.locator('#password').fill('123456');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/dashboard/);

  const lista = (await lerProfissionais(page)) as Profissional[];
  const ana = lista.find((p) => p.email === 'ana@clinica.com.br');
  expect(ana?.password).toBeUndefined();
  expect(ana?.passwordHash).toContain('pbkdf2-sha256$');

  // a migração não pode ter deixado a senha na sessão que acabou de abrir
  const sessao = await page.evaluate(() => localStorage.getItem('clinica-psi-session') || '');
  expect(sessao).not.toContain('123456');
  expect(sessao).not.toContain('password');
  expect(errors).toEqual([]);
});

test('exportar configurações não leva paciente, agenda, termo nem senha', async ({ page }) => {
  await login(page);
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Dados', exact: true }).click();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exportar configurações' }).click(),
  ]);

  const stream = await download.createReadStream();
  const partes: Buffer[] = [];
  for await (const parte of stream) partes.push(parte as Buffer);
  const arquivo = JSON.parse(Buffer.concat(partes).toString('utf8'));

  expect(arquivo.app).toBe('clinica-psi');
  expect(arquivo.tipo).toBe('configuracoes');
  expect(arquivo.dados.config.clinic.name).toBeTruthy();
  expect(Array.isArray(arquivo.dados.services)).toBe(true);
  // o arquivo avisa sozinho o que está dentro
  expect(arquivo.aviso).toContain('paciente');

  // nenhuma chave de dado clinico pode ter viajado
  const texto = JSON.stringify(arquivo);
  for (const proibida of [
    'patients',
    'evolutions',
    'appointments',
    'consents',
    'professionals',
    'password',
    'passwordHash',
  ]) {
    expect(texto).not.toContain(proibida);
  }
  // e nenhum nome de paciente do demo
  expect(texto).not.toContain('Juliana Martins');
  expect(texto).not.toContain('ana@clinica.com.br');
});

/** Monta um arquivo de configuracoes como se viesse de outra maquina. */
function arquivoDeConfiguracoes(extra?: Record<string, unknown>) {
  return {
    app: 'clinica-psi',
    tipo: 'configuracoes',
    versao: 1,
    geradoEm: new Date().toISOString(),
    origem: 'Dra.Outra.Profissional',
    aviso: 'arquivo de teste',
    dados: {
      config: {
        clinic: {
          name: 'Clínica/shared',
          unit: 'Unidade.Teste',
          address: 'Rua de Teste, 1',
          phone: '(11) 2000-0000',
          email: 'contato@teste.com.br',
          responsible: 'Dra. Outra Profissional',
          document: '99.999.999/0001-00',
          website: '',
        },
        brand: { acronym: 'CS' },
        texts: { systemName: 'Sistema Compartilhado', loginSubtitle: 'Subtítulo compartilhado' },
        consent: { version: '2.0' },
        demo: false,
        ...extra,
      },
      services: [
        {
          id: 'servico-compartilhado',
          name: 'Terapia Casal',
          description: 'Atendimento em casal',
          durationMin: 80,
          color: '#334155',
          active: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    },
  };
}

test('importar substituindo traz a clínica e os serviços de outro computador', async ({ page }) => {
  await login(page);
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Dados', exact: true }).click();

  await escolherArquivo(page, 'Importar configurações substituindo', Buffer.from(JSON.stringify(arquivoDeConfiguracoes()), 'utf8'));

  await expect(page.locator('.toast', { hasText: 'Configurações importadas' }).last()).toBeVisible();
  await expect(page.locator('.toast').last()).toContainText('Nenhum dado de paciente veio junto');

  const config = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('clinica-psi-config') || '{}')
  );
  expect(config.clinic.name).toBe('Clínica/shared');
  expect(config.texts.systemName).toBe('Sistema Compartilhado');
  // e a tela passa a usar a identidade recebida
  await expect(page.locator('.sidebar-title strong')).toContainText('Clínica/shared');

  // os serviços entraram junto
  const servicos = await page.evaluate(
    () => JSON.parse(localStorage.getItem('clinica-psi-services') || '[]') as { name: string }[]
  );
  expect(servicos.map((s) => s.name)).toContain('Terapia Casal');

  // o que é dado clínico continua intacto
  const pacientes = await page.evaluate(
    () => JSON.parse(localStorage.getItem('clinica-psi-patients') || '[]').length
  );
  expect(pacientes).toBeGreaterThan(0);

  // a importação fica registrada na tela
  await expect(page.getByTestId('ultima-importacao')).toContainText('Dra.Outra.Profissional');
  expect(errors).toEqual([]);
});

test('importar completando vazios não sobrescreve o que já foi ajustado', async ({ page }) => {
  await login(page);
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Dados', exact: true }).click();

  // ajusta a identidade na mão: nome preenchido, unidade em branco
  await page.evaluate(() => {
    const KEY = 'clinica-psi-config';
    const c = JSON.parse(localStorage.getItem(KEY) || '{}');
    localStorage.setItem(
      KEY,
      JSON.stringify({ ...c, clinic: { ...c.clinic, name: 'Minha Clínica', unit: '' } })
    );
  });
  await page.reload();
  await page.getByRole('button', { name: 'Dados', exact: true }).click();

  await escolherArquivo(page, 'Importar completando vazios', Buffer.from(JSON.stringify(arquivoDeConfiguracoes()), 'utf8'));
  await expect(page.locator('.toast', { hasText: 'Configurações importadas' }).last()).toBeVisible();

  const config = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('clinica-psi-config') || '{}')
  );
  // o nome que já estava preenchido foi preservado
  expect(config.clinic.name).toBe('Minha Clínica');
  // mas o que estava em branco entrou
  expect(config.clinic.unit).toBe('Unidade.Teste');
  // e os serviços do arquivo entraram sem repetir os que já existiam
  const servicos = await page.evaluate(
    () => JSON.parse(localStorage.getItem('clinica-psi-services') || '[]') as { name: string }[]
  );
  expect(servicos.map((s) => s.name)).toContain('Terapia Casal');
  expect(new Set(servicos.map((s) => s.name)).size).toBe(servicos.length);
  expect(errors).toEqual([]);
});

test('arquivo que não é de configurações é recusado sem alterar nada', async ({ page }) => {
  await login(page);
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Dados', exact: true }).click();

  // deixa a configuracao gravada, para comparar antes e depois
  await page.evaluate(() => {
    const KEY = 'clinica-psi-config';
    const c = JSON.parse(localStorage.getItem(KEY) || '{}');
    localStorage.setItem(
      KEY,
      JSON.stringify({ ...c, clinic: { ...c.clinic, name: 'Clínica que fica' } })
    );
  });
  await page.reload();
  await page.getByRole('button', { name: 'Dados', exact: true }).click();

  // um backup completo tem paciente dentro: não pode entrar por esta porta
  await escolherArquivo(
    page,
    'Importar configurações substituindo',
    Buffer.from(
      JSON.stringify({ app: 'clinica-psi', tipo: 'backup', dados: { patients: [{ name: 'X' }] } }),
      'utf8'
    )
  );

  await expect(page.locator('.toast').last()).toContainText('não é um arquivo de configurações');
  const config = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('clinica-psi-config') || '{}')
  );
  expect(config.clinic.name).toBe('Clínica que fica');
  expect(errors).toEqual([]);
});
