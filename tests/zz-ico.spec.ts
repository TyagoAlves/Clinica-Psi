import { test, expect } from '@playwright/test';
import { semApresentacao } from './helpers';

test('dbg icones', async ({ page }) => {
  await page.goto('/login');
  await semApresentacao(page);
  await page.reload();
  await page.locator('#email').fill('ana@clinica.com.br');
  await page.locator('#password').fill('123456');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/dashboard/);

  const r = await page.evaluate(() => {
    const out: Record<string, any> = {};
    document.querySelectorAll('.nav-item').forEach((a) => {
      const svg = a.querySelector('svg') as SVGSVGElement | null;
      const nome = (a.textContent || '').trim();
      if (!svg) { out[nome] = 'SEM SVG'; return; }
      const b = svg.getBoundingClientRect();
      const cs = getComputedStyle(svg);
      out[nome] = {
        viewBox: svg.getAttribute('viewBox'),
        w: Math.round(b.width), h: Math.round(b.height),
        attrW: svg.getAttribute('width'), attrH: svg.getAttribute('height'),
        stretch: cs.transform,
        paths: svg.querySelectorAll('path,circle,rect,line').length,
        stroke: cs.stroke, cap: cs.strokeLinecap, join: cs.strokeLinejoin,
      };
    });
    return out;
  });
  console.log('ICONES ' + JSON.stringify(r, null, 1));
  expect(true).toBe(true);
});
