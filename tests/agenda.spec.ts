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
  // a apresentacao volta a abrir depois do clear e bloqueia os cliques
  await semApresentacao(page);
  await page.reload();
  await page.locator('#email').fill('ana@clinica.com.br');
  await page.locator('#password').fill('123456');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.getByRole('link', { name: 'Agenda' }).click();
  await expect(page).toHaveURL(/\/agenda$/);
  await expect(page.locator('.card', { hasText: 'Sessões de' })).toBeVisible();
});

/** o beforeEach ja deixa a pagina na Agenda; usado para deixar a intencao explicita. */
async function irParaAgenda(page: Page) {
  if (!/\/agenda$/.test(page.url())) {
    await page.getByRole('link', { name: 'Agenda' }).click();
    await expect(page).toHaveURL(/\/agenda$/);
  }
  await expect(page.locator('.card', { hasText: 'Sessões de' })).toBeVisible();
}

function sessoes(page: Page) {
  return page.locator('.card', { hasText: 'Sessões de' }).locator('.tl-item');
}

function sessaoDe(page: Page, nome: string) {
  return sessoes(page).filter({ hasText: nome });
}

async function printHtml(page: Page) {
  return page.locator('#print-root').innerHTML();
}

test('mostra as duas sessões de hoje com serviço, profissional e duração', async ({ page }) => {
  await expect(sessoes(page)).toHaveCount(2);

  const juliana = sessaoDe(page, 'Juliana Martins');
  await expect(juliana).toContainText('Terapia Individual · Ana Ribeiro');
  await expect(juliana).toContainText('50 min');
  await expect(juliana).toContainText('Confirmado');

  const rafael = sessaoDe(page, 'Rafael Duarte');
  await expect(rafael).toContainText('Avaliação Psicológica · Ana Ribeiro');
  await expect(rafael).toContainText('90 min');
  await expect(rafael).toContainText('Trazer documentos escolares.');
  await expect(rafael).toContainText('Agendado');
  expect(errors).toEqual([]);
});

test('"Hoje" some quando já estamos na data atual', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Hoje' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Próxima →' }).click();
  await expect(page.getByRole('button', { name: 'Hoje' })).toBeVisible();

  await page.getByRole('button', { name: 'Hoje' }).click();
  await expect(page.getByRole('button', { name: 'Hoje' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('navegar entre os dias mostra a sessão de dois dias à frente', async ({ page }) => {
  await expect(sessoes(page)).toHaveCount(2);

  await page.getByRole('button', { name: '← Anterior' }).click();
  await expect(sessoes(page)).toHaveCount(0);
  await expect(page.locator('.empty')).toContainText('Nenhuma sessão nesta data');

  // volta para hoje e avanca dois dias: o seed tem sessao de Juliana com Marcos
  await page.getByRole('button', { name: 'Próxima →' }).click();
  await expect(sessoes(page)).toHaveCount(2);

  await page.getByRole('button', { name: 'Próxima →' }).click();
  await expect(sessoes(page)).toHaveCount(0);

  await page.getByRole('button', { name: 'Próxima →' }).click();
  await expect(sessoes(page)).toHaveCount(1);
  await expect(sessoes(page).first()).toContainText('Marcos Lima');
  expect(errors).toEqual([]);
});

test('filtros por profissional e serviço recortam o dia', async ({ page }) => {
  const porProfissional = page.getByLabel('Filtrar por profissional');
  const porServico = page.getByLabel('Filtrar por serviço');

  // profissional Marcos (2222) nao tem sessao hoje
  await porProfissional.selectOption({ label: 'Marcos Lima' });
  await expect(sessoes(page)).toHaveCount(0);

  await porProfissional.selectOption({ label: 'Ana Ribeiro' });
  await expect(sessoes(page)).toHaveCount(2);

  await porServico.selectOption({ label: 'Terapia Individual' });
  await expect(sessoes(page)).toHaveCount(1);
  await expect(sessoes(page)).toContainText('Juliana Martins');

  await porServico.selectOption({ label: 'Todos os serviços' });
  await expect(sessoes(page)).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('Confirmar move a sessão de Agendado para Confirmado', async ({ page }) => {
  const rafael = sessaoDe(page, 'Rafael Duarte');
  await expect(rafael).toContainText('Agendado');

  await rafael.getByRole('button', { name: 'Confirmar' }).click();

  await expect(rafael).toContainText('Confirmado');
  await expect(rafael.getByRole('button', { name: 'Confirmar' })).toHaveCount(0);
  await expect(page.locator('.toast')).toContainText('confirmada');
  expect(errors).toEqual([]);
});

test('Realizado fecha a sessão e libera a opção Reabrir', async ({ page }) => {
  const juliana = sessaoDe(page, 'Juliana Martins');
  await juliana.getByRole('button', { name: 'Realizado' }).click();

  await expect(juliana).toContainText('Realizado');
  await expect(juliana.getByRole('button', { name: 'Realizado' })).toHaveCount(0);
  await expect(juliana.getByRole('button', { name: 'Faltou' })).toHaveCount(0);
  await expect(juliana.getByRole('button', { name: 'Cancelar' })).toHaveCount(0);
  await expect(juliana.getByRole('button', { name: 'Reabrir' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Faltou e Cancelar registram a não.comparecimento', async ({ page }) => {
  await sessaoDe(page, 'Juliana Martins').getByRole('button', { name: 'Faltou' }).click();
  const juliana = sessaoDe(page, 'Juliana Martins');
  await expect(juliana).toContainText('Faltou');
  await expect(juliana.getByRole('button', { name: 'Reabrir' })).toBeVisible();

  await juliana.getByRole('button', { name: 'Reabrir' }).click();
  await expect(juliana).toContainText('Agendado');

  await juliana.getByRole('button', { name: 'Cancelar' }).click();
  await expect(juliana).toContainText('Cancelado');
  expect(errors).toEqual([]);
});

test('Excluir remove a sessão do dia', async ({ page }) => {
  await expect(sessoes(page)).toHaveCount(2);

  await sessaoDe(page, 'Rafael Duarte').getByRole('button', { name: 'Excluir' }).click();

  await expect(sessoes(page)).toHaveCount(1);
  await expect(sessoes(page)).toContainText('Juliana Martins');
  await expect(page.locator('.toast')).toContainText('Sessão excluída.');

  const agendamentos = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('clinica-psi-appointments') || '[]')
  );
  expect(agendamentos).toHaveLength(2);
  expect(errors).toEqual([]);
});

test('Editar abre o formulário preenchido', async ({ page }) => {
  await sessaoDe(page, 'Rafael Duarte').getByRole('button', { name: 'Editar' }).click();

  await expect(page.locator('.modal-head h3')).toHaveText('Editar agendamento');
  await expect(page.locator('.modal #ag-patient')).toHaveValue(/bbbbbbbb/);
  await expect(page.locator('.modal #ag-notes')).toHaveValue('Trazer documentos escolares.');
  await expect(page.locator('.modal #ag-duration')).toHaveValue('90');
  expect(errors).toEqual([]);
});

test('card Próximos atendimentos lista sessões futuras', async ({ page }) => {
  const card = page.locator('.card', { hasText: 'Próximos atendimentos' });
  await expect(card).toBeVisible();

  const itens = card.locator('.tl-item');
  await expect(itens.first()).toBeVisible();
  await expect(card).toContainText('Juliana Martins');
  await expect(card).toContainText('Terapia Individual');
  expect(errors).toEqual([]);
});

test('PDF da agenda monta o documento do dia filtrado', async ({ page }) => {
  await page.getByRole('button', { name: 'PDF da agenda' }).click();

  let html = await printHtml(page);
  expect(html).toContain('Agenda do Dia');
  expect(html).toContain('Juliana Martins');
  expect(html).toContain('Rafael Duarte');
  // cabecalho + 2 sessoes
  expect(html.match(/<tr>/g)?.length).toBe(3);

  // o PDF respeita o filtro de servico
  await page.getByLabel('Filtrar por serviço').selectOption({ label: 'Terapia Individual' });
  await page.getByRole('button', { name: 'PDF da agenda' }).click();
  html = await printHtml(page);
  expect(html).toContain('Juliana Martins');
  expect(html).not.toContain('Rafael Duarte');
  expect(errors).toEqual([]);
});


test('filtros de profissional e serviço não se sobrepõem e não cortam o texto', async ({ page }) => {
  await irParaAgenda(page);

  const medir = () =>
    page.evaluate(() => {
      const psi = document.querySelector(
        'select[aria-label="Filtrar por profissional"]'
      ) as HTMLSelectElement;
      const srv = document.querySelector(
        'select[aria-label="Filtrar por serviço"]'
      ) as HTMLSelectElement;
      const a = psi.getBoundingClientRect();
      const b = srv.getBoundingClientRect();
      const cs = getComputedStyle(psi);
      const pai = psi.parentElement as HTMLElement;
      const rp = pai.getBoundingClientRect();

      // altura util: clientHeight ja desconta a borda, falta o padding
      const padV = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const conteudo = psi.clientHeight - padV;

      const probe = document.createElement('div');
      probe.style.cssText =
        'position:absolute;visibility:hidden;font-size:14px;line-height:normal;font-family:' +
        cs.fontFamily;
      probe.textContent = psi.options[psi.selectedIndex]?.text || '';
      document.body.appendChild(probe);
      const linha = probe.getBoundingClientRect().height;
      probe.remove();

      return {
        sobrepoe: a.right > b.left + 0.5,
        psiVaza: a.right > rp.right + 0.5,
        srvVaza: b.right > rp.right + 0.5,
        conteudo,
        linha,
        psiL: Math.round(a.left),
        psiR: Math.round(a.right),
        srvL: Math.round(b.left),
      };
    });

  for (const largura of [1440, 1280, 1024, 900, 700]) {
    await page.setViewportSize({ width: largura, height: 900 });
    await page.waitForTimeout(150);
    const d = await medir();

    // os dois seletores convivem sem se cruzar
    expect(d.sobrepoe, `sobreposição a ${largura}px`).toBe(false);
    expect(d.psiVaza, `filtro de profissional estoura a linha a ${largura}px`).toBe(false);
    expect(d.srvVaza, `filtro de serviço estoura a linha a ${largura}px`).toBe(false);

    // e o texto cabe inteiro na caixa: a linha precisa caber no conteudo
    expect(d.linha, `texto cortado a ${largura}px (conteudo ${d.conteudo}px)`).toBeLessThanOrEqual(
      d.conteudo + 0.5
    );
  }
});

test('rótulo longo nos filtros não empurra nem sobrepõe o outro campo', async ({ page }) => {
  await page.evaluate(async () => {
    const { professionalRepository } = await import('/src/repositories/index.ts');
    const { serviceRepository } = await import('/src/repositories/index.ts');
    await professionalRepository.create({
      name: 'Dra. Ana Beatriz Ribeiro Nogueira de Albuquerque Santos',
      email: 'nome.longo@clinica.com.br',
      crp: 'CRP 06/12345',
      role: 'psychologist',
      status: 'active',
    } as never);
    await serviceRepository.create({
      name: 'Termo de Consentimento para Tratamento Psicológico',
      color: 'blue',
      durationMin: 50,
      status: 'active',
    } as never);
  });

  await page.reload();
  // a sessao pode sobreviver ao reload; so faz login se a tela de login aparecer
  if (await page.locator('#email').isVisible().catch(() => false)) {
    await page.locator('#email').fill('ana@clinica.com.br');
    await page.locator('#password').fill('123456');
    await page.getByRole('button', { name: 'Entrar' }).click();
  }
  await irParaAgenda(page);

  for (const largura of [1280, 900]) {
    await page.setViewportSize({ width: largura, height: 900 });
    await page.waitForTimeout(150);
    const d = await page.evaluate(() => {
      const psi = document.querySelector(
        'select[aria-label="Filtrar por profissional"]'
      ) as HTMLSelectElement;
      const srv = document.querySelector(
        'select[aria-label="Filtrar por serviço"]'
      ) as HTMLSelectElement;
      const a = psi.getBoundingClientRect();
      const b = srv.getBoundingClientRect();
      const pai = psi.parentElement as HTMLElement;
      const rp = pai.getBoundingClientRect();
      return {
        sobrepoe: a.right > b.left + 0.5,
        psiVaza: a.right > rp.right + 0.5,
        srvVaza: b.right > rp.right + 0.5,
      };
    });
    expect(d.sobrepoe, `sobreposição com nome longo a ${largura}px`).toBe(false);
    expect(d.psiVaza).toBe(false);
    expect(d.srvVaza).toBe(false);
  }

  expect(errors).toEqual([]);
});
test('+ Nova sessão já vem com a data selecionada e a cria no dia', async ({ page }) => {
  await page.getByRole('button', { name: 'Próxima →' }).click();
  const dataSelecionada = await page.getByLabel('Data da agenda').inputValue();

  await page.getByRole('button', { name: '+ Nova sessão' }).click();
  await expect(page.locator('.modal-head h3')).toHaveText('Novo agendamento');
  await expect(page.locator('.modal #ag-start')).toHaveValue(`${dataSelecionada}T14:00`);

  // Beatriz nao tem sessao no seed, entao nao conflita com ninguem
  await page.locator('.modal #ag-patient').selectOption({ label: 'Beatriz Rocha' });
  await page.getByRole('button', { name: 'Agendar sessão', exact: true }).click();

  await expect(page.locator('.modal')).toHaveCount(0);
  await expect(sessoes(page)).toHaveCount(1);
  await expect(sessoes(page)).toContainText('Beatriz Rocha');
  expect(errors).toEqual([]);
});
