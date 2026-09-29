import { expect, type Page } from '@playwright/test';

/**
 * Utilidades compartilhadas pelos testes.
 */

/**
 * O tour guiado abre por cima da aplicacao no primeiro acesso e bloqueia os
 * cliques. Os testes que limpam o localStorage perdem a chave do tour junto,
 * entao ele volta a aparecer; aqui marcamos como concluido depois da limpeza.
 *
 * Os testes do proprio tour (`tests/tour.spec.ts`) nao usam esta funcao, porque
 * precisam ver o tour abrir.
 */
export async function semApresentacao(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.localStorage.setItem(
      'clinica-psi-tour',
      JSON.stringify({ concluido: true, concluidoEm: '1970-01-01T00:00:00.000Z', passo: 0 })
    );
  });
}

/** Login com a conta de demonstracao da POC. */
export async function loginAna(page: Page): Promise<void> {
  await page.goto('/login');
  await page.locator('#email').fill('ana@clinica.com.br');
  await page.locator('#password').fill('123456');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}
