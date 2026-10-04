import { strToU8, zipSync } from "fflate";
import { clock, speakerLabel, switchPoints, type Transcript } from "./transcript";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function run(text: string, opts: { color?: string; bold?: boolean; italic?: boolean; highlight?: string } = {}) {
  const props = [
    opts.bold ? "<w:b/>" : "",
    opts.italic ? "<w:i/>" : "",
    opts.color ? `<w:color w:val="${opts.color}"/>` : "",
    opts.highlight ? `<w:highlight w:val="${opts.highlight}"/>` : "",
  ].join("");
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}
const para = (runs: string) => `<w:p>${runs}</w:p>`;

/** Minimal DOCX: Spanish words in teal, the first word after each language switch highlighted. */
export function toDocx(t: Transcript): Uint8Array {
  const switches = switchPoints(t.segments);
  const body: string[] = [
    para(run(`${t.filename} — SwitchQuote transcript`, { bold: true })),
    para(run("AI draft — verify every quote before publishing. Spanish in teal; highlighted words mark a language switch.", { italic: true, color: "64748B" })),
  ];
  t.segments.forEach((s, si) => {
    const runs = [run(`[${clock(s.start)}] ${speakerLabel(s.speaker)}: `, { bold: true })];
    s.words.forEach((w, wi) => {
      runs.push(run(`${wi ? " " : ""}`));
      runs.push(run(w.w, { color: w.lang === "es" ? "0F766E" : undefined, highlight: switches.has(`${si}:${wi}`) ? "yellow" : undefined }));
    });
    body.push(para(runs.join("")));
    if (t.translation?.[si]) body.push(para(run(`EN: ${t.translation[si]}`, { italic: true, color: "475569" })));
  });
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join("")}</w:body></w:document>`;
  return zipSync({
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
    ),
    "word/document.xml": strToU8(doc),
  });
}
