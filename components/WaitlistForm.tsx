"use client";

import { useState, type FormEvent } from "react";
import type { WaitlistRole } from "@/lib/site";

type Status = "idle" | "loading" | "success" | "error";

export function WaitlistForm({ id }: { id?: string }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WaitlistRole>("journalist");
  const [bilingual, setBilingual] = useState<"yes" | "no">("yes");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          role,
          bilingual_interviews: bilingual === "yes",
        }),
      });

      const data = (await res.json()) as { ok?: boolean; error?: string };

      if (!res.ok) {
        setStatus("error");
        setMessage(data.error ?? "Something went wrong. Try again.");
        return;
      }

      setStatus("success");
      setMessage("You're on the list. We'll reach out when uploads open.");
      setEmail("");
    } catch {
      setStatus("error");
      setMessage("Network error. Check your connection and try again.");
    }
  }

  return (
    <form
      id={id}
      onSubmit={onSubmit}
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
    >
      <h2 className="text-xl font-semibold text-slate-900">Join the waitlist</h2>
      <p className="mt-2 text-sm text-slate-600">
        Phase A: no uploads yet. Tell us who you are so we can prioritize
        journalists on the Spanish beat.
      </p>

      <div className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Work email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 shadow-sm focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
            placeholder="you@newsroom.org"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Role</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as WaitlistRole)}
            className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 shadow-sm focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
          >
            <option value="journalist">Journalist</option>
            <option value="researcher">UX / research</option>
            <option value="other">Other</option>
          </select>
        </label>

        <fieldset>
          <legend className="text-sm font-medium text-slate-700">
            Do you regularly record bilingual Spanish–English interviews?
          </legend>
          <div className="mt-2 flex gap-4">
            {(["yes", "no"] as const).map((value) => (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-2 text-sm text-slate-700"
              >
                <input
                  type="radio"
                  name="bilingual"
                  value={value}
                  checked={bilingual === value}
                  onChange={() => setBilingual(value)}
                  className="text-teal-800 focus:ring-teal-700"
                />
                {value === "yes" ? "Yes" : "No"}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <button
        type="submit"
        disabled={status === "loading"}
        className="mt-6 w-full rounded-full bg-teal-800 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-60 transition-colors"
      >
        {status === "loading" ? "Submitting…" : "Request early access"}
      </button>

      {message ? (
        <p
          role="status"
          className={`mt-4 text-sm ${status === "success" ? "text-teal-800" : "text-red-700"}`}
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}
