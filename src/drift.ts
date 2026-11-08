/** The vault config keys Editor Defaults keeps (Settings → Files and links). */
export const ENFORCED_CONFIG: ReadonlySet<string> = new Set(["newLinkFormat", "attachmentFolderPath", "trashOption"]);

/**
 * Stops putting one default back when something keeps changing it again at once (another plugin or device
 * enforcing another value would otherwise fight Editor Defaults forever): at most `max` reverts of the same item
 * within `windowMs`. A person changing it by hand now and then is always undone.
 */
export class DriftGuard {
  private times = new Map<string, number[]>();
  private warned = new Set<string>();

  constructor(
    private readonly max = 5,
    private readonly windowMs = 10_000,
  ) {}

  /** Whether item `id` may be put back again at `now`. */
  allow(id: string, now: number): boolean {
    const recent = (this.times.get(id) ?? []).filter(t => now - t < this.windowMs);
    this.times.set(id, recent);
    if (recent.length < this.max) return true;
    if (!this.warned.has(id)) {
      this.warned.add(id);
      console.warn(`[editor-defaults] ${id} keeps changing back; not enforcing it again for now`);
    }
    return false;
  }

  record(id: string, now: number) {
    this.times.set(id, [...(this.times.get(id) ?? []), now]);
  }
}

/** "a", "a and b", "a, b and c" */
function list(items: string[]): string {
  return items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** The notice shown after defaults were put back: what they are now, and which settings to turn off to change them. */
export function revertNotice(whats: string[], settingNames: string[]): string {
  const names = [...new Set(settingNames)].map(n => `"${n}"`);
  return (
    `Editor Defaults (Archit) put back ${list(whats)}.\n` +
    `To change ${whats.length > 1 ? "these" : "this"}, first turn off ${list(names)} in the Editor Defaults (Archit) settings.`
  );
}
