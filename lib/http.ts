import { auth } from "@/auth";
import { NextResponse } from "next/server";

export function json(body: unknown, status = 200, setCookie: string | null = null): NextResponse {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  if (setCookie) res.headers.append("Set-Cookie", setCookie);
  return res;
}

export const fail = (status: number, code: string, error: string) => json({ ok: false, code, error }, status);

export async function sessionUserId(): Promise<string | null> {
  try {
    const session = await auth();
    return session?.userId ?? null;
  } catch (e) {
    console.error("session lookup failed", e instanceof Error ? e.message : e);
    return null;
  }
}
