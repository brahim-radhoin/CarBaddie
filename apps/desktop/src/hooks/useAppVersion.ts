/** The installed app version (from tauri.conf.json, injected at build time). */
export function useAppVersion(): string {
  return __APP_VERSION__;
}
