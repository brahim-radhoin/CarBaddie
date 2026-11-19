//! Secrets (the Google refresh token) in the OS credential store: Windows Credential
//! Manager, macOS Keychain, Linux kernel keyring. Never in the webview's localStorage.

use keyring::Entry;

const SERVICE: &str = "com.carbaddie.app";
/// A sandboxed debug run (db.rs `sandbox_dir`) keeps its own secrets, so it is never signed in
/// to the real account and cannot sync a copied database as the real device.
const SANDBOX_SERVICE: &str = "com.carbaddie.app.sandbox";

fn entry(name: &str) -> Result<Entry, String> {
    let service = if crate::db::sandbox_dir().is_some() { SANDBOX_SERVICE } else { SERVICE };
    Entry::new(service, name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn secret_get(name: String) -> Result<Option<String>, String> {
    match entry(&name)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn secret_set(name: String, value: String) -> Result<(), String> {
    entry(&name)?.set_password(&value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn secret_delete(name: String) -> Result<(), String> {
    match entry(&name)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
