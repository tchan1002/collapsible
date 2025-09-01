"use client";
import { useRef, useState } from "react";

type Deletion = {
  id: string;
  n: number;        // footnote number (still useful if you want footnotes later)
  text: string;     // deleted text
  at: number;       // start index in original doc
  len: number;      // length of deleted slice
  ts: number;
  collapsed: boolean; // true = show clickable ellipsis; false = show text (expanded)
};

export default function Home() {
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  const [doc, setDoc] = useState("");
  const [cursor, setCursor] = useState(0);
  const [deletions, setDeletions] = useState<Deletion[]>([]);
  const [nextFootNo, setNextFootNo] = useState(1);

  // --- helpers ---
  function captureDeletion(text: string, atIndex: number) {
    if (!text) return;
    setDeletions((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        n: nextFootNo,
        text,
        at: Math.max(0, Math.min(atIndex, doc.length)),
        len: text.length,
        ts: Date.now(),
        collapsed: true,
      },
    ]);
    setNextFootNo((n) => n + 1);
  }

  function toggleDeletion(id: string) {
    setDeletions((prev) =>
      prev.map((d) => (d.id === id ? { ...d, collapsed: !d.collapsed } : d))
    );
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Backspace") {
      // 🚫 Do not perform real deletion
      e.preventDefault();

      const el = e.currentTarget;
      const start = el.selectionStart ?? cursor;
      const end = el.selectionEnd ?? cursor;

      // Rule: ignore single-char backspace (no selection)
      if (start === end) {
        // do nothing; single backspace is fully disabled
        return;
      }

      // If a range is selected, "collapse" the entire selection
      const selected = doc.slice(start, end);
      captureDeletion(selected, start);

      // NOTE: We do NOT mutate `doc` (write-or-die). The collapsed UI will render in preview.
      return;
    }
  }

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setDoc(e.target.value);
    setCursor(e.target.selectionStart ?? 0);
  }

  function onSelect(e: React.SyntheticEvent<HTMLTextAreaElement>) {
    const el = e.target as HTMLTextAreaElement;
    setCursor(el.selectionStart ?? 0);
  }

  // --- render preview with inline collapses ---
  // We render the original doc, but skip deleted ranges and instead insert either:
  //  - a clickable ellipsis (…) when collapsed
  //  - the original (struck-through) text when expanded
  function Preview({ text, notes }: { text: string; notes: Deletion[] }) {
    if (notes.length === 0) return <>{text}</>;

    // Sort by start index; for equal starts, longer deletions first
    const sorted = [...notes].sort((a, b) => (a.at - b.at) || (b.len - a.len));

    const children: React.ReactNode[] = [];
    let i = 0;

    for (const d of sorted) {
      const start = Math.max(0, Math.min(d.at, text.length));
      const end = Math.max(start, Math.min(d.at + d.len, text.length));

      if (start > i) {
        children.push(text.slice(i, start));
      }

      // Insert collapsed placeholder or expanded text
      if (d.collapsed) {
        children.push(
          <span
            key={d.id}
            onClick={() => toggleDeletion(d.id)}
            style={{
              cursor: "pointer",
              opacity: 0.8,
              borderBottom: "1px dotted",
              userSelect: "none",
            }}
            title={`Click to expand hidden text [^${d.n}]`}
            aria-label={`Expand deletion ${d.n}`}
          >
            …
          </span>
        );
      } else {
        children.push(
          <span
            key={d.id}
            onClick={() => toggleDeletion(d.id)}
            style={{ textDecoration: "line-through", cursor: "pointer" }}
            title={`Click to collapse text [^${d.n}]`}
            aria-label={`Collapse deletion ${d.n}`}
          >
            {text.slice(start, end)}
          </span>
        );
      }

      i = end; // advance pointer past deleted slice
    }

    // Remainder of text
    if (i < text.length) {
      children.push(text.slice(i));
    }

    return <>{children}</>;
  }

  const sortedNotes = [...deletions].sort((a, b) => a.n - b.n);

  // --- export to Markdown helpers ---
  function generateMarkdownBody(text: string, notes: Deletion[]): string {
    if (notes.length === 0) return text;
    const sorted = [...notes].sort((a, b) => (a.at - b.at) || (b.len - a.len));
    let i = 0;
    const parts: string[] = [];
    for (const d of sorted) {
      const start = Math.max(0, Math.min(d.at, text.length));
      const end = Math.max(start, Math.min(d.at + d.len, text.length));
      if (start > i) parts.push(text.slice(i, start));
      if (d.collapsed) {
        parts.push("[ … ]");
      } else {
        parts.push(`~~${text.slice(start, end)}~~`);
      }
      i = end;
    }
    if (i < text.length) parts.push(text.slice(i));
    return parts.join("");
  }

  function generateFootnotes(notes: Deletion[]): string {
    if (notes.length === 0) return "";
    const sorted = [...notes].sort((a, b) => a.n - b.n);
    return sorted.map((d) => `[^${d.n}]: ~~${d.text}~~`).join("\n");
  }

  function buildMarkdown(): string {
    const body = generateMarkdownBody(doc, deletions);
    const foot = generateFootnotes(deletions);
    if (foot) {
      return `${body}\n\n## Footnotes\n${foot}\n`;
    }
    return body;
  }

  function onDownloadMd() {
    const md = buildMarkdown();
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "draft.md";
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Give the browser a tick to start the download before revoking
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <main style={{ padding: "2rem", display: "grid", gap: "1.25rem", maxWidth: 900, margin: "0 auto" }}>
      <h1>📝 Collapsible — in-place ellipses (click to expand)</h1>

      <label style={{ fontWeight: 600 }}>Editor</label>
      <textarea
        ref={taRef}
        value={doc}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onSelect={onSelect}
        placeholder="Type, select a range, press Backspace → it collapses into a clickable ellipsis."
        style={{
          width: "100%",
          height: 240,
          padding: "12px",
          borderRadius: 12,
          border: "1px solid #444",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          lineHeight: 1.5,
        }}
      />

      <div>
        <label style={{ fontWeight: 600, display: "block", marginBottom: 8 }}>
          Preview (select + backspace → … , click … to expand / collapse)
        </label>
        <div
          style={{
            whiteSpace: "pre-wrap",
            wordWrap: "break-word",
            border: "1px solid #333",
            borderRadius: 12,
            padding: 12,
            background: "var(--preview-bg, #0b0b0b)",
            fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
            minHeight: 120,
          }}
        >
          <Preview text={doc} notes={deletions} />
        </div>
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={onDownloadMd}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #444",
              background: "#111",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Download .md
          </button>
        </div>
      </div>

      <div>
        <label style={{ fontWeight: 600, display: "block", marginBottom: 8 }}>
          Collapsed items (log)
        </label>
        {sortedNotes.length === 0 ? (
          <div style={{ opacity: 0.7 }}>No collapsed items yet.</div>
        ) : (
          <ol style={{ paddingLeft: "1.25rem", display: "grid", gap: 6 }}>
            {sortedNotes.map((d) => (
              <li key={d.id}>
                <code>[^{d.n}]</code>{" "}
                <span style={{ opacity: 0.7 }}>@{d.at}–{d.at + d.len}</span>{" "}
                <em style={{ opacity: 0.8 }}>
                  {d.collapsed ? "(collapsed)" : "(expanded)"}
                </em>
              </li>
            ))}
          </ol>
        )}
      </div>
    </main>
  );
}
