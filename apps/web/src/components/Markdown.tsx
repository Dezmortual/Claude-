// A small, safe subset of markdown for the assistant's answers: paragraphs, headings, lists, bold, inline code and
// links (web addresses and the app's own paths only). Text is never injected as HTML.
import Link from "next/link";
import type { ReactNode } from "react";

function inline(s: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;
  let at = 0, m: RegExpExecArray | null, k = 0;
  while ((m = re.exec(s))) {
    if (m.index > at) out.push(s.slice(at, m.index));
    if (m[1]) {
      const href = m[2];
      if (/^\/(?!\/)[\w\-/?=&#.%]*$/.test(href)) out.push(<Link key={`${key}-${k++}`} href={href} className="font-semibold text-accent underline">{m[1]}</Link>);
      else if (/^https?:\/\//.test(href)) out.push(<a key={`${key}-${k++}`} href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-accent underline">{m[1]}</a>);
      else out.push(m[1]);
    } else if (m[3]) out.push(<strong key={`${key}-${k++}`}>{m[3]}</strong>);
    else if (m[4]) out.push(<code key={`${key}-${k++}`} className="rounded-sm bg-surface-sunken px-1 font-mono text-xs">{m[4]}</code>);
    at = re.lastIndex;
  }
  if (at < s.length) out.push(s.slice(at));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const blocks = text.replace(/\r/g, "").split(/\n{2,}/);
  return (
    <div className="grid gap-3 text-sm leading-relaxed">
      {blocks.map((b, i) => {
        const lines = b.split("\n").filter((l) => l.trim());
        if (!lines.length) return null;
        const h = lines[0].match(/^#{1,4}\s+(.*)$/);
        if (h && lines.length === 1) return <p key={i} className="font-semibold text-fg">{inline(h[1], `h${i}`)}</p>;
        if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) return <ul key={i} className="grid list-disc gap-1 pl-5">{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*[-*•]\s+/, ""), `${i}-${j}`)}</li>)}</ul>;
        if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) return <ol key={i} className="grid list-decimal gap-1 pl-5">{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*\d+[.)]\s+/, ""), `${i}-${j}`)}</li>)}</ol>;
        return <p key={i}>{lines.map((l, j) => <span key={j}>{j > 0 && <br />}{inline(l.replace(/^#{1,4}\s+/, ""), `${i}-${j}`)}</span>)}</p>;
      })}
    </div>
  );
}
