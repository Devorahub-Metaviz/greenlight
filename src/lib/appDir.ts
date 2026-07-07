// Where Greenlight stores its own app state (.orchestrator/*).
// The Tauri shell sets GREENLIGHT_DATA_DIR to the OS app-data folder before
// spawning the Node server, since a packaged app's own install directory is
// often read-only. Falls back to process.cwd() for `next dev`/`next start`.
export function appDataRoot(): string {
  return process.env.GREENLIGHT_DATA_DIR || process.cwd();
}
