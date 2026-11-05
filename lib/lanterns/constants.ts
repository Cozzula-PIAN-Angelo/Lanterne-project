export const COLORS = [
  { id: "ambra", hex: "#E8A75C" },
  { id: "terracotta", hex: "#C9694F" },
  { id: "salvia", hex: "#8FAE8B" },
  { id: "lilla", hex: "#A99BD1" },
  { id: "blu-polvere", hex: "#7D9CC0" },
  { id: "rosa-antico", hex: "#C98B9B" },
  { id: "oro", hex: "#D8BB6A" },
  { id: "verde-acqua", hex: "#6FA8A0" },
] as const;

export const RATE_LIMITS = {
  inviteCreate: { limit: 10, windowSec: 3600 },
  inviteAccept: { limit: 20, windowSec: 3600 },
} as const;

export const MAX_CONNECTIONS = 5;
export const INVITE_TTL_DAYS = 7;

export const THOUGHTS = [
  { id: "ti-penso", text: "ti penso" },
  { id: "giornata-pesante", text: "giornata pesante, ci sono" },
  { id: "niente-da-raccontare", text: "oggi niente da raccontare, ma ci sono" },
  { id: "abbraccio", text: "ti mando un abbraccio" },
  { id: "sorriso", text: "un sorriso a caso per te" },
] as const;

export const REACTIONS = ["💛", "🫂", "😂", "😮", "🌙"] as const;

export const TEXT_MAX = 1000;
