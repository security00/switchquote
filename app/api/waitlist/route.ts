import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { WaitlistRole } from "@/lib/site";

const ROLES: WaitlistRole[] = ["journalist", "researcher", "other"];

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const { email, role, bilingual_interviews } = body as Record<string, unknown>;

  if (typeof email !== "string" || !isValidEmail(email.trim())) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  if (typeof role !== "string" || !ROLES.includes(role as WaitlistRole)) {
    return Response.json({ error: "Choose a valid role." }, { status: 400 });
  }

  if (typeof bilingual_interviews !== "boolean") {
    return Response.json(
      { error: "Answer whether you run bilingual interviews (yes/no)." },
      { status: 400 },
    );
  }

  const ctx = await getCloudflareContext({ async: true });
  const db = ctx.env.DB;

  if (!db) {
    return Response.json(
      { error: "Waitlist storage is not configured." },
      { status: 503 },
    );
  }

  try {
    await db
      .prepare(
        `INSERT INTO waitlist (email, role, bilingual_interviews, created_at)
         VALUES (?, ?, ?, datetime('now'))`,
      )
      .bind(email.trim().toLowerCase(), role, bilingual_interviews ? 1 : 0)
      .run();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("UNIQUE") || message.includes("unique")) {
      return Response.json(
        { error: "That email is already on the waitlist." },
        { status: 409 },
      );
    }
    console.error("waitlist insert failed", err);
    return Response.json({ error: "Could not save signup." }, { status: 500 });
  }

  return Response.json({ ok: true });
}
