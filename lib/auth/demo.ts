/**
 * Login demo (email + password) solo in sviluppo e nei test, mai altrove:
 * un NODE_ENV mancante o diverso (es. un deploy configurato male) lo spegne.
 */
export function isDemoLoginEnabled(env: { DEMO_LOGIN?: string; NODE_ENV?: string }): boolean {
  return env.DEMO_LOGIN === "true" && (env.NODE_ENV === "development" || env.NODE_ENV === "test");
}
