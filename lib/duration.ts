/**
 * Server-side audio duration from the file itself (never trust a client-declared length).
 * Supports WAV, MP4/M4A/MOV, MP3 (full frame scan), Ogg (Opus/Vorbis) and FLAC.
 * Returns null when the format is unknown or the header can't be read.
 */
export type DurationResult = { format: "wav" | "mp4" | "mp3" | "ogg" | "flac"; seconds: number };

const ascii = (b: Uint8Array, off: number, len: number) =>
  off + len <= b.length ? String.fromCharCode(...b.subarray(off, off + len)) : "";

function u32be(b: Uint8Array, o: number) {
  return ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
}
function u32le(b: Uint8Array, o: number) {
  return b[o] + (b[o + 1] << 8) + (b[o + 2] << 16) + ((b[o + 3] << 24) >>> 0);
}
function u64be(b: Uint8Array, o: number) {
  return u32be(b, o) * 2 ** 32 + u32be(b, o + 4);
}
function u64le(b: Uint8Array, o: number) {
  return u32le(b, o) + u32le(b, o + 4) * 2 ** 32;
}

function wavDuration(b: Uint8Array): number | null {
  let off = 12;
  let byteRate = 0;
  while (off + 8 <= b.length) {
    const id = ascii(b, off, 4);
    const size = u32le(b, off + 4);
    const body = off + 8;
    if (id === "fmt " && body + 12 <= b.length) byteRate = u32le(b, body + 8);
    if (id === "data") {
      if (!byteRate) return null;
      const available = b.length - body;
      const dataSize = size === 0xffffffff || size > available ? available : size;
      return dataSize / byteRate;
    }
    off = body + size + (size % 2);
  }
  return null;
}

function mp4Duration(b: Uint8Array): number | null {
  const walk = (start: number, end: number, path: string[]): number | null => {
    let off = start;
    while (off + 8 <= end) {
      let size = u32be(b, off);
      const type = ascii(b, off + 4, 4);
      let header = 8;
      if (size === 1) {
        if (off + 16 > end) return null;
        size = u64be(b, off + 8);
        header = 16;
      } else if (size === 0) {
        size = end - off;
      }
      if (size < header) return null;
      const boxEnd = Math.min(end, off + size);
      if (path.length === 0 && type === "moov") return walk(off + header, boxEnd, ["moov"]);
      if (path[0] === "moov" && type === "mvhd") {
        const p = off + header;
        const version = b[p];
        if (version === 1) {
          if (p + 32 > boxEnd) return null;
          const timescale = u32be(b, p + 20);
          return timescale ? u64be(b, p + 24) / timescale : null;
        }
        if (p + 20 > boxEnd) return null;
        const timescale = u32be(b, p + 12);
        return timescale ? u32be(b, p + 16) / timescale : null;
      }
      off += size;
    }
    return null;
  };
  return walk(0, b.length, []);
}

const MP3_BITRATES: Record<string, number[]> = {
  // [version][layer] kbps tables, index 1..14
  "1-1": [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  "1-2": [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  "1-3": [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  "2-1": [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  "2-2": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  "2-3": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const MP3_RATES: Record<number, number[]> = { 1: [44100, 48000, 32000], 2: [22050, 24000, 16000], 25: [11025, 12000, 8000] };

type Mp3Frame = { length: number; samples: number; rate: number };

function mp3Frame(b: Uint8Array, o: number): Mp3Frame | null {
  if (o + 4 > b.length || b[o] !== 0xff || (b[o + 1] & 0xe0) !== 0xe0) return null;
  const verBits = (b[o + 1] >> 3) & 3;
  const layerBits = (b[o + 1] >> 1) & 3;
  const brIdx = (b[o + 2] >> 4) & 15;
  const srIdx = (b[o + 2] >> 2) & 3;
  const pad = (b[o + 2] >> 1) & 1;
  if (verBits === 1 || layerBits === 0 || brIdx === 0 || brIdx === 15 || srIdx === 3) return null;
  const version = verBits === 3 ? 1 : verBits === 2 ? 2 : 25;
  const layer = 4 - layerBits;
  const kbps = MP3_BITRATES[`${version === 1 ? 1 : 2}-${layer}`][brIdx];
  const rate = MP3_RATES[version][srIdx];
  let length: number;
  let samples: number;
  if (layer === 1) {
    samples = 384;
    length = (Math.floor((12 * kbps * 1000) / rate) + pad) * 4;
  } else {
    samples = layer === 3 && version !== 1 ? 576 : 1152;
    length = Math.floor(((samples / 8) * kbps * 1000) / rate) + pad;
  }
  return length > 4 ? { length, samples, rate } : null;
}

function mp3Duration(b: Uint8Array): number | null {
  let off = 0;
  if (ascii(b, 0, 3) === "ID3" && b.length >= 10) {
    const size = ((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f);
    off = 10 + size + (b[5] & 0x10 ? 10 : 0);
  }
  let seconds = 0;
  let frames = 0;
  while (off + 4 <= b.length) {
    const f = mp3Frame(b, off);
    if (!f) {
      off += 1;
      continue;
    }
    seconds += f.samples / f.rate;
    frames += 1;
    off += f.length;
  }
  return frames >= 2 ? seconds : null;
}

function oggDuration(b: Uint8Array): number | null {
  // First page carries the codec id header.
  const head = 27 + b[26];
  let rate = 0;
  let preSkip = 0;
  if (ascii(b, head, 8) === "OpusHead") {
    rate = 48000;
    preSkip = b[head + 10] | (b[head + 11] << 8);
  } else if (ascii(b, head + 1, 6) === "vorbis") {
    rate = u32le(b, head + 12);
  }
  if (!rate) return null;
  for (let o = b.length - 14; o >= 0; o--) {
    if (b[o] === 0x4f && ascii(b, o, 4) === "OggS") {
      const granule = u64le(b, o + 6);
      return granule > 0 && granule < 2 ** 52 ? Math.max(0, granule - preSkip) / rate : null;
    }
  }
  return null;
}

function flacDuration(b: Uint8Array): number | null {
  const p = 4 + 4; // after "fLaC" and the first metadata block header (STREAMINFO)
  if ((b[4] & 0x7f) !== 0 || p + 18 > b.length) return null;
  const rate = (b[p + 10] << 12) | (b[p + 11] << 4) | (b[p + 12] >> 4);
  const total = (b[p + 13] & 0x0f) * 2 ** 32 + u32be(b, p + 14);
  return rate && total ? total / rate : null;
}

export function detectDuration(input: ArrayBuffer | Uint8Array): DurationResult | null {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (b.length < 12) return null;
  const pick = (format: DurationResult["format"], seconds: number | null): DurationResult | null =>
    seconds !== null && Number.isFinite(seconds) && seconds > 0 ? { format, seconds } : null;
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WAVE") return pick("wav", wavDuration(b));
  if (ascii(b, 4, 4) === "ftyp") return pick("mp4", mp4Duration(b));
  if (ascii(b, 0, 4) === "OggS") return pick("ogg", oggDuration(b));
  if (ascii(b, 0, 4) === "fLaC") return pick("flac", flacDuration(b));
  if (ascii(b, 0, 3) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return pick("mp3", mp3Duration(b));
  return null;
}

export const MIME_BY_FORMAT: Record<DurationResult["format"], string> = {
  wav: "audio/wav",
  mp4: "audio/mp4",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  flac: "audio/flac",
};
