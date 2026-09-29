import { test, expect } from '@playwright/test';
import { semApresentacao } from './helpers';
import type { Page } from '@playwright/test';

const errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto('/login');
  await page.evaluate(() => localStorage.clear());
  // o tour volta a abrir depois do clear e bloqueia os cliques
  await semApresentacao(page);
  await page.reload();
  await page.locator('#email').fill('ana@clinica.com.br');
  await page.locator('#password').fill('123456');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.getByRole('link', { name: 'Relatórios' }).click();
  await expect(page).toHaveURL(/\/reports/);
});

async function seedConsent(page: Page) {
  await page.evaluate(() => {
    const KEY = 'clinica-psi-consents';
    const patients = JSON.parse(localStorage.getItem('clinica-psi-patients') || '[]');
    const prof = JSON.parse(localStorage.getItem('clinica-psi-professionals') || '[]');
    const paciente = patients.find((p: { name: string }) => p.name === 'Rafael Duarte');
    const agora = new Date().toISOString();
    // substitui a lista: o seed ja traz termos de demonstracao
    localStorage.setItem(
      KEY,
      JSON.stringify([
        {
          id: 'consent-teste-1',
          patientId: paciente?.id,
          type: 'treatment',
          signedBy: 'Rafael Duarte',
          relationship: 'holder',
          document: '123.456.789-00',
          signedAt: agora,
          version: '1.0',
          registeredBy: prof[0]?.id,
          text: '<p>Autorizo o tratamento psicologico.</p>',
          status: 'active',
          createdAt: agora,
        },
      ])
    );
  });
}

/** window.print() nao abre janela no headless; lemos o que foi injetado. */
async function printHtml(page: Page) {
  return page.locator('#print-root').innerHTML();
}

test('resumo bate com os dados reais do seed', async ({ page }) => {
  const cards = page.locator('.card', { hasText: 'Resumo' });
  await expect(cards).toBeVisible();

  const rows = page.locator('.card', { hasText: 'Resumo' }).locator('.row-between');
  await expect(rows.filter({ hasText: 'Pacientes cadastrados' }).locator('strong')).toHaveText('3');
  await expect(rows.filter({ hasText: 'Evoluções registradas' }).locator('strong')).toHaveText('3');
  await expect(rows.filter({ hasText: 'Sessões agendadas' }).locator('strong')).toHaveText('3');
  expect(errors).toEqual([]);
});

test('prontuário completo monta o documento do paciente escolhido', async ({ page }) => {
  await page.getByRole('button', { name: 'Escolher paciente' }).click();

  const modal = page.locator('.modal');
  await expect(modal.getByRole('heading', { name: 'Escolher paciente' })).toBeVisible();
  await expect(modal.locator('.picker-btn')).toHaveCount(3);

  await modal.locator('.picker-btn').filter({ hasText: 'Juliana Martins' }).click();

  const html = await printHtml(page);
  expect(html).toContain('Prontuário Completo');
  expect(html).toContain('Juliana Martins');
  expect(html).toContain('print-patient');
  expect(html).toContain('print-sign');
  expect(errors).toEqual([]);
});

test('registro de evolução monta somente a sessão escolhida', async ({ page }) => {
  await page.getByRole('button', { name: 'Escolher registro' }).click();

  const modal = page.locator('.modal');
  await expect(modal.getByRole('heading', { name: 'Escolher registro' })).toBeVisible();

  const alvo = modal.locator('.picker-btn').first();
  const titulo = (await alvo.locator('span').first().innerText()).trim();
  await alvo.click();

  const html = await printHtml(page);
  expect(html).toContain('Registro de Evolução');
  expect(html).toContain(titulo);
  expect(errors).toEqual([]);
});

test('relatório de atendimentos gera planilha com uma linha por evolução', async ({ page }) => {
  await page.getByRole('button', { name: 'Gerar PDF' }).first().click();

  const html = await printHtml(page);
  expect(html).toContain('Relatório de Atendimentos');
  expect(html).toContain('print-table');
  // cabecalho + 3 evolucoes do seed
  expect(html.match(/<tr>/g)?.length).toBe(4);
  expect(errors).toEqual([]);
});

test('controle de termos LGPD gera a planilha com um termo registrado', async ({ page }) => {
  await seedConsent(page);
  await page.reload();

  const lgpd = page.locator('.card', { hasText: 'Documentos disponíveis' });
  await lgpd.getByRole('button', { name: 'Gerar PDF' }).nth(1).click();

  const html = await printHtml(page);
  expect(html).toContain('Controle de Termos LGPD');
  expect(html).toContain('Rafael Duarte');
  expect(html).toContain('Assinado por');
  expect(html).toContain('Vigente');
  expect(html).toContain('Tratamento');
  expect(errors).toEqual([]);
});

test('termo de consentimento imprime o documento assinado', async ({ page }) => {
  await seedConsent(page);
  await page.reload();

  await page.getByRole('button', { name: 'Escolher termo' }).click();
  const modal = page.locator('.modal');
  await expect(modal.getByRole('heading', { name: 'Escolher termo' })).toBeVisible();
  await modal.locator('.picker-btn').filter({ hasText: 'Rafael Duarte' }).click();

  const html = await printHtml(page);
  expect(html).toContain('Termo de Consentimento');
  expect(html).toContain('Rafael Duarte');
  expect(html).toContain('print-body');
  expect(errors).toEqual([]);
});

test('avisa em vez de gerar documento quando não há termos', async ({ page }) => {
  // limpa e navega de novo, sem reload: recarregar rodaria o bootstrap e
  // ressemearia os termos de demonstracao
  await page.evaluate(() => localStorage.removeItem('clinica-psi-consents'));
  await page.getByRole('link', { name: 'LGPD' }).click();
  await expect(page).toHaveURL(/\/lgpd$/);
  await page.getByRole('link', { name: 'Relatórios' }).click();
  await expect(page).toHaveURL(/\/reports/);

  await page.getByRole('button', { name: 'Escolher termo' }).click();
  await expect(page.locator('.toast')).toContainText('Nenhum termo de consentimento');
  await expect(page.locator('#print-root')).toBeEmpty();
  expect(errors).toEqual([]);
});

test('documento fica oculto na tela e é o único visível na impressão', async ({ page }) => {
  await expect(page.locator('#print-root')).toBeHidden();

  await page.getByRole('button', { name: 'Gerar PDF' }).first().click();

  await expect(page.locator('#print-root')).toBeHidden();
  await expect(page.locator('.sidebar')).toBeVisible();

  // No @media print: #print-root aparece e todo o resto do body e escondido.
  // O texto do seletor e normalizado pelo browser ('body > *' vira 'body > :not'),
  // entao procuramos pelo trecho estavel em vez do seletor exato.
  const impressao = await page.evaluate(() => {
    const regra = (trecho: string) => {
      for (const sheet of document.styleSheets) {
        let rules: CSSRuleList;
        try {
          rules = sheet.cssRules;
        } catch {
          continue;
        }
        for (const rule of rules) {
          if (!(rule instanceof CSSMediaRule)) continue;
          if (!rule.conditionText.includes('print')) continue;
          for (const inner of rule.cssRules) {
            if (inner.cssText.includes(trecho)) return inner.cssText;
          }
        }
      }
      return '';
    };
    return {
      root: regra('.print-root { display: block'),
      outros: regra(':not(.print-root) { display: none'),
    };
  });

  expect(impressao.root).toContain('!important');
  expect(impressao.outros).toContain('!important');
  expect(errors).toEqual([]);
});

test('limpa o documento injetado depois de imprimir', async ({ page }) => {
  await page.getByRole('button', { name: 'Gerar PDF' }).first().click();
  await expect(page.locator('#print-root')).not.toBeEmpty();

  await expect(page.locator('#print-root')).toBeEmpty({ timeout: 3000 });
  expect(errors).toEqual([]);
});
