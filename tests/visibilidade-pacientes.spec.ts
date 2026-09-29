import { test, expect, type Page } from '@playwright/test';
import { semApresentacao } from './helpers';

/**
 * Visibilidade por profissional responsavel.
 *
 * O seed nao define responsavel, entao os tres pacientes ficam visiveis para
 * todo mundo. E o que garante que um cadastro novo nao suma da lista de quem
 * acabou de cria-lo, e o que mantem os testes antigos valendo.
 *
 * Regra: administrador ve tudo; profissional ve os proprios e os sem
 * responsavel definido.
 */

const ANA = 'ana@clinica.com.br';
const MARCOS = 'marcos@clinica.com.br';
const ID_ANA = '11111111-1111-4111-8111-111111111111';
const ID_MARCOS = '22222222-2222-4222-8222-222222222222';
const SEM_RESP = 'sem-responsavel';

async function entrar(page: Page, email: string) {
  await page.goto('/login');
  await semApresentacao(page);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill('123456');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/dashboard/);
}

/** Troca de conta de verdade: sair e entrar, senao a sessao antiga manda. */
async function trocarPara(page: Page, email: string) {
  await page.getByRole('button', { name: /Sair do sistema/i }).click();
  await expect(page).toHaveURL(/login/);
  await entrar(page, email);
}

/** Reparte os pacientes do seed entre os dois profissionais. */
async function distribuir(page: Page, plano: { nome: string; responsavel: string }[]) {
  await page.evaluate((plano) => {
    const lista = JSON.parse(localStorage.getItem('clinica-psi-patients') || '[]');
    for (const item of plano) {
      const alvo = lista.find((p: { name: string }) => p.name === item.nome);
      if (!alvo) throw new Error(`Paciente do seed ausente: ${item.nome}`);
      if (item.responsavel === 'sem-responsavel') delete alvo.professionalId;
      else alvo.professionalId = item.responsavel;
    }
    localStorage.setItem('clinica-psi-patients', JSON.stringify(lista));
  }, plano);
  await page.reload();
}

const JULIANA = 'Juliana Martins';
const RAFAEL = 'Rafael Duarte';
const BEATRIZ = 'Beatriz Rocha';

/**
 * allTextContents nao espera: a leitura do repositorio e assincrona e os cards
 * aparecem depois da navegacao. Sem esta espera a lista volta vazia.
 */
async function lista(page: Page): Promise<string[]> {
  await expect(page.locator('.patient-card').first()).toBeVisible();
  return page.locator('.patient-card .pc-name').allTextContents();
}

/** Abre o formulario e espera os servicos chegarem, senao o select required
 *  fica vazio e o navegador barra o envio. */
async function abrirNovoPaciente(page: Page) {
  await page.getByRole('button', { name: /novo paciente/i }).click();
  await expect(page.locator('.modal #np-name')).toBeVisible();
  await expect(page.locator('.modal #np-service')).not.toHaveValue('');
}

/** O painel so preenche o total depois da leitura do repositorio; sem esperar
 *  a leitura pega o 0 inicial e o teste reprova sem nenhum motivo real. */
async function totalPainel(page: Page): Promise<string> {
  await expect(page.getByText('Carregando…')).toHaveCount(0);
  const card = page.locator('.card.stat', { hasText: 'Total de Pacientes' });
  return (await card.locator('.value').textContent()) || '';
}

test('sem responsavel definido o paciente aparece para todo mundo', async ({ page }) => {
  await entrar(page, MARCOS);
  await distribuir(page, [
    { nome: JULIANA, responsavel: SEM_RESP },
    { nome: RAFAEL, responsavel: SEM_RESP },
    { nome: BEATRIZ, responsavel: SEM_RESP },
  ]);

  await page.goto('/patients');
  expect((await lista(page)).sort()).toEqual([BEATRIZ, JULIANA, RAFAEL].sort());

  await trocarPara(page, ANA);
  await page.goto('/patients');
  expect((await lista(page)).length).toBe(3);
});

test('quem nao administra ve os proprios pacientes e os sem responsavel', async ({ page }) => {
  await entrar(page, ANA);
  await distribuir(page, [
    { nome: JULIANA, responsavel: ID_MARCOS },
    { nome: RAFAEL, responsavel: ID_ANA },
    { nome: BEATRIZ, responsavel: SEM_RESP },
  ]);

  // o Marcos nao administra: ve o dele e o sem responsavel, o da Ana nao
  await trocarPara(page, MARCOS);
  await page.goto('/patients');
  expect((await lista(page)).sort()).toEqual([BEATRIZ, JULIANA].sort());

  // a Ana administra: o cargo manda sobre a responsabilidade
  await trocarPara(page, ANA);
  await page.goto('/patients');
  expect((await lista(page)).length).toBe(3);
});

test('quem administra ve todos os pacientes', async ({ page }) => {
  await entrar(page, ANA);
  await distribuir(page, [
    { nome: JULIANA, responsavel: ID_MARCOS },
    { nome: RAFAEL, responsavel: ID_ANA },
    { nome: BEATRIZ, responsavel: ID_MARCOS },
  ]);
  await page.goto('/patients');
  expect((await lista(page)).length).toBe(3);
});

test('a URL direta de um paciente de outro profissional nao abre a ficha', async ({ page }) => {
  await entrar(page, ANA);
  await distribuir(page, [{ nome: JULIANA, responsavel: ID_ANA }]);
  const id = await page.evaluate(
    (nome) =>
      JSON.parse(localStorage.getItem('clinica-psi-patients') || '[]').find(
        (p: { name: string }) => p.name === nome
      ).id,
    JULIANA
  );

  await trocarPara(page, MARCOS);
  await page.goto(`/patients/${id}`);
  await expect(page.getByText('Paciente indisponível')).toBeVisible();
  await expect(page.locator('.pc-name')).toHaveCount(0);
});

test('quem cadastra um paciente fica com ele na lista', async ({ page }) => {
  await entrar(page, MARCOS);
  await page.goto('/patients');
  await abrirNovoPaciente(page);
  await page.locator('.modal #np-name').fill('Paciente do Marcos');
  await page.locator('.modal #np-phone').fill('11988887777');
  await page.getByRole('button', { name: /cadastrar paciente/i }).click();
  await expect(page).toHaveURL(/\/patients\//);

  await page.goto('/patients');
  expect((await lista(page)).join(' ')).toContain('Paciente do Marcos');

  // a Ana tambem ve: paciente sem outro dono nao fica preso no Marcos
  await trocarPara(page, ANA);
  await page.goto('/patients');
  expect((await lista(page)).join(' ')).toContain('Paciente do Marcos');
});

test('quem nao administra nao ve o campo de profissional responsavel', async ({ page }) => {
  await entrar(page, MARCOS);
  await page.goto('/patients');
  await abrirNovoPaciente(page);
  await expect(page.locator('#np-profissional')).toHaveCount(0);
  // o "Responsavel" do paciente (contato) continua la: sao coisas diferentes
  await expect(page.locator('#np-responsible')).toBeVisible();
});

test('quem administra escolhe o profissional responsavel', async ({ page }) => {
  await entrar(page, ANA);
  await page.goto('/patients');
  await abrirNovoPaciente(page);
  await expect(page.locator('#np-profissional')).toBeVisible();
  await page.locator('.modal #np-name').fill('Transferido');
  await page.locator('.modal #np-phone').fill('11977776666');
  await page.locator('#np-profissional').selectOption(ID_MARCOS);
  await page.getByRole('button', { name: /cadastrar paciente/i }).click();
  await expect(page).toHaveURL(/\/patients\//);

  const guardado = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('clinica-psi-patients') || '[]').find(
        (p: { name: string }) => p.name === 'Transferido'
      )?.professionalId
  );
  expect(guardado).toBe(ID_MARCOS);

  await trocarPara(page, MARCOS);
  await page.goto('/patients');
  expect((await lista(page)).join(' ')).toContain('Transferido');
});

test('quem cadastra nao consegue se atribuir a um paciente de outro', async ({ page }) => {
  await entrar(page, MARCOS);
  await page.goto('/patients');
  await abrirNovoPaciente(page);
  // o campo nao existe, mas o valor pode ser forjado no formulario
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'professionalId';
    input.value = '22222222-2222-4222-8222-222222222222';
    document.querySelector('#np-name')?.closest('form')?.appendChild(input);
  });
  await page.locator('.modal #np-name').fill('Forjado');
  await page.locator('.modal #np-phone').fill('11966665555');
  await page.getByRole('button', { name: /cadastrar paciente/i }).click();
  await expect(page).toHaveURL(/\/patients\//);

  const guardado = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('clinica-psi-patients') || '[]').find(
        (p: { name: string }) => p.name === 'Forjado'
      )?.professionalId
  );
  expect(guardado).toBe(ID_MARCOS);
});

test('o total do painel nao entrega a clinica inteira para quem nao administra', async ({ page }) => {
  await entrar(page, ANA);
  await distribuir(page, [
    { nome: JULIANA, responsavel: ID_ANA },
    { nome: RAFAEL, responsavel: ID_ANA },
    { nome: BEATRIZ, responsavel: ID_MARCOS },
  ]);
  expect(await totalPainel(page)).toBe('3');

  await trocarPara(page, MARCOS);
  expect(await totalPainel(page)).toBe('1');
});
