/**
 * Backup em arquivo - diálogo nativo no app empacotado.
 *
 * Sem isso o `a.download` cai na pasta de Downloads do WebView2, sem o usuario
 * escolher o destino. Aqui o caminho sai do dialogo do sistema e o texto vai
 * pelo plugin `fs`. Na versao web nada muda: o `DataPanel` continua usando o
 * `<input type="file">`, que e o que a suite Playwright exercita.
 */

import { isTauri } from './tauri';

const JSON_FILTER = [{ name: 'Backup JSON', extensions: ['json'] }];

/**
 * Os plugins entram por `import()` e nao no topo do arquivo. Importados
 * estaticamente eles seriam pre-empacotados pelo Vite tambem na versao web,
 * onde nunca sao usados: no dev server isso dispara a reotimizacao de
 * dependencias no meio de um teste e recarrega a pagina.
 */
async function dialogo() {
  return import('@tauri-apps/plugin-dialog');
}

async function arquivos() {
  return import('@tauri-apps/plugin-fs');
}

async function ipc() {
  return import('@tauri-apps/api/core');
}

/** O escopo do `fs` so aceita o que foi liberado antes da operacao. */
async function autorizar(caminho: string): Promise<void> {
  const { invoke } = await ipc();
  await invoke('allow_fs_path', { path: caminho });
}

/**
 * Pede o destino e grava o backup. Devolve o caminho, ou `null` se o usuario
 * cancelou o dialogo.
 */
export async function salvarArquivo(
  conteudo: string,
  nomeSugerido: string,
): Promise<string | null> {
  if (!isTauri()) throw new Error('DIALOGO_DISPONIVEL_SOMENTE_NO_APP_EMBALADO');

  const { save } = await dialogo();
  const caminho = await save({
    defaultPath: nomeSugerido,
    filters: JSON_FILTER,
  });
  if (!caminho) return null;

  await autorizar(caminho);
  const { writeTextFile } = await arquivos();
  await writeTextFile(caminho, conteudo);
  return caminho;
}

/** Pede o arquivo e devolve o texto, ou `null` se o usuario cancelou. */
export async function abrirArquivo(): Promise<string | null> {
  if (!isTauri()) throw new Error('DIALOGO_DISPONIVEL_SOMENTE_NO_APP_EMBALADO');

  const { open } = await dialogo();
  const caminho = await open({ multiple: false, filters: JSON_FILTER });
  if (typeof caminho !== 'string') return null;

  await autorizar(caminho);
  const { readTextFile } = await arquivos();
  return readTextFile(caminho);
}

