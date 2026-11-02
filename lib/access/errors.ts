export type AccessErrorCode =
  | "not_found"
  | "forbidden"
  | "invalid_input"
  | "onboarding_required"
  | "invalid_reveal_time"
  | "invite_invalid"
  | "invite_expired"
  | "invite_used"
  | "self_invite"
  | "already_connected"
  | "connection_limit_self"
  | "connection_limit_other"
  | "connection_not_active"
  | "too_late"
  | "not_savable"
  | "rate_limited";

export type AccessResult<T> = { ok: true; value: T } | { ok: false; error: AccessErrorCode };

export function ok<T>(value: T): AccessResult<T> {
  return { ok: true, value };
}

export function fail(error: AccessErrorCode): { ok: false; error: AccessErrorCode } {
  return { ok: false, error };
}
