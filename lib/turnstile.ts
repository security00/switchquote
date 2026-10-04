export type TurnstileVerificationResult = {
  ok: boolean;
  status: "unconfigured" | "verified" | "invalid" | "missing";
  error?: string;
  errorCodes?: string[];
};

export const TURNSTILE_TEST_SECRET_ALWAYS_PASS = "1x0000000000000000000000000000000AA";
export const TURNSTILE_TEST_SECRET_ALWAYS_FAIL = "2x0000000000000000000000000000000AA";
export const TURNSTILE_TEST_SITE_KEY_ALWAYS_PASS = "1x00000000000000000000AA";
export const TURNSTILE_TEST_SITE_KEY_ALWAYS_FAIL = "2x00000000000000000000AA";

export async function verifyTurnstile({
  token,
  secretKey,
  remoteIp,
  expectedHostname,
  expectedAction,
  fetchFn = fetch,
}: {
  token: string | null | undefined;
  secretKey: string | null | undefined;
  remoteIp?: string | null;
  /** When set, siteverify's `hostname` must equal it (the page the widget ran on). */
  expectedHostname?: string | null;
  /** When set, siteverify's `action` must equal the widget's data-action. */
  expectedAction?: string | null;
  fetchFn?: typeof fetch;
}): Promise<TurnstileVerificationResult> {
  const secret = (secretKey || "").trim();
  if (!secret) {
    return { ok: true, status: "unconfigured" };
  }

  const tok = (token || "").trim();
  if (!tok || tok.length > 2048) {
    return {
      ok: false,
      status: "missing",
      error: "Human verification token is required.",
    };
  }

  try {
    const formData = new URLSearchParams();
    formData.append("secret", secret);
    formData.append("response", tok);
    if (remoteIp) {
      formData.append("remoteip", remoteIp);
    }

    const res = await fetchFn("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: formData,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return {
        ok: false,
        status: "invalid",
        error: `Turnstile verification endpoint returned status ${res.status}.`,
      };
    }

    const body = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      hostname?: string;
      action?: string;
      "error-codes"?: string[];
    };

    if (body.success) {
      if (expectedHostname && body.hostname !== expectedHostname) {
        return { ok: false, status: "invalid", error: "Human verification failed. Please try again.", errorCodes: ["hostname-mismatch"] };
      }
      if (expectedAction && body.action !== expectedAction) {
        return { ok: false, status: "invalid", error: "Human verification failed. Please try again.", errorCodes: ["action-mismatch"] };
      }
      return { ok: true, status: "verified" };
    }

    return {
      ok: false,
      status: "invalid",
      error: "Human verification failed. Please try again.",
      errorCodes: body["error-codes"],
    };
  } catch (err) {
    return {
      ok: false,
      status: "invalid",
      error: `Could not verify security check: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
