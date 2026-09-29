const { chromium } = require('@playwright/test');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));

  const out = process.argv[2] || 'C:\\work\\shots';
  const pocDir = process.argv[3];
  const reactUrl = process.argv[4] || 'http://localhost:5173';

  // POC login
  await page.goto('file:///' + pocDir.replace(/\\/g, '/') + '/index.html');
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(out, 'poc-login.png'), fullPage: true });

  // POC dashboard
  await page.fill('#login-email', 'ana@clinica.com.br');
  await page.fill('#login-password', '123456');
  await page.click('#login-form button[type=submit]');
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(out, 'poc-dashboard.png'), fullPage: true });
  await page.click('[data-route=patients]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(out, 'poc-patients.png'), fullPage: true });
  await page.click('[data-route=agenda]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(out, 'poc-agenda.png'), fullPage: true });
  await page.click('[data-route=admin]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(out, 'poc-admin.png'), fullPage: true });

  // React
  await ctx.clearCookies();
  await page.goto(reactUrl + '/login');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(out, 'react-login.png'), fullPage: true });
  console.log('REACT LOGIN ERRORS:', JSON.stringify(errs, null, 2));
  errs.length = 0;

  await page.fill('#email', 'ana@clinica.com.br');
  await page.fill('#password', '123456');
  await page.click('button[type=submit]');
  await page.waitForTimeout(1500);
  console.log('URL after login:', page.url());
  await page.screenshot({ path: path.join(out, 'react-dashboard.png'), fullPage: true });
  console.log('REACT DASHBOARD ERRORS:', JSON.stringify(errs, null, 2));
  errs.length = 0;

  for (const [label, file] of [['Pacientes', 'patients'], ['Agenda', 'agenda'], ['Serviços', 'services'], ['LGPD', 'lgpd'], ['Relatórios', 'reports'], ['Configurações', 'admin']]) {
    const link = page.getByRole('link', { name: label });
    if (await link.count()) {
      await link.first().click();
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(out, 'react-' + file + '.png'), fullPage: true });
    } else {
      console.log('LINK NOT FOUND: ' + label);
    }
  }
  console.log('REACT NAV ERRORS:', JSON.stringify(errs, null, 2));

  await browser.close();
})();
