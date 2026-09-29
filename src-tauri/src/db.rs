use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::Connection;
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

const DB_FILE: &str = "clinica-psi.db";
const QUOTA_BYTES: i64 = 1024 * 1024 * 1024;

pub struct Db(Mutex<Connection>);

type CmdResult<T> = Result<T, String>;

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(DB_FILE))
}

fn file_size(path: &PathBuf) -> i64 {
    std::fs::metadata(path).map(|m| m.len() as i64).unwrap_or(0)
}

pub fn open(app: &AppHandle) -> Result<Db, String> {
    let path = database_path(app)?;
    let conn = Connection::open(&path).map_err(|e| e.to_string())?;

    // WAL + synchronous=FULL: uma escrita que caiu no meio deixa a colecao
    // anterior intacta, em vez de truncada. E o que o localStorage nao garantia.
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = FULL;
         CREATE TABLE IF NOT EXISTS kv (
             key        TEXT PRIMARY KEY NOT NULL,
             value      TEXT NOT NULL,
             updated_at INTEGER NOT NULL
         );",
    )
    .map_err(|e| e.to_string())?;

    Ok(Db(Mutex::new(conn)))
}

#[tauri::command]
pub fn kv_path(app: AppHandle) -> CmdResult<String> {
    Ok(database_path(&app)?.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn kv_get(db: State<'_, Db>, key: String) -> CmdResult<Option<String>> {
    let conn = db.0.lock().map_err(|_| "lock do banco envenenado".to_string())?;
    let mut stmt = conn
        .prepare("SELECT value FROM kv WHERE key = ?1")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query([&key]).map_err(|e| e.to_string())?;
    match rows.next().map_err(|e| e.to_string())? {
        Some(row) => Ok(Some(row.get(0).map_err(|e| e.to_string())?)),
        None => Ok(None),
    }
}

#[tauri::command]
pub fn kv_set(db: State<'_, Db>, key: String, value: String) -> CmdResult<()> {
    let conn = db.0.lock().map_err(|_| "lock do banco envenenado".to_string())?;
    conn.execute(
        "INSERT INTO kv (key, value, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        rusqlite::params![key, value, now_millis()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn kv_remove(db: State<'_, Db>, key: String) -> CmdResult<()> {
    let conn = db.0.lock().map_err(|_| "lock do banco envenenado".to_string())?;
    conn.execute("DELETE FROM kv WHERE key = ?1", [&key])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn kv_clear(db: State<'_, Db>) -> CmdResult<()> {
    let conn = db.0.lock().map_err(|_| "lock do banco envenenado".to_string())?;
    conn.execute("DELETE FROM kv", [])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn kv_keys(db: State<'_, Db>) -> CmdResult<Vec<String>> {
    let conn = db.0.lock().map_err(|_| "lock do banco envenenado".to_string())?;
    let mut stmt = conn
        .prepare("SELECT key FROM kv ORDER BY key")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<String>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn kv_get_all(
    db: State<'_, Db>,
    keys: Vec<String>,
) -> CmdResult<HashMap<String, String>> {
    let conn = db.0.lock().map_err(|_| "lock do banco envenenado".to_string())?;
    let mut stmt = conn
        .prepare("SELECT value FROM kv WHERE key = ?1")
        .map_err(|e| e.to_string())?;

    let mut out = HashMap::new();
    for key in keys {
        let mut rows = stmt.query([&key]).map_err(|e| e.to_string())?;
        if let Some(row) = rows.next().map_err(|e| e.to_string())? {
            out.insert(key, row.get(0).map_err(|e| e.to_string())?);
        }
    }
    Ok(out)
}

#[tauri::command]
pub fn kv_set_all(db: State<'_, Db>, entries: HashMap<String, String>) -> CmdResult<()> {
    let mut conn = db.0.lock().map_err(|_| "lock do banco envenenado".to_string())?;
    let now = now_millis();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    {
        let mut stmt = tx
            .prepare(
                "INSERT INTO kv (key, value, updated_at) VALUES (?1, ?2, ?3)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            )
            .map_err(|e| e.to_string())?;
        for (key, value) in &entries {
            stmt.execute(rusqlite::params![key, value, now])
                .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub struct StorageUsage {
    used: i64,
    quota: i64,
    percentage: i64,
}

#[tauri::command]
pub fn kv_usage(app: AppHandle) -> CmdResult<StorageUsage> {
    let path = database_path(&app)?;

    // O WAL e o -shm ainda nao foram incorporados ao arquivo principal, entao
    // somar os tres evita mostrar a base como menor do que ela e.
    let wal = PathBuf::from(format!("{}-wal", path.to_string_lossy()));
    let shm = PathBuf::from(format!("{}-shm", path.to_string_lossy()));
    let used = file_size(&path) + file_size(&wal) + file_size(&shm);

    Ok(StorageUsage {
        used,
        quota: QUOTA_BYTES,
        percentage: ((used * 100) / QUOTA_BYTES).clamp(0, 100),
    })
}
