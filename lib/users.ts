import { generateId, nowSeconds } from "./cf";

export type GoogleProfile = { email: string; name: string | null; image: string | null; googleId: string };

export async function upsertGoogleUser(db: D1Database, profile: GoogleProfile): Promise<{ id: string }> {
  const ts = nowSeconds();
  const row = await db
    .prepare(
      `INSERT INTO users (id, email, name, image, google_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET name = excluded.name, image = excluded.image,
         google_id = excluded.google_id, updated_at = excluded.updated_at
       RETURNING id`
    )
    .bind(generateId(), profile.email.trim().toLowerCase(), profile.name, profile.image, profile.googleId, ts, ts)
    .first<{ id: string }>();
  if (!row?.id) throw new Error("Could not save the Google account");
  return row;
}

export async function userEmail(db: D1Database, userId: string): Promise<string | null> {
  const row = await db.prepare(`SELECT email FROM users WHERE id = ?`).bind(userId).first<{ email: string }>();
  return row?.email ?? null;
}
