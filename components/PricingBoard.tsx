"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { formatCreditAmount } from "@/lib/credit-units";
import { PACKS, PLANS } from "@/lib/pricing";

type Me = {
  signedIn: boolean;
  googleConfigured: boolean;
  checkoutConfigured?: boolean;
  signupCredits?: number;
  privateTest: boolean;
  email?: string | null;
  access?: "open" | "allowed" | "waitlist";
  creditsLeft?: number;
};

export function PricingBoard({ canceled }: { canceled: boolean }) {
  const [yearly, setYearly] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/me", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return (await res.json()) as Me;
      })
      .then((data) => alive && setMe(data))
      .catch(() => alive && setLoadFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  async function checkout(sku: string) {
    setBusy(sku);
    setError("");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sku }),
      });
      const body = (await res.json().catch(() => ({ error: `Checkout failed (${res.status}).` }))) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        setError(body.error || `Checkout failed (${res.status}).`);
        return;
      }
      window.location.assign(body.url);
    } catch {
      setError("Could not start checkout. Please try again.");
      setBusy("");
    }
  }

  const canBuy = Boolean(me?.signedIn && me.access !== "waitlist" && me.googleConfigured && me.checkoutConfigured);
  const signup = me?.signupCredits ?? 20;

  return (
    <div className="mt-10">
      {canceled && (
        <p className="mb-6 rounded-md border border-rule bg-surface px-4 py-3 text-sm text-ink-soft" role="status">
          Checkout canceled. No charge was made.
        </p>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="max-w-xl text-sm leading-relaxed text-ink-soft">
          New allowlisted accounts start with {signup} credits. Credits are used from that grant first, then the subscription allotment, then packs. Prices are USD. This test checkout does not add tax.
        </p>
        <div className="inline-flex rounded-md border border-rule-strong bg-surface p-1 text-sm font-medium" role="group" aria-label="Billing period">
          <button type="button" aria-pressed={!yearly} onClick={() => setYearly(false)} className={`rounded px-3 py-1.5 ${yearly ? "text-ink-soft" : "bg-accent text-white"}`}>
            Monthly
          </button>
          <button type="button" aria-pressed={yearly} onClick={() => setYearly(true)} className={`rounded px-3 py-1.5 ${yearly ? "bg-accent text-white" : "text-ink-soft"}`}>
            Yearly
          </button>
        </div>
      </div>

      {me?.signedIn && (
        <p className="mt-4 text-sm text-ink-soft">
          Signed in as <strong className="font-medium text-ink">{me.email}</strong>
          {me.access !== "waitlist" && typeof me.creditsLeft === "number" ? (
            <>
              {" "}
              · Credits left: <strong className="font-medium text-ink">{formatCreditAmount(me.creditsLeft)}</strong>
            </>
          ) : null}
        </p>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const choice = yearly ? plan.yearly : plan.monthly;
          return (
            <article key={plan.id} className="flex flex-col rounded-xl border border-rule bg-surface p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-12px_rgba(16,24,40,0.12)]">
              <h2 className="text-2xl">{plan.name}</h2>
              <p className="mt-1 text-sm text-ink-soft">{plan.detail}</p>
              <p className="mt-5 font-display text-4xl text-ink">
                ${choice.usd}
                <span className="font-sans text-base text-ink-faint">{yearly ? " / year" : " / month"}</span>
              </p>
              <p className="mt-2 text-sm font-medium text-ink">{plan.credits} credits each month</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-faint">{yearly ? "Billed once a year. The monthly credits still arrive one month at a time." : "Billed every month. Each paid invoice adds that month's credits."}</p>
              <div className="mt-6">{buyButton(choice.sku, yearly ? "Subscribe yearly" : "Subscribe", canBuy, busy, me, loadFailed, () => checkout(choice.sku))}</div>
            </article>
          );
        })}
      </div>

      <h2 className="mt-14 text-3xl">Credit packs</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">One-time packs. Unused credits stay on the account for 24 months.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {PACKS.map((pack) => (
          <article key={pack.sku} className="rounded-xl border border-rule bg-surface p-6">
            <h3 className="font-display text-2xl text-ink">Pack {pack.name}</h3>
            <p className="mt-3 font-display text-4xl text-ink">
              ${pack.usd}
              <span className="font-sans text-base text-ink-faint"> once</span>
            </p>
            <p className="mt-2 text-sm font-medium text-ink">{pack.credits} credits</p>
            <div className="mt-6">{buyButton(pack.sku, "Buy pack", canBuy, busy, me, loadFailed, () => checkout(pack.sku))}</div>
          </article>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <p className="mt-8 text-sm text-ink-soft">
        <Link href="/app" className="font-medium text-accent underline decoration-accent/30 underline-offset-4 hover:decoration-accent">
          Back to the transcriber →
        </Link>
      </p>
    </div>
  );
}

function buyButton(sku: string, label: string, canBuy: boolean, busy: string, me: Me | null, loadFailed: boolean, onBuy: () => void) {
  if (!me) {
    return (
      <button type="button" disabled className="w-full rounded-md bg-rule-strong px-4 py-2.5 text-sm font-semibold text-white">
        {loadFailed ? "Couldn't load checkout" : "Loading…"}
      </button>
    );
  }
  if (!me.googleConfigured) {
    return <p className="rounded-md border border-dashed border-rule-strong bg-paper px-3 py-2.5 text-sm text-ink-soft">Google sign-in isn&apos;t switched on yet, so checkout can&apos;t start.</p>;
  }
  if (!me.signedIn) {
    return (
      <button type="button" onClick={() => signIn("google", { redirectTo: "/pricing" })} className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-strong">
        Sign in to buy
      </button>
    );
  }
  if (me.access === "waitlist") {
    return <p className="text-sm leading-relaxed text-ink-soft">This account isn&apos;t on the private-test list.</p>;
  }
  if (!me.checkoutConfigured) {
    return <p className="rounded-md border border-dashed border-rule-strong bg-paper px-3 py-2.5 text-sm text-ink-soft">Checkout isn&apos;t switched on yet.</p>;
  }
  return (
    <button type="button" onClick={onBuy} disabled={!canBuy || busy !== ""} className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-accent-strong disabled:cursor-not-allowed disabled:bg-rule-strong">
      {busy === sku ? "Starting checkout…" : label}
    </button>
  );
}
