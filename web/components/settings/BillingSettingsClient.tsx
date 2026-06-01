"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { MarkdownBody } from "@/components/MarkdownBody";
import { PageHeroUnsplash } from "@/components/PageHeroUnsplash";
import { useAuth } from "@/components/AuthProvider";
import {
  billingIntervalLabel,
  createBillingPortalSession,
  createCheckoutSession,
  isProPlan,
  normalizeBillingInterval,
  proPlanLabel,
  switchBillingInterval,
  type BillingInterval,
} from "@/lib/billing";
import { fetchMe, type AuthUser } from "@/lib/auth";

type BusyKind = BillingInterval | "portal" | null;

function isActiveSubscriptionStatus(status: string | undefined | null): boolean {
  const s = (status ?? "").trim().toLowerCase();
  return s === "active" || s === "trialing";
}

type Props = {
  plansMarkdown: string;
};

export function BillingSettingsClient({ plansMarkdown }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh: refreshAuth } = useAuth();
  const checkoutResult = searchParams.get("checkout");

  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [busy, setBusy] = useState<BusyKind>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setUser(await fetchMe());
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (user === null) {
      router.replace("/login?next=/settings/billing");
    }
  }, [user, router]);

  useEffect(() => {
    if (checkoutResult === "success") {
      setMessage({
        tone: "ok",
        text: "Thanks — your subscription is being activated. Refresh in a moment if your plan has not updated yet.",
      });
      void refreshAuth();
      void load();
    } else if (checkoutResult === "cancelled") {
      setMessage({ tone: "bad", text: "Checkout was cancelled. You can try again whenever you are ready." });
    }
  }, [checkoutResult, load, refreshAuth]);

  async function startCheckout(interval: BillingInterval) {
    setBusy(interval);
    setMessage(null);
    try {
      const url = await createCheckoutSession(interval);
      window.location.assign(url);
    } catch (e) {
      setMessage({
        tone: "bad",
        text: e instanceof Error ? e.message : "Could not start checkout",
      });
      setBusy(null);
    }
  }

  async function openPortal() {
    setBusy("portal");
    setMessage(null);
    try {
      const url = await createBillingPortalSession();
      window.location.assign(url);
    } catch (e) {
      setMessage({
        tone: "bad",
        text: e instanceof Error ? e.message : "Could not open billing portal",
      });
      setBusy(null);
    }
  }

  async function switchInterval(interval: BillingInterval) {
    setBusy(interval);
    setMessage(null);
    try {
      await switchBillingInterval(interval);
      setMessage({
        tone: "ok",
        text: `Your plan is now billed ${billingIntervalLabel(interval).toLowerCase()}. Stripe may prorate the change on your next invoice.`,
      });
      await refreshAuth();
      await load();
    } catch (e) {
      setMessage({
        tone: "bad",
        text: e instanceof Error ? e.message : "Could not switch billing interval",
      });
    } finally {
      setBusy(null);
    }
  }

  if (user === undefined) {
    return <p className="p-8 text-sm text-kurator-muted">Loading…</p>;
  }
  if (user === null) {
    return null;
  }

  const pro = isProPlan(user.plan);
  const status = (user.subscription_status ?? "").trim();
  const currentInterval = normalizeBillingInterval(user.subscription_interval);
  const canSwitchInterval = pro && isActiveSubscriptionStatus(status);

  return (
    <>
      <PageHeroUnsplash>
        <div>
          <h1 className="text-2xl font-semibold text-kurator-fg">Billing</h1>
          <p className="mt-1 text-sm text-kurator-muted">Kurator Pro — flat-rate subscription</p>
        </div>
      </PageHeroUnsplash>

      {message ? (
        <p
          role="status"
          className={`mb-6 rounded-lg border px-3 py-2 text-sm ${
            message.tone === "ok"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
              : "border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-200"
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <section className="rounded-xl border border-kurator-border bg-kurator-surface p-5 shadow-surface sm:p-8">
        <h2 className="text-lg font-semibold text-kurator-fg">Current plan</h2>
        <p className="mt-2 text-3xl font-bold tracking-tight text-kurator-fg">
          {proPlanLabel(user.plan, user.subscription_interval)}
        </p>
        {pro && currentInterval ? (
          <p className="mt-1 text-sm text-kurator-muted">
            Billed <span className="font-medium text-kurator-fg">{billingIntervalLabel(currentInterval)}</span>
          </p>
        ) : null}
        {status ? (
          <p className="mt-1 text-sm text-kurator-muted">
            Subscription status: <span className="font-medium text-kurator-fg">{status}</span>
          </p>
        ) : null}
        <p className="mt-3 text-sm text-kurator-muted">
          {pro
            ? canSwitchInterval
              ? "Switch between monthly and annual billing below, or manage payment methods and cancellation in the Stripe customer portal."
              : "Manage your subscription, payment method, or cancellation in the Stripe customer portal."
            : "Upgrade to Pro for a flat monthly or annual rate. Free accounts are not billed through Stripe."}
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {pro ? (
            <>
              {canSwitchInterval ? (
                <>
                  <button
                    type="button"
                    className="rounded-lg bg-kurator-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    disabled={busy !== null || currentInterval === "monthly"}
                    onClick={() => void switchInterval("monthly")}
                  >
                    {busy === "monthly" ? "Switching…" : "Switch to monthly"}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-kurator-border bg-kurator-bg px-4 py-2 text-sm font-medium text-kurator-fg transition-colors hover:bg-kurator-border/30 disabled:opacity-50"
                    disabled={busy !== null || currentInterval === "annual"}
                    onClick={() => void switchInterval("annual")}
                  >
                    {busy === "annual" ? "Switching…" : "Switch to annual"}
                  </button>
                </>
              ) : null}
              <button
                type="button"
                className="rounded-lg border border-kurator-border bg-kurator-bg px-4 py-2 text-sm font-medium text-kurator-fg transition-colors hover:bg-kurator-border/30 disabled:opacity-50"
                disabled={busy !== null}
                onClick={() => void openPortal()}
              >
                {busy === "portal" ? "Opening portal…" : "Manage subscription"}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="rounded-lg bg-kurator-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                disabled={busy !== null}
                onClick={() => void startCheckout("monthly")}
              >
                {busy === "monthly" ? "Redirecting…" : "Upgrade — monthly"}
              </button>
              <button
                type="button"
                className="rounded-lg border border-kurator-border bg-kurator-bg px-4 py-2 text-sm font-medium text-kurator-fg transition-colors hover:bg-kurator-border/30 disabled:opacity-50"
                disabled={busy !== null}
                onClick={() => void startCheckout("annual")}
              >
                {busy === "annual" ? "Redirecting…" : "Upgrade — annual"}
              </button>
            </>
          )}
          <Link
            href="/settings/app"
            className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm text-kurator-muted transition-colors hover:text-kurator-fg"
          >
            Back to app settings
          </Link>
        </div>
      </section>

      <section className="mt-8 rounded-xl border border-kurator-border bg-kurator-surface/60 p-5 text-sm text-kurator-muted">
        <MarkdownBody markdown={plansMarkdown} />
      </section>
    </>
  );
}
