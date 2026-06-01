import { apiUrl } from "./apiUrl";

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

async function billingApi(path: string, init?: RequestInit) {
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

export type BillingInterval = "monthly" | "annual";

export async function createCheckoutSession(interval: BillingInterval): Promise<string> {
  const res = await billingApi("/billing/create-checkout-session", {
    method: "POST",
    body: JSON.stringify({ interval }),
  });
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
  const data = (await res.json()) as { url?: string };
  if (!data.url?.trim()) {
    throw new Error("Checkout URL missing from response");
  }
  return data.url.trim();
}

export async function createBillingPortalSession(): Promise<string> {
  const res = await billingApi("/billing/portal", {
    method: "POST",
    body: "{}",
  });
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
  const data = (await res.json()) as { url?: string };
  if (!data.url?.trim()) {
    throw new Error("Portal URL missing from response");
  }
  return data.url.trim();
}

export function isProPlan(plan: string | undefined | null): boolean {
  return (plan ?? "").trim().toLowerCase() === "pro";
}

export function planLabel(plan: string | undefined | null): string {
  return isProPlan(plan) ? "Pro" : "Free";
}

export function normalizeBillingInterval(
  interval: string | undefined | null,
): BillingInterval | null {
  const v = (interval ?? "").trim().toLowerCase();
  if (v === "monthly" || v === "month") return "monthly";
  if (v === "annual" || v === "yearly" || v === "year") return "annual";
  return null;
}

export function billingIntervalLabel(interval: string | undefined | null): string {
  const n = normalizeBillingInterval(interval);
  if (n === "monthly") return "Monthly";
  if (n === "annual") return "Annual";
  return "";
}

export function proPlanLabel(
  plan: string | undefined | null,
  interval: string | undefined | null,
): string {
  if (!isProPlan(plan)) return planLabel(plan);
  const cadence = billingIntervalLabel(interval);
  return cadence ? `Pro (${cadence})` : "Pro";
}

export async function switchBillingInterval(interval: BillingInterval): Promise<void> {
  const res = await billingApi("/billing/switch-interval", {
    method: "POST",
    body: JSON.stringify({ interval }),
  });
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
}
