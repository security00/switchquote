import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { detectDuration } from "./duration";

function wav(seconds: number, rate = 16000): Uint8Array {
  const data = Math.round(seconds * rate) * 2;
  const b = new Uint8Array(44 + data);
  const v = new DataView(b.buffer);
  const w = (o: number, s: string) => [...s].forEach((c, i) => (b[o + i] = c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + data, true); w(8, "WAVE");
  w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, data, true);
  return b;
}

function mp3(frames: number): Uint8Array {
  // MPEG-1 Layer III, 128 kbps, 44.1 kHz, no padding: 417-byte frames, 1152 samples each.
  const len = 417;
  const b = new Uint8Array(frames * len);
  for (let i = 0; i < frames; i++) b.set([0xff, 0xfb, 0x90, 0x00], i * len);
  return b;
}

function mp4(timescale: number, duration: number): Uint8Array {
  const b = new Uint8Array(16 + 8 + 108);
  const v = new DataView(b.buffer);
  const w = (o: number, s: string) => [...s].forEach((c, i) => (b[o + i] = c.charCodeAt(0)));
  v.setUint32(0, 16); w(4, "ftyp"); w(8, "M4A ");
  v.setUint32(16, 8 + 108); w(20, "moov");
  v.setUint32(24, 108); w(28, "mvhd"); // version 0
  v.setUint32(24 + 8 + 12, timescale); v.setUint32(24 + 8 + 16, duration);
  return b;
}

test("wav duration from header", () => {
  assert.equal(detectDuration(wav(3))?.seconds, 3);
  assert.equal(detectDuration(wav(3))?.format, "wav");
});

test("mp3 duration by frame scan", () => {
  const d = detectDuration(mp3(100));
  assert.equal(d?.format, "mp3");
  assert.ok(Math.abs((d?.seconds ?? 0) - (100 * 1152) / 44100) < 1e-9);
});

test("mp4 duration from mvhd", () => {
  assert.equal(detectDuration(mp4(1000, 61_000))?.seconds, 61);
});

test("unknown bytes are rejected", () => {
  assert.equal(detectDuration(new TextEncoder().encode("not an audio file at all")), null);
});

test("real smoke clip (when present on the box)", { skip: !existsSync("/workspace/deepgram-smoke/opensource/clips/maria20_w0_750-810.wav") }, () => {
  const d = detectDuration(readFileSync("/workspace/deepgram-smoke/opensource/clips/maria20_w0_750-810.wav"));
  assert.ok(d && Math.abs(d.seconds - 60) < 0.5);
});
