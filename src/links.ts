/** `[[target|alias]]` ending right at the cursor. */
const TRAILING_LINK = /\[\[([^[\]|]+)\|([^[\]]*)\]\]$/;

/**
 * For the text of a line up to the cursor: if it ends with `[[target|alias]]`, where that link starts and
 * what to replace it with (`[[target]]`); otherwise null. With `only`, the alias must be exactly that text
 * (the note name Obsidian adds itself), so an alias the user wrote is never removed.
 */
export function trailingAliasFix(before: string, only?: string): { from: number; text: string } | null {
  const m = TRAILING_LINK.exec(before);
  if (!m || (only !== undefined && m[2] !== only)) return null;
  return { from: m.index, text: `[[${m[1]}]]` };
}
