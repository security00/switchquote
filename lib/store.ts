import type { Segment, Transcript } from "./transcript";

type Row = {
  id: string;
  filename: string;
  duration_sec: number;
  engine: string;
  lang_tags: string | null;
  created_at: number;
  segments_json: string | null;
  translation_json: string | null;
  status: string;
};

export async function loadTranscript(db: D1Database, userId: string, id: string): Promise<(Transcript & { status: string }) | null> {
  const r = await db
    .prepare(`SELECT id, filename, duration_sec, engine, lang_tags, created_at, segments_json, translation_json, status FROM transcripts WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .first<Row>();
  if (!r) return null;
  return {
    id: r.id,
    filename: r.filename,
    durationSec: r.duration_sec,
    engine: r.engine,
    langTags: r.lang_tags,
    createdAt: r.created_at,
    status: r.status,
    segments: r.segments_json ? (JSON.parse(r.segments_json) as Segment[]) : [],
    translation: r.translation_json ? (JSON.parse(r.translation_json) as string[]) : null,
  };
}
