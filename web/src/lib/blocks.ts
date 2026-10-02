/** Jawaban agent dipecah menjadi teks biasa dan blok kode (```lang … ```) supaya kode bisa disalin per blok. */
export type Block = { kind: "text"; text: string } | { kind: "code"; lang: string; code: string };

export function splitBlocks(text: string): Block[] {
  const out: Block[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let buf: string[] = [];
  let code: { lang: string; lines: string[] } | null = null;
  const flushText = () => { const t = buf.join("\n").trim(); if (t) out.push({ kind: "text", text: t }); buf = []; };
  for (const line of lines) {
    const fence = line.match(/^\s*```\s*([\w+#.-]*)\s*$/);
    if (fence && !code) { flushText(); code = { lang: fence[1], lines: [] }; continue; }
    if (fence && code) { out.push({ kind: "code", lang: code.lang, code: code.lines.join("\n") }); code = null; continue; }
    (code ? code.lines : buf).push(line);
  }
  if (code) out.push({ kind: "code", lang: code.lang, code: code.lines.join("\n") });
  flushText();
  return out;
}
