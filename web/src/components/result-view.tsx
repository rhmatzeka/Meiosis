/** Jawaban agent yang mudah dibaca: teks biasa, blok kode dengan tombol Salin, dan unduhan .md. */
import { useState } from "react";
import { splitBlocks } from "../lib/blocks";

export function ResultText({ text, filename = "jawaban-agent.md" }: { text: string; filename?: string }) {
  const parts = splitBlocks(text);
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: filename });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="result">
      {parts.map((p, i) => p.kind === "text"
        ? <p key={i} className="result-text">{p.text}</p>
        : <CodeBlock key={i} lang={p.lang} code={p.code} />)}
      <div className="result-actions"><button type="button" className="btn btn-sm" onClick={download}>Unduh .md</button></div>
    </div>
  );
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const path = code.split("\n")[0].match(/^\s*(?:\/\/|#)\s*([\w./-]+\.\w+)\s*$/)?.[1];
  return (
    <div className="result-code">
      <div className="result-code-head">
        <span className="xs muted">{path ?? (lang || "kode")}</span>
        <button type="button" className="btn btn-sm btn-quiet" onClick={async () => {
          try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* izin clipboard ditolak */ }
        }}>{copied ? "Tersalin" : "Salin"}</button>
      </div>
      <pre><code>{code}</code></pre>
    </div>
  );
}
