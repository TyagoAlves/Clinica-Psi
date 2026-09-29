use tauri::AppHandle;
use tauri_plugin_fs::FsExt;

type CmdResult<T> = Result<T, String>;

/// Autoriza o plugin `fs` a tocar num caminho especifico.
///
/// O usuario escolhe o destino no dialogo do sistema, que pode ser qualquer
/// pasta do disco. O escopo do `fs` comeca restrito, entao cada caminho
/// escolhido e liberado aqui antes da escrita, em vez de abrir o disco
/// inteiro para o plugin.
#[tauri::command]
pub fn allow_fs_path(app: AppHandle, path: String) -> CmdResult<()> {
    let scope = app.fs_scope();
    scope
        .allow_file(&path)
        .map_err(|e| format!("nao foi possivel autorizar o caminho: {e}"))?;
    Ok(())
}
