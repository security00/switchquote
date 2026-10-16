import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { applyTranscriptEdit, segmentsFromDeepgram, type Transcript } from "./transcript";
import { loadTranscript, writeTranscriptEdit } from "./store";

type Sqlite = {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number | bigint };
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
  };
};

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: new (path: string) => Sqlite };

function openDb(): D1Database {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of ["migrations/0002_transcription_mvp.sql", "migrations/0003_engine_ledger.sql", "migrations/0005_speaker_names.sql"]) {
    sqlite.exec(readFileSync(path.join(process.cwd(), file), "utf8"));
  }
  const prepare = (sql: string) => {
    const bound = (params: unknown[]) => ({
      async run() {
        const info = sqlite.prepare(sql).run(...params);
        return { success: true, meta: { changes: Number(info.changes) } };
      },
      async first<T>() {
        return (sqlite.prepare(sql).get(...params) as T | undefined) ?? null;
      },
      async all<T>() {
        return { results: sqlite.prepare(sql).all(...params) as T[] };
      },
    });
    return { ...bound([]), bind: (...params: unknown[]) => bound(params) };
  };
  return { prepare } as unknown as D1Database;
}

const sample: Transcript = {
  id: "t1",
  filename: "a.wav",
  durationSec: 5,
  engine: "deepgram/nova-3",
  createdAt: 1,
  segments: segmentsFromDeepgram({
    results: {
      utterances: [
        {
          start: 0,
          end: 2,
          speaker: 0,
          words: [
            { punctuated_word: "Pero", language: "es", start: 0, end: 0.4 },
            { punctuated_word: "no.", language: "en", start: 0.5, end: 1 },
          ],
        },
      ],
    },
  }),
  translation: ["But no."],
};

test("speaker names and word corrections round-trip through D1", async () => {
  const db = openDb();
  await db
    .prepare(
      `INSERT INTO transcripts (id, user_id, status, filename, mime, bytes, duration_sec, engine, segments_json, translation_json, created_at, expires_at)
       VALUES ('t1', 'u1', 'done', 'a.wav', 'audio/wav', 8, 5, 'deepgram/nova-3', ?, ?, 1, 99)`
    )
    .bind(JSON.stringify(sample.segments), JSON.stringify(sample.translation))
    .run();
  const renamed = applyTranscriptEdit(sample, { op: "speaker", speaker: 0, name: "Mayor García" });
  assert.equal(renamed.ok, true);
  if (!renamed.ok) return;
  const corrected = applyTranscriptEdit(renamed.transcript, { op: "word", si: 0, wi: 1, w: "never.", lang: "en" });
  assert.equal(corrected.ok, true);
  if (!corrected.ok) return;
  assert.equal(await writeTranscriptEdit(db, "u1", "t1", corrected.transcript), true);
  const loaded = await loadTranscript(db, "u1", "t1");
  assert.equal(loaded?.speakers?.["0"], "Mayor García");
  assert.equal(loaded?.segments[0].words[1].w, "never.");
  assert.equal(loaded?.segments[0].lang, "mixed");
  assert.deepEqual(loaded?.translation, [""]);
  assert.equal(await writeTranscriptEdit(db, "someone-else", "t1", corrected.transcript), false);
});
