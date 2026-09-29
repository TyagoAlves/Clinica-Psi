import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { semApresentacao } from './helpers';

/**
 * Impressão dos documentos.
 *
 *  - o cabeçalho mostra nome e unidade na mesma linha;
 *  - o corpo de texto sai justificado, para as linhas fecharem na margem;
 *  - as tabelas continuam à esquerda (justificar tabela estica as colunas);
 *  - evolução longa pode quebrar entre páginas, senão sobrava um bloco de
 *    branco no fim da folha anterior.
 *
 * O CSS de impressão é validado com `emulateMedia({ media: 'print' })` e
 * `getComputedStyle`, que é o que o navegador realmente aplica na hora de
 * imprimir.
 */

async function login(page: Page) {
  await page.goto('/login');
  // o tour guiava a tela e cobriria os botoes de impressao
  await semApresentacao(page);
  await page.reload();
  await page.locator('#email').fill('ana@clinica.com.br');
  await page.locator('#password').fill('123456');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/**
 * Gera um documento e devolve a folha impressa. O `window.print` e
 * interceptado para não abrir a caixa de diálogo do navegador.
 */
async function gerarEVerFolha(page: Page, acionar: () => Promise<void>): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { print: () => void }).print = () => undefined;
  });
  await acionar();

  // O PrintService devolve o #print-root ao estado anterior 800ms depois, e
  // essa janela é curta demais para|round-trip entre o Node e a página. A
  // cópia é feita dentro da própria página, assim que a folha aparece, e vai
  // para fora do #print-root para continuar no DOM durante as medições.
  const capturou = await page.evaluate(async () => {
    const limite = Date.now() + 5000;
    while (Date.now() < limite) {
      const folha = document.querySelector('#print-root .print-sheet');
      if (folha) {
        let copia = document.getElementById('print-capturado');
        if (!copia) {
          copia = document.createElement('div');
          copia.id = 'print-capturado';
          document.body.appendChild(copia);
        }
        copia.replaceChildren(folha.cloneNode(true));
        return true;
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    return false;
  });
  expect(capturou, 'a folha impressa não apareceu no #print-root').toBe(true);

  await page.emulateMedia({ media: 'print' });
}

/**
 * No media print o navegador esconde tudo que não é `.print-root`, inclusive o
 * `#print-capturado` onde a folha é clonada. Sem exibir esse wrapper, todo
 * `getBoundingClientRect()` devolve zero e qualquer comparação de posição
 * passa a mentir.
 */
async function exibirCaptura(page: Page): Promise<void> {
  await page.evaluate(() => {
    const copia = document.getElementById('print-capturado');
    if (copia) copia.style.setProperty('display', 'block', 'important');
  });
}

test('o cabeçalho junta nome e unidade em uma linha só', async ({ page }) => {
  await login(page);
  await page.goto('/lgpd');
  await gerarEVerFolha(page, async () => {
    await page.getByRole('button', { name: 'Baixar controle em PDF' }).click();
  });

  const h1 = page.locator('#print-root .print-clinic h1');
  await expect(h1).toHaveText('Clínica Psi Unidade Pinheiros');
  // a unidade nao se repete em uma segunda linha
  const meta = await page.locator('#print-root .print-clinic .pc-meta').first().innerText();
  expect(meta).not.toContain('Unidade Pinheiros');
  // e os dados de contato continuam no cabeçalho
  const cabecalho = await page.locator('#print-root .print-clinic').innerText();
  for (const parte of [
    'Rua das Acácias, 120 - São Paulo/SP',
    '12.345.678/0001-90',
    '(11) 3000-0000',
    'contato@clinica.com.br',
    'https://clinica.com.br',
    'Emitido em',
  ]) {
    expect(cabecalho).toContain(parte);
  }
});

test('no cabeçalho os dados da clínica ficam à esquerda e o contato à direita', async ({ page }) => {
  await login(page);
  await page.goto('/lgpd');
  await gerarEVerFolha(page, async () => {
    await page.getByRole('button', { name: 'Baixar controle em PDF' }).click();
  });

  await exibirCaptura(page);
  const posicoes = await page.evaluate(() => {
    const cabecalho = document.querySelector('#print-capturado .print-clinic');
    if (!cabecalho) return null;
    const [esquerda, direita] = Array.from(cabecalho.children) as HTMLElement[];
    return {
      direcao: getComputedStyle(cabecalho).flexDirection,
      esquerda: esquerda.getBoundingClientRect().left,
      direita: direita.getBoundingClientRect().left,
      alinhamentoDireita: getComputedStyle(direita).textAlign,
      mesmoCima: Math.round(esquerda.getBoundingClientRect().top) ===
        Math.round(direita.getBoundingClientRect().top),
    };
  });

  expect(posicoes, 'cabeçalho impresso não encontrado').not.toBeNull();
  // empilhar os dois deixava o contato abaixo do nome e comia metade da folha
  expect(posicoes!.direcao).toBe('row');
  expect(posicoes!.mesmoCima, 'os dois blocos precisam ficar lado a lado').toBe(true);
  expect(posicoes!.direita, 'o contato tem de ficar à direita do nome').toBeGreaterThan(
    posicoes!.esquerda
  );
  expect(posicoes!.alinhamentoDireita).toBe('right');
});

test('a ficha do paciente sai em duas colunas', async ({ page }) => {
  await login(page);
  await gerarEVerFolha(page, () => gerarPdeEvolucao(page));

  await exibirCaptura(page);
  const ficha = await page.evaluate(() => {
    const el = document.querySelector('#print-capturado .print-patient');
    if (!el) return null;
    const colunas = getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/);
    return {
      colunas: colunas.length,
      colunasValidas: colunas.every((c) => parseFloat(c) > 0),
      altura: Math.round(el.getBoundingClientRect().height),
      // o rotulo e o valor saem com o nome colado; a virgula e a caixa alta
      // vem do CSS, entao no DOM aparece so "Paciente", sem ":"
      rotulos: Array.from(el.querySelectorAll('.k')).map((b) => (b.textContent || '').trim()),
      texto: (el.textContent || '').replace(/\s+/g, ' ').trim(),
    };
  });

  expect(ficha, 'ficha do paciente não encontrada').not.toBeNull();
  // empilhado, cada campo ocupava uma linha inteira e a ficha ficava alta
  expect(ficha!.colunas).toBe(2);
  expect(ficha!.colunasValidas).toBe(true);

  // e nenhum dos campos some ao virar duas colunas
  for (const rotulo of [
    'Paciente',
    'Nascimento',
    'Telefone',
    'E-mail',
    'Documento',
    'Endereço',
    'Responsável',
    'Serviço',
    'Início do tratamento',
    'Situação',
  ]) {
    expect(ficha!.rotulos, `rótulo ausente: ${rotulo}`).toContain(rotulo);
  }

  // nome e data de nascimento continuam preenchidos ao lado dos rotulos
  expect(ficha!.texto).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  expect(ficha!.texto.length).toBeGreaterThan(80);
});

/**
 * Abre um paciente com evolução registrada e gera o PDF dela. Serve para os
 * testes que precisam de um corpo de texto de verdade: um paciente sem
 * evoluções imprime só a ficha, sem `.print-body`.
 */
async function gerarPdeEvolucao(page: Page): Promise<void> {
  await page.goto('/patients');
  const total = await page.locator('.patient-card').count();
  for (let i = 0; i < total; i++) {
    await page.goto('/patients');
    await page.locator('.patient-card').nth(i).click();
    await expect(page).toHaveURL(/\/patients\//);
    // a URL muda antes do React re-renderizar: espera a ficha aparecer, senao
    // ainda estariamos olhando a lista
    await expect(page.getByRole('button', { name: /Nova evolução/ })).toBeVisible();
    const gerar = page.getByRole('button', { name: 'Gerar PDF' });
    if ((await gerar.count()) > 0) {
      await gerar.first().click();
      return;
    }
  }
  throw new Error('nenhum paciente do seed tem evolução registrada');
}

test('o corpo de texto do relatório sai justificado', async ({ page }) => {
  await login(page);
  await gerarEVerFolha(page, () => gerarPdeEvolucao(page));

  const alignamento = await page.evaluate(() => {
    const corpo = document.querySelector('#print-capturado .print-body');
    return corpo ? getComputedStyle(corpo).textAlign : null;
  });
  expect(alignamento).toBe('justify');
});

test('as tabelas continuam alinhadas à esquerda', async ({ page }) => {
  await login(page);
  await page.goto('/agenda');
  await gerarEVerFolha(page, async () => {
    await page.getByRole('button', { name: 'PDF da agenda' }).click();
  });

  const alinhamento = await page.evaluate(() => {
    const celula = document.querySelector('#print-capturado .print-table td, #print-capturado .print-table th');
    return celula ? getComputedStyle(celula).textAlign : null;
  });
  // sem justify nas células: a coluna esticaria o texto e a tabela ficaria torta
  expect(alinhamento).toBe('left');
  // com `media: print` o CSS esconde tudo fora do #print-root; a folha
  // capturada existe, mas nao e visivel
  await expect(page.locator('#print-capturado .print-table')).toBeAttached();
});

test('o termo de consentimento sai justificado', async ({ page }) => {
  await login(page);
  await page.goto('/lgpd');
  await gerarEVerFolha(page, async () => {
    await page.locator('table.data tbody tr').first().getByRole('button', { name: 'PDF', exact: true }).click();
  });

  const alignamento = await page.evaluate(() => {
    const corpo = document.querySelector('#print-capturado .print-body');
    return corpo ? getComputedStyle(corpo).textAlign : null;
  });
  expect(alignamento).toBe('justify');
});

test('evolução longa pode quebrar entre páginas', async ({ page }) => {
  await login(page);
  await gerarEVerFolha(page, () => gerarPdeEvolucao(page));

  const quebra = await page.evaluate(() => {
    const evo = document.querySelector('#print-capturado .print-evo');
    if (!evo) return null;
    const estilo = getComputedStyle(evo);
    return {
      dentro: estilo.pageBreakInside,
      within: estilo.breakInside,
    };
  });
  expect(quebra).not.toBeNull();
  // `avoid` empurrava a evolução inteira para a folha seguinte
  expect(quebra!.dentro === 'avoid' || quebra!.within === 'avoid').toBe(false);
});

test('o cabeçalho da evolução não fica sozinho no fim da página', async ({ page }) => {
  await login(page);
  await gerarEVerFolha(page, () => gerarPdeEvolucao(page));

  const evita = await page.evaluate(() => {
    const head = document.querySelector('#print-capturado .print-evo-head');
    if (!head) return null;
    const estilo = getComputedStyle(head);
    return estilo.pageBreakAfter === 'avoid' || estilo.breakAfter === 'avoid';
  });
  expect(evita).toBe(true);
});

test('assinatura e rodapé não se partem no meio', async ({ page }) => {
  await login(page);
  await gerarEVerFolha(page, () => gerarPdeEvolucao(page));

  const assinaturas = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#print-capturado .print-sign')).map(
      (el) => getComputedStyle(el).pageBreakInside
    )
  );
  expect(assinaturas.length).toBeGreaterThan(0);
  for (const valor of assinaturas) {
    expect(valor).toBe('avoid');
  }
});

test('parágrafos não deixam linha isolada (viúvas e órfãs)', async ({ page }) => {
  await login(page);
  await gerarEVerFolha(page, () => gerarPdeEvolucao(page));

  const contagem = await page.evaluate(() => {
    const p = document.querySelector('#print-root .print-body p');
    if (!p) return null;
    const estilo = getComputedStyle(p);
    return { orfa: estilo.orphans, viuva: estilo.widows };
  });
  expect(contagem).not.toBeNull();
  expect(Number(contagem!.orfa)).toBeGreaterThanOrEqual(2);
  expect(Number(contagem!.viuva)).toBeGreaterThanOrEqual(2);
});
