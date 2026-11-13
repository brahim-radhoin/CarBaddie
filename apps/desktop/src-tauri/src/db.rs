//! The local SQLite database, exposed to the frontend as four commands.
//!
//! The schema, migrations and all queries live in TypeScript (@carbaddie/core); this module only
//! owns the single connection. One connection (not a pool) matters: SQLite transactions belong to
//! a connection, and the frontend runs BEGIN/COMMIT as separate calls.

use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::{params_from_iter, Connection, DatabaseName, OpenFlags};
use serde::Serialize;
use serde_json::{Map, Number, Value};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};

const DB_FILE: &str = "car_baddie.db";

#[derive(Default)]
pub struct Db(Mutex<Option<Connection>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenInfo {
    path: String,
    /// Copy taken before a schema upgrade, if one was needed.
    backup_path: Option<String>,
}

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

/// Schema version and whether the file holds any tables, read without modifying it.
fn inspect(path: &Path) -> Result<(i64, bool), String> {
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(err)?;
    let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).map_err(err)?;
    let tables: i64 = conn
        .query_row("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table'", [], |r| r.get(0))
        .map_err(err)?;
    Ok((version, tables > 0))
}

/// Opens (creating if needed) the database in the app data directory. When the existing file is
/// older than `latest_version`, a complete copy is saved next to it before anything touches it.
#[tauri::command]
pub async fn db_open(app: AppHandle, state: State<'_, Db>, latest_version: i64) -> Result<OpenInfo, String> {
    let dir: PathBuf = app.path().app_data_dir().map_err(err)?;
    std::fs::create_dir_all(&dir).map_err(err)?;
    let path = dir.join(DB_FILE);

    let mut backup_path = None;
    if path.exists() {
        let (version, has_tables) = inspect(&path)?;
        if has_tables && version < latest_version {
            let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map_err(err)?.as_secs();
            let target = dir.join(format!("car_baddie.before-v{latest_version}-{stamp}.db"));
            // The backup API copies a consistent snapshot, including anything still in a WAL file.
            let source = Connection::open(&path).map_err(err)?;
            source.backup(DatabaseName::Main, &target, None).map_err(err)?;
            log::info!("Backed up database (schema v{version}) to {}", target.display());
            backup_path = Some(target.to_string_lossy().into_owned());
        }
    }

    let conn = Connection::open(&path).map_err(err)?;
    conn.pragma_update(None, "journal_mode", "WAL").map_err(err)?;
    conn.busy_timeout(std::time::Duration::from_secs(5)).map_err(err)?;
    *state.0.lock().map_err(err)? = Some(conn);
    log::info!("Database opened at {}", path.display());
    Ok(OpenInfo { path: path.to_string_lossy().into_owned(), backup_path })
}

fn with_conn<T>(state: &State<'_, Db>, f: impl FnOnce(&Connection) -> Result<T, String>) -> Result<T, String> {
    let guard = state.0.lock().map_err(err)?;
    let conn = guard.as_ref().ok_or("Database is not open")?;
    f(conn)
}

fn to_sql(params: Vec<Value>) -> Result<Vec<SqlValue>, String> {
    params
        .into_iter()
        .map(|p| match p {
            Value::Null => Ok(SqlValue::Null),
            Value::Bool(b) => Ok(SqlValue::Integer(b as i64)),
            Value::Number(n) => match n.as_i64() {
                Some(i) => Ok(SqlValue::Integer(i)),
                None => n.as_f64().map(SqlValue::Real).ok_or_else(|| format!("Unsupported number: {n}")),
            },
            Value::String(s) => Ok(SqlValue::Text(s)),
            other => Err(format!("Unsupported SQL parameter: {other}")),
        })
        .collect()
}

fn to_json(value: ValueRef<'_>) -> Value {
    match value {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => Value::Number(i.into()),
        ValueRef::Real(f) => Number::from_f64(f).map(Value::Number).unwrap_or(Value::Null),
        ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).into_owned()),
        ValueRef::Blob(b) => Value::Array(b.iter().map(|byte| Value::Number((*byte).into())).collect()),
    }
}

/// Runs one or more statements without parameters (DDL, PRAGMA, BEGIN/COMMIT).
#[tauri::command]
pub async fn db_exec(state: State<'_, Db>, sql: String) -> Result<(), String> {
    with_conn(&state, |c| c.execute_batch(&sql).map_err(err))
}

/// Runs one statement with parameters; returns the number of changed rows.
#[tauri::command]
pub async fn db_run(state: State<'_, Db>, sql: String, params: Vec<Value>) -> Result<usize, String> {
    let params = to_sql(params)?;
    with_conn(&state, |c| c.execute(&sql, params_from_iter(params)).map_err(err))
}

/// Runs a query and returns its rows as objects keyed by column name.
#[tauri::command]
pub async fn db_all(state: State<'_, Db>, sql: String, params: Vec<Value>) -> Result<Vec<Map<String, Value>>, String> {
    let params = to_sql(params)?;
    with_conn(&state, |c| {
        let mut stmt = c.prepare(&sql).map_err(err)?;
        let columns: Vec<String> = stmt.column_names().into_iter().map(String::from).collect();
        let mut rows = stmt.query(params_from_iter(params)).map_err(err)?;
        let mut out = Vec::new();
        while let Some(row) = rows.next().map_err(err)? {
            let mut obj = Map::with_capacity(columns.len());
            for (i, name) in columns.iter().enumerate() {
                obj.insert(name.clone(), to_json(row.get_ref(i).map_err(err)?));
            }
            out.push(obj);
        }
        Ok(out)
    })
}
