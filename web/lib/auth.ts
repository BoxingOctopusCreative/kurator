import { apiUrl } from "./apiUrl";
import {
  assertEmail,
  assertLooseMultilineText,
  assertOptionalHttpUrl,
  assertPasswordClient,
  assertPendingToken,
  assertTurnstileToken,
  assertSocialLinksPayload,
  assertStrictPlainText,
  assertThemePreference,
  assertRecoveryCode6,
  assertTotpCode,
  assertUsername,
  LIMITS,
  type SocialLinkInput,
  type ThemePreference,
} from "./validation";

export type { ThemePreference };

async function readApiError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    if (typeof j.message === "string") return j.message;
    if (typeof j.msg === "string") return j.msg;
    if (typeof j.error === "string" && j.error !== "true") return j.error;
  } catch {
    /* ignore */
  }
  if (text) return text.slice(0, 200);
  return `request failed (${res.status})`;
}

export type AuthUser = {
  id: number;
  email: string;
  username: string;
  username_locked: boolean;
  profile_is_public: boolean;
  display_name: string;
  first_name: string;
  last_name: string;
  first_name_public: boolean;
  last_name_public: boolean;
  location: string;
  bio: string;
  theme_preference: ThemePreference;
  avatar_url: string | null;
  banner_url: string | null;
  social_links: SocialLinkInput[];
  two_factor_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type TwoFASetup = {
  secret: string;
  otpauth_url: string;
};

async function api(path: string, init?: RequestInit) {
  const headers: HeadersInit = {
    Accept: "application/json",
    ...(init?.body ? { "Content-Type": "application/json" } : {}),
    ...((init?.headers as Record<string, string>) || {}),
  };
  return fetch(apiUrl(path), {
    ...init,
    credentials: "include",
    headers,
  });
}

export async function fetchMe(): Promise<AuthUser | null> {
  const res = await api("/me", { method: "GET" });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`profile: ${res.status}`);
  return res.json() as Promise<AuthUser>;
}

export async function login(email: string, password: string, turnstileToken?: string) {
  const safeEmail = assertEmail(email);
  const safePassword = assertPasswordClient(password);
  const payload: Record<string, string> = {
    email: safeEmail,
    password: safePassword,
  };
  const ts = turnstileToken?.trim();
  if (ts) {
    payload.turnstile_token = assertTurnstileToken(ts);
  }
  const res = await api("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
  return (await res.json()) as
    | { two_factor_required: true; pending_token: string }
    | { two_factor_required: false; user: AuthUser };
}

export async function completeLogin2FA(pendingToken: string, code: string): Promise<AuthUser> {
  const safeCode = assertTotpCode(code);
  const safeToken = assertPendingToken(pendingToken);
  const res = await api("/auth/login/2fa", {
    method: "POST",
    body: JSON.stringify({ pending_token: safeToken, code: safeCode }),
  });
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
  const data = (await res.json()) as { user?: AuthUser };
  if (!data.user) throw new Error("Invalid response");
  return data.user;
}

export type BetaAccessStatus = {
  required: boolean;
  unlocked: boolean;
};

export async function fetchBetaAccessStatus(): Promise<BetaAccessStatus> {
  const res = await api("/auth/beta/status", { method: "GET" });
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
  return (await res.json()) as BetaAccessStatus;
}

export async function unlockBetaAccess(key: string) {
  const trimmed = key.trim();
  if (trimmed.length < 8) {
    throw new Error("Beta access key looks too short.");
  }
  const res = await api("/auth/beta/unlock", {
    method: "POST",
    body: JSON.stringify({ key: trimmed }),
  });
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
}

export async function register(
  email: string,
  password: string,
  displayName: string,
  username?: string,
  turnstileToken?: string,
) {
  const safeEmail = assertEmail(email);
  const safePassword = assertPasswordClient(password);
  const dn = displayName.trim();
  const safeDisplay = dn
    ? assertStrictPlainText(dn, LIMITS.name, "Display name")
    : undefined;
  const un = username?.trim();
  const body: Record<string, unknown> = {
    email: safeEmail,
    password: safePassword,
    display_name: safeDisplay,
  };
  if (un) {
    body.username = assertUsername(un, "Username");
  }
  const ts = turnstileToken?.trim();
  if (ts) {
    body.turnstile_token = assertTurnstileToken(ts);
  }
  const res = await api("/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
  return (await res.json()) as AuthUser;
}

export async function logout() {
  await api("/auth/logout", { method: "POST" });
}

/** Step 1: request a 6-digit code by email (no enumeration; same message either way). */
export async function requestPasswordRecovery(email: string, turnstileToken?: string) {
  const safeEmail = assertEmail(email);
  const payload: Record<string, string> = { email: safeEmail };
  const ts = turnstileToken?.trim();
  if (ts) {
    payload.turnstile_token = assertTurnstileToken(ts);
  }
  const res = await api("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
  return (await res.json()) as { ok: boolean; message: string };
}

/** Step 2: verify code; returns reset_token for the final step. */
export async function verifyPasswordRecoveryCode(
  email: string,
  code: string,
  turnstileToken?: string,
): Promise<{ reset_token: string }> {
  const safeEmail = assertEmail(email);
  const safeCode = assertRecoveryCode6(code, "Recovery code");
  const payload: Record<string, string> = {
    email: safeEmail,
    code: safeCode,
  };
  const ts = turnstileToken?.trim();
  if (ts) {
    payload.turnstile_token = assertTurnstileToken(ts);
  }
  const res = await api("/auth/forgot-password/verify", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
  return (await res.json()) as { reset_token: string };
}

/** Step 3: set new password; invalidates existing sessions. */
export async function resetPasswordWithToken(
  resetToken: string,
  password: string,
  turnstileToken?: string,
) {
  const safePassword = assertPasswordClient(password);
  const safeToken = assertPendingToken(resetToken, "Reset session");
  const payload: Record<string, string> = {
    reset_token: safeToken,
    password: safePassword,
  };
  const ts = turnstileToken?.trim();
  if (ts) {
    payload.turnstile_token = assertTurnstileToken(ts);
  }
  const res = await api("/auth/forgot-password/reset", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
}

export async function patchProfile(body: {
  display_name?: string;
  bio?: string;
  avatar_url?: string;
  banner_url?: string;
  first_name?: string;
  last_name?: string;
  first_name_public?: boolean;
  last_name_public?: boolean;
  location?: string;
  social_links?: SocialLinkInput[];
  username?: string;
  profile_is_public?: boolean;
  theme_preference?: string;
}): Promise<AuthUser> {
  const payload: Record<string, unknown> = {};
  if (body.display_name !== undefined) {
    const d = body.display_name.trim();
    payload.display_name = d
      ? assertStrictPlainText(d, LIMITS.name, "Display name")
      : "";
  }
  if (body.bio !== undefined) {
    payload.bio = assertLooseMultilineText(body.bio, LIMITS.bio, "Bio");
  }
  if (body.avatar_url !== undefined) {
    payload.avatar_url = assertOptionalHttpUrl(body.avatar_url, "Avatar URL");
  }
  if (body.banner_url !== undefined) {
    payload.banner_url = assertOptionalHttpUrl(body.banner_url, "Banner URL");
  }
  if (body.first_name !== undefined) {
    payload.first_name = assertLooseMultilineText(body.first_name, LIMITS.profileField, "First name");
  }
  if (body.last_name !== undefined) {
    payload.last_name = assertLooseMultilineText(body.last_name, LIMITS.profileField, "Last name");
  }
  if (body.first_name_public !== undefined) {
    payload.first_name_public = Boolean(body.first_name_public);
  }
  if (body.last_name_public !== undefined) {
    payload.last_name_public = Boolean(body.last_name_public);
  }
  if (body.location !== undefined) {
    payload.location = assertLooseMultilineText(body.location, LIMITS.profileField, "Location");
  }
  if (body.social_links !== undefined) {
    payload.social_links = assertSocialLinksPayload(body.social_links);
  }
  if (body.username !== undefined) {
    payload.username = assertUsername(body.username, "Username");
  }
  if (body.profile_is_public !== undefined) {
    payload.profile_is_public = Boolean(body.profile_is_public);
  }
  if (body.theme_preference !== undefined) {
    payload.theme_preference = assertThemePreference(body.theme_preference);
  }
  const res = await api("/me", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
  return (await res.json()) as AuthUser;
}

export async function setup2FA(): Promise<TwoFASetup> {
  const res = await api("/me/2fa/setup", { method: "POST" });
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
  return (await res.json()) as TwoFASetup;
}

export async function enable2FA(code: string): Promise<AuthUser> {
  const safeCode = assertTotpCode(code);
  const res = await api("/me/2fa/enable", {
    method: "POST",
    body: JSON.stringify({ code: safeCode }),
  });
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
  return (await res.json()) as AuthUser;
}

export async function disable2FA(password: string): Promise<AuthUser> {
  const safePassword = assertPasswordClient(password);
  const res = await api("/me/2fa/disable", {
    method: "POST",
    body: JSON.stringify({ password: safePassword }),
  });
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
  return (await res.json()) as AuthUser;
}
