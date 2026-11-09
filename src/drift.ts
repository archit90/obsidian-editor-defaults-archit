/**
 * Stops putting one default back when something keeps changing it again (another plugin, or another device with a
 * different version of Editor Defaults or different settings, would otherwise fight it forever). Per item:
 * - at most `max` put-backs within `windowMs`; then it's left alone until that window has passed (`retryAt` says
 *   when), so a fast fight pauses;
 * - more than `longMax` put-backs within `longWindowMs` stop it for the session (`takeStopped` reports it once), so
 *   a slow fight through sync stops too.
 * A person changing it by hand now and then is always undone.
 */
export class DriftGuard {
  private times = new Map<string, number[]>();
  private warned = new Set<string>();
  private stopped = new Set<string>();
  private newlyStopped: string[] = [];

  constructor(
    private readonly max = 5,
    private readonly windowMs = 10_000,
    private readonly longMax = 10,
    private readonly longWindowMs = 600_000,
  ) {}

  /** Whether item `id` may be put back again at `now`. */
  allow(id: string, now: number): boolean {
    if (this.stopped.has(id)) return false;
    const times = (this.times.get(id) ?? []).filter(t => now - t < this.longWindowMs);
    this.times.set(id, times);
    if (times.length >= this.longMax) {
      this.stopped.add(id);
      this.newlyStopped.push(id);
      console.warn(`[editor-defaults] ${id} keeps being changed back; not enforcing it again this session`);
      return false;
    }
    if (times.filter(t => now - t < this.windowMs).length < this.max) return true;
    if (!this.warned.has(id)) {
      this.warned.add(id);
      console.warn(`[editor-defaults] ${id} keeps changing back; not enforcing it again for now`);
    }
    return false;
  }

  /** When item `id`, refused at `now`, may be put back again; null when it isn't waiting (or is stopped). */
  retryAt(id: string, now: number): number | null {
    if (this.stopped.has(id)) return null;
    const recent = (this.times.get(id) ?? []).filter(t => now - t < this.windowMs);
    return recent.length < this.max ? null : recent[recent.length - this.max] + this.windowMs;
  }

  record(id: string, now: number) {
    this.times.set(id, [...(this.times.get(id) ?? []), now]);
  }

  /** The items stopped for the session since the last call. */
  takeStopped(): string[] {
    const out = this.newlyStopped;
    this.newlyStopped = [];
    return out;
  }
}
