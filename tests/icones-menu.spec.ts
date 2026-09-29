import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { semApresentacao } from './helpers';

/**
 * Icones do menu lateral.
 *
 * Regressao: os icones eram SVG escritos a mao, sem
 * `stroke-linecap`/`stroke-linejoin`. Sem isso as pontas das linhas ficam
 * retas e as curvas, tortas - notavel em Servicos (estetoscopio), Relatorios
 * e Configuracoes. O typecheck nao pega isso, porque o SVG continua valido.
 */

async function login(page: Page) {
  await page.goto('/login');
  await semApresentacao(page);
  await page.reload();
  await page.locator('#email').fill('ana@clinica.com.br');
  await page.locator('#password').fill('123456');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function icones(page: Page) {
  // Medir antes do layout pronto dava 0x0 em parte dos icones, e a falha
  // aparecia so quando a maquina estava ocupada. Aqui a medida so acontece
  // depois que todos os svg do menu tem caixa de verdade.
  await page.waitForFunction(() => {
    const svgs = Array.from(document.querySelectorAll('.nav-item svg'));
    return svgs.length > 0 && svgs.every((svg) => svg.getBoundingClientRect().width > 0);
  });
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.nav-item')).map((a) => {
      const svg = a.querySelector('svg') as SVGSVGElement | null;
      if (!svg) return { nome: (a.textContent || '').trim(), svg: null };
      const box = svg.getBoundingClientRect();
      const cs = getComputedStyle(svg);
      return {
        nome: (a.textContent || '').trim(),
        svg: {
          viewBox: svg.getAttribute('viewBox'),
          largura: Math.round(box.width),
          altura: Math.round(box.height),
          formas: svg.querySelectorAll('path, circle, rect, line, polyline').length,
          strokeLinecap: cs.strokeLinecap,
          strokeLinejoin: cs.strokeLinejoin,
          transform: cs.transform,
        },
      };
    })
  );
}

test('todo ícone do menu é desenhado, sem esticar', async ({ page }) => {
  await login(page);
  const lista = await icones(page);

  expect(lista.length).toBeGreaterThan(0);
  for (const item of lista) {
    expect(item.svg, `ícone de "${item.nome}" ausente`).not.toBeNull();
    const s = item.svg!;

    // quadrado: largura e altura iguais, senão o desenho fica achatado
    expect(s.largura, `largura de "${item.nome}"`).toBe(18);
    expect(s.altura, `altura de "${item.nome}"`).toBe(18);

    // viewBox quadrado, senão o conteúdo é escalado em um eixo só
    expect(s.viewBox, `viewBox de "${item.nome}"`).toBe('0 0 24 24');

    // sem transform de escala/rotação aplicada por CSS
    expect(s.transform, `transform de "${item.nome}"`).toBe('none');

    // e o desenho tem conteúdo de verdade
    expect(s.formas, `formas de "${item.nome}"`).toBeGreaterThan(0);
  }
});

test('os traços têm pontas e curvas arredondadas', async ({ page }) => {
  await login(page);
  const lista = await icones(page);

  for (const item of lista) {
    const s = item.svg!;
    // sem isso o desenho fica com as pontas retas e os cantos em bico
    expect(s.strokeLinecap, `stroke-linecap de "${item.nome}"`).toBe('round');
    expect(s.strokeLinejoin, `stroke-linejoin de "${item.nome}"`).toBe('round');
  }
});

test('os ícones que estavam tortos estão completos', async ({ page }) => {
  await login(page);
  const lista = await icones(page);
  const porNome = new Map(lista.map((i) => [i.nome, i.svg!]));

  // numeros conferidos no desenho real do lucide:
  // estetoscopio = 5 trechos, relatorio = 5, configuracoes = 1 path + 1 circle
  expect(porNome.get('Serviços')?.formas).toBe(5);
  expect(porNome.get('Relatórios')?.formas).toBe(5);
  expect(porNome.get('Configurações')?.formas).toBe(2);
});

test('todos os itens do menu têm ícone', async ({ page }) => {
  await login(page);
  const sem = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.nav-item'))
      .filter((a) => !a.querySelector('svg'))
      .map((a) => (a.textContent || '').trim())
  );
  expect(sem).toEqual([]);
});
