import { test, expect } from '@playwright/test';
import { semApresentacao } from './helpers';

test('dbg evolucoes', async ({ page }) => {
  await page.goto('/login');
  await semApresentacao(page);
  await page.reload();
  await page.locator('#email').fill('ana@clinica.com.br');
  await page.locator('#password').fill('123456');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.goto('/patients');
  const nomes = await page.locator('.patient-card').allInnerTexts();
  console.log('CARDS:', JSON.stringify(nomes.map(n => n.split('\n')[0])));
  const ids = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('clinica-psi-evolutions') || '[]').map((e: any) => e.patientId)
  );
  console.log('EVO patientIds:', JSON.stringify(ids));
  const pids = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('clinica-psi-patients') || '[]').map((p: any) => [p.id, p.name])
  );
  console.log('PATIENTS:', JSON.stringify(pids));
  await page.locator('.patient-card').first().click();
  await expect(page).toHaveURL(/\/patients\//);
  console.log('BOTOES:', JSON.stringify(await page.getByRole('button').allInnerTexts()));
  expect(true).toBe(true);
});
