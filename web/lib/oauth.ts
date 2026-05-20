import { apiUrl } from "@/lib/apiUrl";

export type OAuthProvider = {
  id: string;
  label: string;
};

export type LinkedOAuthIdentity = {
  provider: string;
  provider_email?: string;
  linked_at: string;
};

async function oauthFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...((init?.headers as Record<string, string>) || {}),
    },
  });
}

async function readApiError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    if (typeof j.message === "string") return j.message;
    if (typeof j.error === "string" && j.error !== "true") return j.error;
  } catch {
    /* ignore */
  }
  if (text) return text.slice(0, 200);
  return `request failed (${res.status})`;
}

export function oauthStartPath(providerId: string, nextPath: string): string {
  const next = nextPath.trim() || "/";
  const q = new URLSearchParams({ next });
  return `/api/v1/auth/oauth/${encodeURIComponent(providerId)}?${q.toString()}`;
}

export function oauthLinkPath(providerId: string, nextPath = "/settings/app"): string {
  const next = nextPath.trim() || "/settings/app";
  const q = new URLSearchParams({ next });
  return `/api/v1/me/oauth/${encodeURIComponent(providerId)}/link?${q.toString()}`;
}

/** Full-page navigation — required for OAuth starts (Next.js must not client-route API handlers). */
export function navigateToOAuthUrl(path: string, disabled?: boolean): void {
  if (disabled || typeof window === "undefined") return;
  window.location.assign(path);
}

export async function fetchOAuthProviders(): Promise<OAuthProvider[]> {
  const res = await oauthFetch("/auth/oauth/providers", { method: "GET" });
  if (!res.ok) {
    return [];
  }
  const data = (await res.json()) as { providers?: OAuthProvider[] };
  return Array.isArray(data.providers) ? data.providers : [];
}

export async function fetchLinkedOAuthIdentities(): Promise<LinkedOAuthIdentity[]> {
  const res = await oauthFetch("/me/oauth/identities", { method: "GET" });
  if (res.status === 401) {
    throw new Error("Sign in to manage linked accounts.");
  }
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
  const data = (await res.json()) as { identities?: LinkedOAuthIdentity[] };
  return Array.isArray(data.identities) ? data.identities : [];
}

export async function unlinkOAuthProvider(providerId: string): Promise<void> {
  const res = await oauthFetch(`/me/oauth/${encodeURIComponent(providerId)}`, { method: "DELETE" });
  if (res.status === 401) {
    throw new Error("Sign in to manage linked accounts.");
  }
  if (!res.ok && res.status !== 204) {
    throw new Error(await readApiError(res));
  }
}

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  email_required:
    "We could not verify an email from that provider. Use a Google or Discord account with a verified email, or sign in with email and password.",
  password_account:
    "This email already has a password. Log in with email and password, then connect Google or Discord under App Settings.",
  account_exists:
    "This email is already registered with a different sign-in method. Try another option or contact support.",
  beta_oauth_register_disabled:
    "During the private beta, new accounts must be created with your email invite link. Google and Discord sign-in works for existing accounts only.",
  beta_required:
    "Private beta access is required before creating an account. Complete beta unlock, then try again.",
  beta_invite_invalid: "Your beta invite is no longer valid. Request access again.",
  beta_email_mismatch:
    "Use the same email address you used for beta access when signing in with Google or Discord.",
  account_deactivated: "This account has been deactivated.",
  invalid_state: "Sign-in expired or was interrupted. Please try again.",
  failed: "Sign-in with that provider failed. Please try again.",
};

const OAUTH_LINK_ERROR_MESSAGES: Record<string, string> = {
  provider_linked_elsewhere: "That Google or Discord account is already linked to another Kurator user.",
  provider_already_linked: "That sign-in method is already linked to your account.",
  last_auth_method:
    "Set a password or link another sign-in method before removing this one.",
  email_required: OAUTH_ERROR_MESSAGES.email_required,
  invalid_state: OAUTH_ERROR_MESSAGES.invalid_state,
  failed: "Could not link that account. Please try again.",
};

export function oauthErrorMessage(code: string | null | undefined): string | null {
  if (!code?.trim()) return null;
  return OAUTH_ERROR_MESSAGES[code.trim()] ?? OAUTH_ERROR_MESSAGES.failed;
}

export function oauthLinkErrorMessage(code: string | null | undefined): string | null {
  if (!code?.trim()) return null;
  return OAUTH_LINK_ERROR_MESSAGES[code.trim()] ?? OAUTH_LINK_ERROR_MESSAGES.failed;
}

export function oauthLinkedSuccessMessage(provider: string | null | undefined): string | null {
  if (!provider?.trim()) return null;
  const label = provider === "google" ? "Google" : provider === "discord" ? "Discord" : provider;
  return `${label} is now linked to your account.`;
}
