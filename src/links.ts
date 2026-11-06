/** `[[target|alias]]` ending right at the cursor. */
const TRAILING_LINK = /\[\[([^[\]|]+)\|([^[\]]*)\]\]$/;

/**
 * For the text of a line up to the cursor: if it ends with `[[target|alias]]`, where that link starts and
 * what to replace it with (`[[target]]`); otherwise null.
 */
export function trailingAliasFix(before: string): { from: number; text: string } | null {
  const m = TRAILING_LINK.exec(before);
  return m ? { from: m.index, text: `[[${m[1]}]]` } : null;
}
