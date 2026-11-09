// The settings note as text: its fenced `vault-settings` blocks, and the edits the vault setup makes to it (a
// block's YAML replaced, a dated line after a block, a new section at the end). Everything outside the blocks (the
// prose that says why) is never changed. Pure.

export const FENCE_LANG = "vault-settings";

/** One fenced block: where its YAML is in the note, and the heading above it. */
export interface NoteBlock {
  /** Offset of the first character of the YAML (the line after the opening fence). */
  from: number;
  /** Offset just after the YAML (the start of the closing fence's line). */
  to: number;
  /** Offset just after the closing fence's line (its newline included, if any). */
  end: number;
  yaml: string;
  /** The nearest heading above the block, without its #s; "" when there is none. */
  heading: string;
  /** The block's 1-based line number in the note (its opening fence), for messages. */
  line: number;
}

const OPEN = /^(`{3,}|~{3,})[ \t]*vault-settings[ \t]*$/;
const HEADING = /^#{1,6}[ \t]+(.+?)[ \t#]*$/;

/** The note's vault-settings blocks, in order. An unclosed block runs to the end of the note. */
export function findBlocks(text: string): NoteBlock[] {
  const out: NoteBlock[] = [];
  const lines = text.split("\n");
  let offset = 0;
  let heading = "";
  let open: { fence: string; from: number; line: number; heading: string } | null = null;
  let otherFence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, "");
    const next = offset + lines[i].length + (i < lines.length - 1 ? 1 : 0);
    if (open) {
      if (line.trim().startsWith(open.fence) && line.trim() === open.fence[0].repeat(line.trim().length)) {
        out.push({
          from: open.from,
          to: offset,
          end: next,
          yaml: text.slice(open.from, offset),
          heading: open.heading,
          line: open.line,
        });
        open = null;
      }
    } else if (otherFence) {
      if (line.trim().startsWith(otherFence) && /^(`+|~+)$/.test(line.trim())) otherFence = null;
    } else {
      const m = OPEN.exec(line);
      if (m) open = { fence: m[1], from: next, line: i + 1, heading };
      else if (/^(`{3,}|~{3,})/.test(line.trim())) otherFence = /^(`{3,}|~{3,})/.exec(line.trim())?.[1] ?? null;
      else {
        const h = HEADING.exec(line);
        if (h) heading = h[1];
      }
    }
    offset = next;
  }
  if (open)
    out.push({
      from: open.from,
      to: text.length,
      end: text.length,
      yaml: text.slice(open.from),
      heading: open.heading,
      line: open.line,
    });
  return out;
}

/** The note with one block's YAML replaced (it always ends with a newline). */
export function replaceBlockYaml(text: string, block: NoteBlock, yaml: string): string {
  const body = yaml.endsWith("\n") ? yaml : `${yaml}\n`;
  return text.slice(0, block.from) + body + text.slice(block.to);
}

/**
 * The note with `lines` added right after a block, as a list ("- `templates_folder` added from Settings,
 * 2026-11-09."), below any lines added there before so they read in order.
 */
export function addLinesAfter(text: string, block: NoteBlock, lines: readonly string[]): string {
  if (!lines.length) return text;
  let head = text.slice(0, block.end);
  if (!head.endsWith("\n")) head += "\n";
  const rest = text.slice(block.end);
  const add = `${lines.map(l => `- ${l}`).join("\n")}\n`;
  const log = /^\n((?:- [^\n]*(?:\n|$))+)/.exec(rest);
  if (log) {
    const before = log[1].endsWith("\n") ? log[1] : `${log[1]}\n`;
    return `${head}\n${before}${add}${rest.slice(log[0].length)}`;
  }
  return `${head}\n${add}${rest === "" || rest.startsWith("\n") ? "" : "\n"}${rest}`;
}

/** The note with a new section at its end: a `## heading`, an intro line, and a block with `yaml`. */
export function appendSection(text: string, heading: string, intro: string, yaml: string): string {
  const body = yaml.endsWith("\n") ? yaml : `${yaml}\n`;
  const sep = text.length === 0 ? "" : text.endsWith("\n\n") ? "" : text.endsWith("\n") ? "\n" : "\n\n";
  return `${text}${sep}## ${heading}\n\n${intro}\n\n\`\`\`${FENCE_LANG}\n${body}\`\`\`\n`;
}
