// A small tolerant HTML reader, for the words a person reads on a page: note_check's checks on what is delivered
// (scripts/checks/delivered.ts) and the pages source_check opens (scripts/source.ts).

/** An element's attributes, by lower-case name, their entities decoded. */
export type Attrs = Record<string, string>;

/** A tag as walk reads it: its lower-case name, its attributes and where it starts. */
export interface Tag {
  name: string;
  attrs: Attrs;
  index: number;
}

/** A run of text, decoded: where it starts, and whether it is hidden or inside head, title and the like. */
export interface TextRun {
  text: string;
  index: number;
  hidden: boolean;
  skip: boolean;
}

/** A script element: its attributes, its text and where it starts. */
export interface Script {
  attrs: Attrs;
  text: string;
  index: number;
}

/** A page as walk reads it. */
export interface Walked {
  tags: Tag[];
  texts: TextRun[];
  scripts: Script[];
}

/** An element still open: whether it hides its text or keeps it out of the page's words. */
interface Open {
  name: string;
  hidden: boolean;
  skip: boolean;
}

const SKIP = new Set(["head", "title", "noscript", "template"]);
const VOID = new Set("area base br col embed hr img input link meta source track wbr".split(" "));
const ENT: Partial<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  pound: "£",
  euro: "€",
  mdash: "—",
  ndash: "–",
  times: "×",
  middot: "·",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
  star: "☆",
};
const decode = (s: string) =>
  s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) =>
    e[0] === "#"
      ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : +e.slice(1))
      : (ENT[e.toLowerCase()] ?? m),
  );
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

function parseAttrs(s: string): Attrs {
  const a: Attrs = {};
  for (const m of s.matchAll(/([^\s=/"'>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))
    a[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? "");
  return a;
}
const isHidden = (a: Attrs) => "hidden" in a || /display\s*:\s*none|visibility\s*:\s*hidden/i.test(a.style || "");

/** A small tolerant HTML reader: tags, text runs (hidden or not, and whether inside head, title and the like), scripts. */
export function walk(html: string): Walked {
  const tags: Tag[] = [],
    texts: TextRun[] = [],
    scripts: Script[] = [],
    stack: Open[] = [],
    low = html.toLowerCase();
  const re = /<!--[\s\S]*?-->|<![^>]*>|<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
  let last = 0,
    m: RegExpExecArray | null;
  const text = (t: string, i: number) => {
    if (!t.trim()) return;
    texts.push({ text: decode(t), index: i, hidden: stack.some((s) => s.hidden), skip: stack.some((s) => s.skip) });
  };
  while ((m = re.exec(html))) {
    text(html.slice(last, m.index), last);
    last = re.lastIndex;
    if (!m[2]) continue;
    const name = m[2].toLowerCase();
    if (m[1]) {
      let i = stack.length - 1;
      while (i >= 0 && stack[i].name !== name) i--;
      if (i >= 0) stack.length = i;
      continue;
    }
    const attrs = parseAttrs(m[3]);
    tags.push({ name, attrs, index: m.index });
    if (name === "script" || name === "style") {
      const e = low.indexOf("</" + name, re.lastIndex),
        end = e < 0 ? html.length : e;
      if (name === "script") scripts.push({ attrs, text: html.slice(re.lastIndex, end), index: m.index });
      re.lastIndex = last = end;
      continue;
    }
    if (VOID.has(name) || m[3].trim().endsWith("/")) continue;
    stack.push({ name, hidden: isHidden(attrs), skip: SKIP.has(name) });
  }
  text(html.slice(last), last);
  return { tags, texts, scripts };
}

export const looksLikeHtml = (text: string): boolean =>
  /<\/?(?:html|body|div|p|span|section|form|input|label|button|h[1-6]|ul|li|table|a)\b[^>]*>/i.test(text);
/** The words a person reads: a page's text (scripts and styles left out), or the text itself when it is not a page. */
export const textOf = (text: string): string =>
  looksLikeHtml(text)
    ? norm(
        walk(text)
          .texts.filter((t) => !t.skip)
          .map((t) => t.text)
          .join(" "),
      )
    : norm(text);
/** Words copied from a page, read as text whatever tags or entities came with them ("<strong>$12.99</strong>", "&gt;"). */
export const fragmentText = (fragment: string): string =>
  norm(
    walk(String(fragment))
      .texts.map((t) => t.text)
      .join(" "),
  );
