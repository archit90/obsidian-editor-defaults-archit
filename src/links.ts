/** A `[[path#subpath|alias]]` wikilink in a line of text. */
export interface WikiLink {
  from: number; // offset of the opening `[[`
  to: number; // offset just after the closing `]]`
  path: string; // the note part of the target (`z/Note`)
  subpath: string; // `#Heading`, `#^block` or ""
  alias?: string; // the text after `|`, if any
}

const WIKILINK = /\[\[([^[\]|]*)(?:\|([^[\]]*))?\]\]/g;

/**
 * Whether a suggestion was opened by `[[` or `![[`: the text just before where its query starts (the suggester's
 * `context.start`) ends with `[[`. Picks from other suggesters (tags, slash commands, other plugins') aren't touched.
 */
export function isLinkTrigger(textBeforeQuery: string): boolean {
  return textBeforeQuery.endsWith("[[");
}

/** The wikilink in `line` around offset `ch` (strictly after its `[[`, up to just after its `]]`), or null. */
export function linkAt(line: string, ch: number): WikiLink | null {
  for (const m of line.matchAll(WIKILINK)) {
    const from = m.index;
    const to = from + m[0].length;
    if (ch <= from || ch > to) continue;
    const target = m[1] ?? "";
    const hash = target.indexOf("#");
    return {
      from,
      to,
      path: hash < 0 ? target : target.slice(0, hash),
      subpath: hash < 0 ? "" : target.slice(hash),
      alias: m[2],
    };
  }
  return null;
}

/** What to change in a link just picked from a `[[` dropdown. */
export interface PickFix {
  /** Remove the alias if it is exactly this text (the note name Obsidian adds itself); a typed alias stays. */
  dropAlias?: string;
  /** Replace the note part of the target with this (the path from the vault root). */
  path?: string;
}

/**
 * Rewrites the wikilink around the cursor (`ch`) in `line` as `fix` says. Returns the range to replace, the new
 * link text and where the cursor goes (at the same place relative to the link's parts: after the `#` if it was
 * after the `#`, after the `]]` if it was after the `]]`), or null when nothing changes.
 *
 * Obsidian leaves the cursor in different places depending on how the suggestion was taken: after `]]` (Enter,
 * click), before `]]` (Tab) or after the `#` / `^` it adds (typing `#` or `^` with a note selected).
 */
export function fixPickedLink(
  line: string,
  ch: number,
  fix: PickFix,
): { from: number; to: number; text: string; ch: number } | null {
  const l = linkAt(line, ch);
  if (!l) return null;
  const alias = fix.dropAlias !== undefined && l.alias === fix.dropAlias ? undefined : l.alias;
  const path = fix.path ?? l.path;
  if (alias === l.alias && path === l.path) return null;
  const text = `[[${path}${l.subpath}${alias !== undefined ? `|${alias}` : ""}]]`;

  // old and new offsets (from the link start) of the end of the path, of the target and of the alias
  const oldPathEnd = 2 + l.path.length;
  const oldTargetEnd = oldPathEnd + l.subpath.length;
  const oldAliasEnd = oldTargetEnd + (l.alias !== undefined ? 1 + l.alias.length : 0);
  const newPathEnd = 2 + path.length;
  const newTargetEnd = newPathEnd + l.subpath.length;
  const newAliasEnd = newTargetEnd + (alias !== undefined ? 1 + alias.length : 0);
  const off = ch - l.from;
  let at: number;
  if (off <= oldPathEnd) at = off === oldPathEnd ? newPathEnd : Math.min(off, newPathEnd);
  else if (off <= oldTargetEnd) at = off - oldPathEnd + newPathEnd;
  else if (off <= oldAliasEnd) at = alias !== undefined ? off - oldTargetEnd + newTargetEnd : newTargetEnd;
  else at = off - oldAliasEnd + newAliasEnd; // in or after the closing ]]
  return { from: l.from, to: l.to, text, ch: l.from + at };
}
