// JSON values as the settings note and Obsidian's config files hold them, and the three operations the vault setup
// needs: merge the note's values into a file, find where a file differs from the note, and take changed values
// from a file into the note. Pure, no Obsidian imports.

export type Json = null | boolean | number | string | Json[] | JsonObject;
export interface JsonObject {
  [key: string]: Json;
}

export function isObject(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * A value read from outside (YAML, JSON, a plugin's settings object) as Json, or undefined if it isn't one. Parts
 * that aren't JSON (functions, class instances' methods) are left out; a part that refers back to itself (a
 * plugin's settings holding the plugin) is left out too.
 */
export function toJson(v: unknown, seen: WeakSet<object> = new WeakSet()): Json | undefined {
  if (v === null || typeof v === "boolean" || typeof v === "string") return v;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v !== "object") return undefined;
  if (seen.has(v)) return undefined;
  seen.add(v);
  try {
    if (Array.isArray(v)) {
      const out: Json[] = [];
      for (const x of v) {
        const j = toJson(x, seen);
        if (j === undefined) return undefined;
        out.push(j);
      }
      return out;
    }
    const proto: unknown = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) return undefined; // a Map, a class instance: not settings
    const out: JsonObject = {};
    for (const [k, x] of Object.entries(v)) {
      const j = toJson(x, seen);
      if (j !== undefined) out[k] = j;
    }
    return out;
  } finally {
    seen.delete(v);
  }
}

/** Deep equality of two JSON values (key order doesn't matter). */
export function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => equal(x, b[i]));
  }
  if (isObject(a) && isObject(b)) {
    const ka = Object.keys(a);
    if (ka.length !== Object.keys(b).length) return false;
    return ka.every(k => Object.hasOwn(b, k) && equal(a[k], b[k]));
  }
  return false;
}

/**
 * `base` with `values` merged in: objects merge key by key (recursively), a list or a plain value replaces. Keys of
 * `base` that `values` doesn't mention stay as they are. Neither argument is changed.
 */
export function merged(base: unknown, values: JsonObject): JsonObject {
  const out: JsonObject = isObject(base) ? { ...base } : {};
  for (const [k, v] of Object.entries(values)) {
    const now = out[k];
    out[k] = isObject(v) && isObject(now) ? merged(now, v) : clone(v);
  }
  return out;
}

export function clone<T extends Json>(v: T): T {
  // JSON values only: structuredClone keeps the type
  return structuredClone(v);
}

/** The paths ("a", "a.b") where `actual` doesn't hold what `values` says. Objects are compared key by key. */
export function differences(values: JsonObject, actual: unknown, prefix = ""): string[] {
  const out: string[] = [];
  const have = isObject(actual) ? actual : {};
  for (const [k, v] of Object.entries(values)) {
    const path = prefix ? `${prefix}.${k}` : k;
    const now = have[k];
    if (isObject(v) && isObject(now)) out.push(...differences(v, now, path));
    else if (!equal(v, now)) out.push(path);
  }
  return out;
}

/** What `capture` changed in the note's values. */
export interface Captured {
  values: JsonObject;
  /** Paths the note now holds that it didn't. */
  added: string[];
  /** Paths whose value in the note changed. */
  changed: string[];
  /** Paths taken out of the note: set back to their default. */
  removed: string[];
}

/** Defaults to compare with: an object of default values, or a function that gives a path's default (or undefined). */
export type Defaults = JsonObject | ((path: string) => Json | undefined);

function defaultAt(defaults: Defaults | undefined, path: string): Json | undefined {
  if (!defaults) return undefined;
  if (typeof defaults === "function") return defaults(path);
  let v: Json | undefined = defaults;
  for (const k of path.split(".")) v = isObject(v) ? v[k] : undefined;
  return v;
}

/**
 * The note's `values` after a file changed from `before` to `after`. The note holds only what differs from the
 * defaults, so:
 * - a top-level key whose value changed is taken into the note, unless it now equals its default (`defaults`),
 *   in which case it's taken out of the note;
 * - where the note holds an object for a key and the file too, only the parts that changed are taken;
 * - a key removed from the file (set back to its default: a hotkey restored, a property type unset) is taken out
 *   of the note.
 * `ignore` lists top-level keys never taken.
 */
export function capture(
  values: JsonObject,
  before: unknown,
  after: unknown,
  { ignore = [], defaults }: { ignore?: readonly string[]; defaults?: Defaults } = {},
  prefix = "",
): Captured {
  const out: JsonObject = { ...values };
  const result: Captured = { values: out, added: [], changed: [], removed: [] };
  const was = isObject(before) ? before : {};
  const now = isObject(after) ? after : {};
  for (const [k, v] of Object.entries(now)) {
    if (!prefix && ignore.includes(k)) continue;
    if (Object.hasOwn(was, k) && equal(was[k], v)) continue;
    const path = prefix ? `${prefix}.${k}` : k;
    const mine = values[k];
    const dflt = defaultAt(defaults, path);
    if (isObject(mine) && isObject(v)) {
      const inner = capture(mine, was[k], v, { defaults }, path);
      if (Object.keys(inner.values).length) out[k] = inner.values;
      else delete out[k];
      result.added.push(...inner.added);
      result.changed.push(...inner.changed);
      result.removed.push(...inner.removed);
    } else if (dflt !== undefined && equal(dflt, v)) {
      if (mine !== undefined) {
        delete out[k];
        result.removed.push(path);
      }
    } else if (mine === undefined) {
      out[k] = clone(v);
      result.added.push(path);
    } else if (!equal(mine, v)) {
      out[k] = clone(v);
      result.changed.push(path);
    }
  }
  for (const k of Object.keys(was)) {
    if (Object.hasOwn(now, k) || (!prefix && ignore.includes(k)) || values[k] === undefined) continue;
    delete out[k];
    result.removed.push(prefix ? `${prefix}.${k}` : k);
  }
  return result;
}

/** `values` without what equals its default: what a note made from a vault holds. */
export function withoutDefaults(values: JsonObject, defaults: Defaults, prefix = ""): JsonObject {
  const out: JsonObject = {};
  for (const [k, v] of Object.entries(values)) {
    const path = prefix ? `${prefix}.${k}` : k;
    const d = defaultAt(defaults, path);
    if (d !== undefined && equal(d, v)) continue;
    if (isObject(v) && isObject(d)) {
      const inner = withoutDefaults(v, defaults, path);
      if (Object.keys(inner).length) out[k] = inner;
    } else out[k] = clone(v);
  }
  return out;
}
