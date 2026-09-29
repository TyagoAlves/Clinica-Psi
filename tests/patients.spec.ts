import { test, expect } from '@playwright/test';
import { semApresentacao } from './helpers';
import type { Page } from '@playwright/test';

const errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('dialog', (d) => void d.accept());

  await page.goto('/login');
  await page.evaluate(() => localStorage.clear());
  // o tour volta a abrir depois do clear e bloqueia os cliques
  await semApresentacao(page);
  await page.reload();
  await page.locator('#email').fill('ana@clinica.com.br');
  await page.locator('#password').fill('123456');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});

async function irParaPacientes(page: Page) {
  // o breadcrumb tambem tem um link "Pacientes"; alvo a navegacao lateral
  await page.getByRole('navigation').getByRole('link', { name: 'Pacientes' }).click();
  await expect(page).toHaveURL(/\/patients$/);
  await expect(page.locator('.patient-card').first()).toBeVisible();
}

async function abrirPaciente(page: Page, nome: string) {
  await irParaPacientes(page);
  await page.locator('.patient-card').filter({ hasText: nome }).click();
  await expect(page).toHaveURL(/\/patients\/.+/);
  await expect(page.locator('.detail-head')).toBeVisible();
}

/** Timeline de evolucoes: a mesma classe .tl-item e usada na lista de sessoes. */
function evolucoes(page: Page) {
  return page.locator('.card', { hasText: 'Evoluções' }).locator('.tl-item');
}

async function printHtml(page: Page) {
  return page.locator('#print-root').innerHTML();
}

test('card do paciente mostra idade e contagem de evoluções', async ({ page }) => {
  await irParaPacientes(page);

  const juliana = page.locator('.patient-card').filter({ hasText: 'Juliana Martins' });
  await expect(juliana).toContainText('(11) 98888-0001 · 34 anos');
  await expect(juliana).toContainText('2 evolução(ões) · última em 16/02/2026');
  await expect(juliana).toContainText('Em tratamento');

  const beatriz = page.locator('.patient-card').filter({ hasText: 'Beatriz Rocha' });
  await expect(beatriz).toContainText('28 anos');
  await expect(beatriz).toContainText('Nenhuma evolução registrada');
  await expect(beatriz).toContainText('Pausado');

  expect(errors).toEqual([]);
});

test('filtro por serviço recorta a lista', async ({ page }) => {
  await irParaPacientes(page);
  await expect(page.locator('.patient-card')).toHaveCount(3);

  await page.locator('.chip', { hasText: 'Terapia Individual' }).click();
  await expect(page.locator('.patient-card')).toHaveCount(2);
  await expect(page.locator('.patient-card').filter({ hasText: 'Rafael Duarte' })).toHaveCount(0);

  await page.locator('.chip', { hasText: 'Avaliação Psicológica' }).click();
  await expect(page.locator('.patient-card')).toHaveCount(1);
  await expect(page.locator('.patient-card')).toContainText('Rafael Duarte');

  await page.locator('.chip', { hasText: 'Todos' }).click();
  await expect(page.locator('.patient-card')).toHaveCount(3);
  expect(errors).toEqual([]);
});

test('prontuário oferece todas as ações da POC', async ({ page }) => {
  await abrirPaciente(page, 'Juliana Martins');

  await expect(page.getByText('Cadastrado em')).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Nova evolução' })).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Agendar sessão' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar cadastro' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'PDF do prontuário' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'PDF de cada evolução' })).toBeVisible();
  await expect(page.locator('.detail-head').getByRole('button', { name: 'Excluir' })).toBeVisible();

  // descricao em card proprio
  await expect(page.locator('.card', { hasText: 'Descrição / queixa' })).toContainText(
    'Acompanhamento de ansiedade'
  );

  // acoes de cada evolucao
  await expect(evolucoes(page)).toHaveCount(2);
  const evo = evolucoes(page).filter({ hasText: 'linha de base' });
  await expect(evo.getByRole('button', { name: 'Editar' })).toBeVisible();
  await expect(evo.getByRole('button', { name: 'Gerar PDF' })).toBeVisible();
  await expect(evo.getByRole('button', { name: 'Excluir' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('editar cadastro salva e reflete na listagem', async ({ page }) => {
  await abrirPaciente(page, 'Rafael Duarte');

  await page.getByRole('button', { name: 'Editar cadastro' }).click();
  await expect(page.locator('.modal-head h3')).toHaveText('Editar paciente');

  // o formulario abre preenchido
  await expect(page.locator('.modal #np-name')).toHaveValue('Rafael Duarte');
  await expect(page.locator('.modal #np-phone')).toHaveValue('(11) 97777-0002');
  await expect(page.locator('.modal #np-description')).toHaveValue('Primeira avaliação.');

  await page.locator('.modal #np-name').fill('Rafael Duarte Filho');
  await page.locator('.modal #np-status').selectOption('paused');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();

  await expect(page.locator('.modal')).toHaveCount(0);
  await expect(page.locator('.detail-head h3')).toHaveText('Rafael Duarte Filho');
  await expect(page.locator('.detail-head')).toContainText('Pausado');
  await expect(page.locator('.toast')).toContainText('atualizado');

  await irParaPacientes(page);
  await expect(page.locator('.patient-card').filter({ hasText: 'Rafael Duarte Filho' })).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('editar cadastro não pode ficar sem nome', async ({ page }) => {
  await abrirPaciente(page, 'Juliana Martins');
  await page.getByRole('button', { name: 'Editar cadastro' }).click();
  await page.locator('.modal #np-name').fill('   ');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();

  await expect(page.locator('.modal .form-error')).toContainText('Informe o nome');
  await expect(page.locator('.modal')).toBeVisible();
  expect(errors).toEqual([]);
});

test('excluir evolução remove só aquele registro', async ({ page }) => {
  await abrirPaciente(page, 'Juliana Martins');
  await expect(evolucoes(page)).toHaveCount(2);

  await evolucoes(page).filter({ hasText: 'psicoeducação' }).getByRole('button', { name: 'Excluir' }).click();

  await expect(evolucoes(page)).toHaveCount(1);
  await expect(evolucoes(page)).toContainText('linha de base');
  await expect(page.locator('.toast')).toContainText('Evolução excluída');

  await irParaPacientes(page);
  await expect(page.locator('.patient-card').filter({ hasText: 'Juliana Martins' })).toContainText(
    '1 evolução(ões)'
  );
  expect(errors).toEqual([]);
});

test('excluir paciente leva as evoluções junto e volta para a lista', async ({ page }) => {
  await abrirPaciente(page, 'Juliana Martins');
  await page.locator('.detail-head').getByRole('button', { name: 'Excluir' }).click();

  await expect(page).toHaveURL(/\/patients$/);
  await expect(page.locator('.toast')).toContainText('Paciente excluído com 2 evolução(ões)');
  await expect(page.locator('.patient-card')).toHaveCount(2);

  const restantes = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('clinica-psi-evolutions') || '[]').map((e: { patientId: string }) => e.patientId)
  );
  expect(restantes).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('agendar sessão pelo prontuário cria o agendamento', async ({ page }) => {
  await abrirPaciente(page, 'Juliana Martins');

  await page.getByRole('button', { name: '+ Agendar sessão' }).click();
  await expect(page.locator('.modal-head h3')).toHaveText('Novo agendamento');
  await expect(page.locator('.modal #ag-patient')).toHaveValue(/bbbbbbbb/);

  await page.locator('.modal #ag-start').fill('2026-10-05T10:00');
  await page.locator('.modal #ag-notes').fill('Sessão de acompanhamento.');
  await page.locator('.modal').getByRole('button', { name: 'Agendar sessão', exact: true }).click();

  await expect(page.locator('.modal')).toHaveCount(0);
  await expect(page.locator('.toast')).toContainText('Sessão agendada.');

  const agendamentos = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('clinica-psi-appointments') || '[]')
  );
  expect(agendamentos).toHaveLength(4);
  expect(agendamentos[3].notes).toBe('Sessão de acompanhamento.');
  expect(errors).toEqual([]);
});

test('bloqueia conflito de horário do mesmo profissional', async ({ page }) => {
  await abrirPaciente(page, 'Juliana Martins');

  // primeira sessao as 10:00
  await page.getByRole('button', { name: '+ Agendar sessão' }).click();
  await page.locator('.modal #ag-start').fill('2026-10-05T10:00');
  await page.locator('.modal').getByRole('button', { name: 'Agendar sessão', exact: true }).click();
  await expect(page.locator('.modal')).toHaveCount(0);

  // segunda no mesmo horario, mesmo profissional padrao
  await page.getByRole('button', { name: '+ Agendar sessão' }).click();
  await page.locator('.modal #ag-start').fill('2026-10-05T10:30');
  await page.locator('.modal').getByRole('button', { name: 'Agendar sessão', exact: true }).click();

  await expect(page.locator('.modal .form-error')).toContainText('Conflito de horário');
  await expect(page.locator('.modal')).toBeVisible();

  const agendamentos = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('clinica-psi-appointments') || '[]')
  );
  expect(agendamentos).toHaveLength(4);
  expect(errors).toEqual([]);
});

test('editar sessão existente pelo prontuário', async ({ page }) => {
  await abrirPaciente(page, 'Rafael Duarte');
  await page.getByRole('button', { name: '+ Agendar sessão' }).click();
  await expect(page.locator('.modal-head h3')).toHaveText('Novo agendamento');
  await page.getByRole('button', { name: 'Cancelar' }).click();

  // a sessao do seed aparece na timeline
  const sessao = page.locator('.card', { hasText: 'Sessões' }).locator('.tl-item').first();
  await sessao.getByRole('button', { name: 'Editar' }).click();
  await expect(page.locator('.modal-head h3')).toHaveText('Editar agendamento');

  await page.locator('.modal #ag-status').selectOption('confirmed');
  await page.locator('.modal').getByRole('button', { name: 'Salvar alterações' }).click();

  await expect(page.locator('.modal')).toHaveCount(0);
  await expect(page.locator('.toast')).toContainText('Agendamento atualizado');
  expect(errors).toEqual([]);
});

test('PDF do prontuário e PDF da evolução montam o documento', async ({ page }) => {
  await abrirPaciente(page, 'Juliana Martins');

  await page.getByRole('button', { name: 'PDF do prontuário' }).click();
  let html = await printHtml(page);
  expect(html).toContain('Prontuário Completo');
  expect(html).toContain('2 registro(s)');
  expect(html).toContain('linha de base');
  expect(html).toContain('psicoeducação');

  await evolucoes(page).filter({ hasText: 'psicoeducação' }).getByRole('button', { name: 'Gerar PDF' }).click();
  html = await printHtml(page);
  expect(html).toContain('Registro de Evolução');
  expect(html).toContain('psicoeducação');
  expect(html).not.toContain('linha de base');
  expect(errors).toEqual([]);
});

test('PDF de cada evolução avisa quando não há nenhuma', async ({ page }) => {
  await abrirPaciente(page, 'Beatriz Rocha');
  await page.getByRole('button', { name: 'PDF de cada evolução' }).click();

  await expect(page.locator('.toast')).toContainText('ainda não possui evoluções');
  await expect(page.locator('#print-root')).toBeEmpty();
  expect(errors).toEqual([]);
});
