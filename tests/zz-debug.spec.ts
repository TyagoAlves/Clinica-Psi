import { test, expect } from '@playwright/test';

test('debug onboarding key', async ({ page }) => {
  await page.goto('/login');
  const before = await page.evaluate(() => Object.keys(localStorage).filter(k => k.includes('onboarding')));
  await page.locator('#email').fill('ana@clinica.com.br');
  await page.locator('#password').fill('123456');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(/dashboard/);
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => ({
    keys: Object.keys(localStorage).filter(k => k.includes('onboarding')),
    val: localStorage.getItem('clinica-psi-onboarding'),
  }));
  const overlay = await page.locator('.apresentacao-box').count();
  console.log('DEBUG before:', JSON.stringify(before), 'after:', JSON.stringify(after), 'overlay:', overlay);
  expect(true).toBe(true);
});
