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

  // o seed agora traz 2 termos de demonstracao (como a POC); estes testes
  // exercitam o fluxo a partir de zero, entao limpamos so os consentimentos
  await page.evaluate(() => localStorage.removeItem('clinica-psi-consents'));
});

async function abrirPaciente(page: Page, nome = 'Juliana Martins') {
  await page.getByRole('navigation').getByRole('link', { name: 'Pacientes' }).click();
  await expect(page).toHaveURL(/\/patients$/);
  await page.locator('.patient-card').filter({ hasText: nome }).click();
  await expect(page.locator('.detail-head')).toBeVisible();
}

function cardTermos(page: Page) {
  return page.locator('.card', { hasText: 'Termos LGPD' });
}

function modal(page: Page) {
  return page.locator('.modal-layer');
}

/** varios toasts podem coexistir; o mais recente e o ultimo da pilha. */
function toast(page: Page, msg: string) {
  return page.locator('.toast', { hasText: msg }).last();
}

test('prontuário tem o botão + Novo termo', async ({ page }) => {
  await abrirPaciente(page);
  const card = cardTermos(page);
  await expect(card.getByRole('button', { name: '+ Novo termo' })).toBeVisible();
  await expect(card.locator('.empty')).toContainText('Nenhum termo registrado');
});

test('+ Novo termo abre o formulário com texto do modelo preenchido', async ({ page }) => {
  await abrirPaciente(page);
  await cardTermos(page).getByRole('button', { name: '+ Novo termo' }).click();

  await expect(modal(page).getByRole('heading', { name: 'Novo termo de consentimento', exact: true })).toBeVisible();
  await expect(page.locator('#cs-patient')).toHaveValue(/.+/);
  await expect(page.locator('#cs-signedBy')).toHaveValue('Juliana Martins');
  await expect(page.locator('#cs-document')).toHaveValue(/\d/);

  // texto congelado já sai do modelo de Configurações, com o titular e a clínica
  const doc = page.locator('.editor-shell .doc');
  await expect(doc).toContainText('Termo de Consentimento para Tratamento Psicológico');
  await expect(doc).toContainText('Juliana Martins');
  await expect(doc).not.toContainText('{{TITULAR}}');
  await expect(doc).toContainText('Clínica Psi');

  // o seletor de tipo respeita os modelos configurados
  const opcoes = await page.locator('#cs-type option').allTextContents();
  expect(opcoes).toEqual([
    'Termo de Consentimento para Tratamento Psicológico',
    'Termo de Consentimento para Uso de Dados (LGPD)',
  ]);

  expect(errors).toEqual([]);
});

test('registra o termo e lista no prontuário com histórico', async ({ page }) => {
  await abrirPaciente(page);
  await cardTermos(page).getByRole('button', { name: '+ Novo termo' }).click();
  await modal(page).getByRole('button', { name: 'Registrar assinatura' }).click();

  await expect(toast(page, 'Termo registrado.')).toBeVisible();
  const card = cardTermos(page);
  await expect(card.locator('.tl-item')).toHaveCount(1);
  await expect(card.locator('.tl-item')).toContainText('Vigente');
  await expect(card.locator('.tl-item')).toContainText('Assinado por Juliana Martins');
  await expect(card.locator('.tl-item')).toContainText('v1.0');

  expect(errors).toEqual([]);
});

test('trocar o tipo de termo regenera o texto do modelo', async ({ page }) => {
  await abrirPaciente(page);
  await cardTermos(page).getByRole('button', { name: '+ Novo termo' }).click();
  await page.locator('#cs-type').selectOption('data');

  const doc = page.locator('.editor-shell .doc');
  await expect(doc).toContainText('Termo de Consentimento para Uso de Dados');
  await expect(doc).toContainText('Lei nº 13.709/2018');
  await expect(doc).not.toContainText('{{DOCUMENTO}}');

  await modal(page).getByRole('button', { name: 'Registrar assinatura' }).click();
  await expect(toast(page, 'Termo registrado.')).toBeVisible();
  await expect(cardTermos(page).locator('.tl-item')).toContainText('Aviso de Privacidade (LGPD)');

  expect(errors).toEqual([]);
});

test('bloqueia termo duplicado e oferece substituição do vigente', async ({ page }) => {
  await abrirPaciente(page);

  // primeiro registro: tratamento
  await cardTermos(page).getByRole('button', { name: '+ Novo termo' }).click();
  await modal(page).getByRole('button', { name: 'Registrar assinatura' }).click();
  await expect(toast(page, 'Termo registrado.')).toBeVisible();

  // segundo registro do mesmo tipo é barrado
  await cardTermos(page).getByRole('button', { name: '+ Novo termo' }).click();
  await expect(modal(page).locator('#cs-substituir')).toBeVisible();
  await modal(page).getByRole('button', { name: 'Registrar assinatura' }).click();
  await expect(modal(page).locator('.form-error')).toContainText('Já existe um termo vigente deste tipo');
  await expect(cardTermos(page)).toBeVisible();

  // marcando a substituição, o anterior vira "Substituído"
  await modal(page).locator('#cs-substituir').check();
  await modal(page).getByRole('button', { name: 'Registrar assinatura' }).click();
  await expect(toast(page, 'Termo registrado.')).toBeVisible();

  const itens = cardTermos(page).locator('.tl-item');
  await expect(itens).toHaveCount(2);
  await expect(itemComStatus(itens, 'Substituído')).toBeVisible();
  await expect(itemComStatus(itens, 'Vigente')).toBeVisible();

  expect(errors).toEqual([]);
});

test('diferentes tipos convivem sem bloqueio', async ({ page }) => {
  await abrirPaciente(page);
  for (const tipo of ['treatment', 'data'] as const) {
    await cardTermos(page).getByRole('button', { name: '+ Novo termo' }).click();
    await page.locator('#cs-type').selectOption(tipo);
    await modal(page).getByRole('button', { name: 'Registrar assinatura' }).click();
    await expect(toast(page, 'Termo registrado.')).toBeVisible();
  }
  await expect(cardTermos(page).locator('.tl-item')).toHaveCount(2);

  expect(errors).toEqual([]);
});

test('"Ver termo" mostra o texto congelado e "Revogar" exige motivo', async ({ page }) => {
  await abrirPaciente(page);
  await cardTermos(page).getByRole('button', { name: '+ Novo termo' }).click();
  await modal(page).getByRole('button', { name: 'Registrar assinatura' }).click();
  await expect(toast(page, 'Termo registrado.')).toBeVisible();

  const card = cardTermos(page);

  await card.getByRole('button', { name: 'Ver termo' }).click();
  await expect(modal(page).getByRole('heading', { name: 'Termo de consentimento', exact: true })).toBeVisible();
  await expect(modal(page).locator('.doc')).toContainText('Juliana Martins');
  await expect(modal(page).locator('.doc')).toContainText('Sigilo');
  await modal(page).getByRole('button', { name: 'Fechar' }).last().click();

  await card.getByRole('button', { name: 'Revogar' }).click();
  await expect(modal(page).getByRole('heading', { name: 'Revogar consentimento', exact: true })).toBeVisible();
  await modal(page).locator('#rc-reason').fill('Solicitação verbal do titular.');
  await modal(page).getByRole('button', { name: 'Revogar', exact: true }).click();

  await expect(toast(page, 'Consentimento revogado.')).toBeVisible();
  await expect(card.locator('.tl-item')).toContainText('Revogado');
  await expect(card.getByRole('button', { name: 'Revogar' })).toHaveCount(0);

  expect(errors).toEqual([]);
});

test('termo revogado não pode mais ser substituído; precisa reemitir', async ({ page }) => {
  await abrirPaciente(page);
  await cardTermos(page).getByRole('button', { name: '+ Novo termo' }).click();
  await modal(page).getByRole('button', { name: 'Registrar assinatura' }).click();
  await expect(toast(page, 'Termo registrado.')).toBeVisible();

  const card = cardTermos(page);
  await card.getByRole('button', { name: 'Revogar' }).click();
  await modal(page).getByRole('button', { name: 'Revogar', exact: true }).click();
  await expect(toast(page, 'Consentimento revogado.')).toBeVisible();

  // revogado não conta como vigente: novo registro passa direto
  await card.getByRole('button', { name: '+ Novo termo' }).click();
  await expect(modal(page).locator('#cs-substituir')).toHaveCount(0);
  await modal(page).getByRole('button', { name: 'Registrar assinatura' }).click();
  await expect(toast(page, 'Termo registrado.')).toBeVisible();
  await expect(cardTermos(page).locator('.tl-item')).toHaveCount(2);

  expect(errors).toEqual([]);
});

test('"Gerar PDF" monta o termo no #print-root', async ({ page }) => {
  await abrirPaciente(page);
  await cardTermos(page).getByRole('button', { name: '+ Novo termo' }).click();
  await modal(page).getByRole('button', { name: 'Registrar assinatura' }).click();
  await expect(toast(page, 'Termo registrado.')).toBeVisible();

  await cardTermos(page).getByRole('button', { name: 'Gerar PDF' }).click();
  await expect(page.locator('#print-root')).toContainText('Termo de Consentimento para Tratamento');
  await expect(page.locator('#print-root')).toContainText('Juliana Martins');
});

test('muda o paciente dentro do formulário e gera o texto do novo titular', async ({ page }) => {
  await abrirPaciente(page, 'Beatriz Rocha');
  await cardTermos(page).getByRole('button', { name: '+ Novo termo' }).click();

  await page.locator('#cs-patient').selectOption({ label: 'Juliana Martins' });
  await expect(page.locator('#cs-signedBy')).toHaveValue('Juliana Martins');
  await expect(page.locator('.editor-shell .doc')).toContainText('Juliana Martins');
  await expect(page.locator('.editor-shell .doc')).not.toContainText('Beatriz Rocha');

  // o registro é salvo em nome do paciente escolhido, não do paciente da página
  await modal(page).getByRole('button', { name: 'Registrar assinatura' }).click();
  await expect(toast(page, 'Termo registrado.')).toBeVisible();

  // a página é da Beatriz, então o card dela continua vazio...
  await expect(cardTermos(page).locator('.tl-item')).toHaveCount(0);

  // ...e o termo foi para a Juliana
  const daJuliana = await page.evaluate(async () => {
    const { consentRepository } = await import('/src/repositories/index.ts');
    const { patientRepository } = await import('/src/repositories/index.ts');
    const juliana = (await patientRepository.findAll()).find((p) => p.name === 'Juliana Martins');
    return (await consentRepository.findByPatient(juliana.id)).map((c) => ({
      signedBy: c.signedBy,
      status: c.status,
    }));
  });
  expect(daJuliana).toEqual([{ signedBy: 'Juliana Martins', status: 'active' }]);

  expect(errors).toEqual([]);
});

function itemComStatus(itens: ReturnType<Page['locator']>, status: string) {
  return itens.filter({ hasText: status });
}
