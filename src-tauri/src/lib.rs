mod db;
mod fsscope;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let db = db::open(app.handle()).map_err(std::io::Error::other)?;
            app.manage(db);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db::kv_path,
            db::kv_get,
            db::kv_set,
            db::kv_remove,
            db::kv_clear,
            db::kv_keys,
            db::kv_get_all,
            db::kv_set_all,
            db::kv_usage,
            fsscope::allow_fs_path,
        ])
        .run(tauri::generate_context!())
        .expect("falha ao iniciar a aplicacao Tauri");
}
