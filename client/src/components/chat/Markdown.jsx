// Streaming-safe markdown for assistant replies. Emits React elements only —
// never HTML strings — so it is XSS-proof by construction and needs no
// sanitizer dependency. While a reply is still streaming, half-finished
// constructs stay stable: an unmatched **/` marker is swallowed until its pair
// arrives, and an open ``` fence renders immediately as a code block that only
// ever appends (no layout jump when the closing fence lands).
// ponytail: bold / inline code / fences / lists only — upgrade to
// react-markdown if headings, tables, or links start appearing in replies.

// Inline pass: **bold** and `code`. A trailing unpaired marker is hidden.
const renderInline = (text, keyPrefix) => {
  const out = [];
  let rest = text;
  let k = 0;
  while (rest) {
    const m = rest.match(/(\*\*|`)/);
    if (!m) { out.push(rest); break; }
    const marker = m[1];
    const start = m.index;
    if (start > 0) out.push(rest.slice(0, start));
    const after = rest.slice(start + marker.length);
    const close = after.indexOf(marker);
    if (close === -1) {
      // Unclosed marker mid-stream: show the text, swallow the marker.
      out.push(after);
      break;
    }
    const inner = after.slice(0, close);
    out.push(marker === '**'
      ? <strong key={`${keyPrefix}-b${k}`}>{inner}</strong>
      : <code key={`${keyPrefix}-c${k}`} dir="ltr" className="rounded bg-navy-100/70 dark:bg-white/10 px-1 py-0.5 font-mono text-[0.85em]">{inner}</code>);
    k += 1;
    rest = after.slice(close + marker.length);
  }
  return out;
};

export default function Markdown({ text }) {
  if (!text) return null;

  const blocks = [];
  const lines = String(text).split('\n');
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('```')) {
      // Fenced code: collect until the closing fence (or end of stream —
      // an open fence renders as code immediately).
      const code = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) { code.push(lines[i]); i += 1; }
      if (i < lines.length) i += 1; // skip closing fence
      blocks.push(
        <pre key={`k${key}`} dir="ltr" className="my-2 overflow-x-auto rounded-lg bg-navy-900 dark:bg-black/40 p-3 text-left text-[13px] leading-6 text-emerald-100">
          <code>{code.join('\n')}</code>
        </pre>
      );
      key += 1;
      continue;
    }

    const listMatch = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
    if (listMatch) {
      const ordered = /\d/.test(listMatch[2]);
      const items = [];
      while (i < lines.length) {
        const im = lines[i].match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
        if (!im || /\d/.test(im[2]) !== ordered) break;
        items.push(<li key={`k${key}-i${items.length}`}>{renderInline(im[3], `k${key}-i${items.length}`)}</li>);
        i += 1;
      }
      const List = ordered ? 'ol' : 'ul';
      blocks.push(
        <List key={`k${key}`} className={`my-1.5 ps-5 space-y-0.5 ${ordered ? 'list-decimal' : 'list-disc'}`}>
          {items}
        </List>
      );
      key += 1;
      continue;
    }

    if (line.trim() === '') { i += 1; continue; }

    // Paragraph: greedy until blank line / structural line.
    const para = [];
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].startsWith('```') && !lines[i].match(/^(\s*)([-*]|\d+\.)\s+/)) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push(<p key={`k${key}`} className="my-1 whitespace-pre-wrap">{renderInline(para.join('\n'), `k${key}`)}</p>);
    key += 1;
  }

  return <div dir="auto" data-testid="markdown">{blocks}</div>;
}
