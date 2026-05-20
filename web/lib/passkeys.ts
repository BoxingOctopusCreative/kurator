import {
  startAuthentication,
  startRegistration,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/browser";
import { apiUrl } from "@/lib/apiUrl";

export type PasskeyCredential = {
  id: number;
  nickname: string;
  created_at: string;
  last_used_at?: string;
};

type BeginResult = {
  session_token: string;
  publicKey: PublicKeyCredentialCreationOptionsJSON | PublicKeyCredentialRequestOptionsJSON;
};

async function passkeyFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    credentials: "include",
  });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const msg =
      data && typeof data === "object" && data !== null && "error" in data
        ? String((data as { error: string }).error)
        : res.statusText || "Request failed";
    throw new Error(msg);
  }
  return data as T;
}

export async function fetchPasskeysEnabled(): Promise<boolean> {
  try {
    const data = await passkeyFetch<{ enabled: boolean }>("/auth/webauthn/status");
    return Boolean(data.enabled);
  } catch {
    return false;
  }
}

export async function listPasskeys(): Promise<PasskeyCredential[]> {
  return passkeyFetch<PasskeyCredential[]>("/me/webauthn/credentials");
}

export async function registerPasskey(nickname: string): Promise<PasskeyCredential> {
  const begin = await passkeyFetch<BeginResult>("/me/webauthn/register/begin", {
    method: "POST",
    body: JSON.stringify({ nickname: nickname.trim() || "Passkey" }),
  });
  const attestation = await startRegistration({
    optionsJSON: begin.publicKey as PublicKeyCredentialCreationOptionsJSON,
  });
  return passkeyFetch<PasskeyCredential>("/me/webauthn/register/finish", {
    method: "POST",
    body: JSON.stringify({
      session_token: begin.session_token,
      credential: attestation,
      nickname: nickname.trim() || "Passkey",
    }),
  });
}

export async function loginWithPasskey(email: string): Promise<void> {
  const begin = await passkeyFetch<BeginResult>("/auth/webauthn/login/begin", {
    method: "POST",
    body: JSON.stringify({ email: email.trim() }),
  });
  const assertion = await startAuthentication({
    optionsJSON: begin.publicKey as PublicKeyCredentialRequestOptionsJSON,
  });
  await passkeyFetch<{ user: unknown; session_token: string }>("/auth/webauthn/login/finish", {
    method: "POST",
    body: JSON.stringify({
      session_token: begin.session_token,
      credential: assertion,
    }),
  });
}

export async function renamePasskey(id: number, nickname: string): Promise<void> {
  await passkeyFetch<void>(`/me/webauthn/credentials/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ nickname: nickname.trim() }),
  });
}

export async function deletePasskey(id: number): Promise<void> {
  await passkeyFetch<void>(`/me/webauthn/credentials/${id}`, { method: "DELETE" });
}

export type { AuthenticationResponseJSON, RegistrationResponseJSON };
