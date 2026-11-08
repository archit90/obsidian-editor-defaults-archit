// Date / Date & time properties shown as ISO text instead of the browser's locale-formatted date picker.
//
// Obsidian 1.15.0 renders these property types with a native <input type="date"> / <input type="datetime-local">
// (the "date" / "datetime" entries of metadataTypeManager.registeredTypeWidgets: widget objects with `inputEl`,
// parse via moment(value, ["YYYY-MM-DD"]) / ["YYYY-MM-DD[T]HH:mm:ss"], commit on blur / Enter). The browser draws
// such inputs in the OS locale (en-US: mm/dd/yyyy), whatever is stored. Turning the input into a text field keeps
// Obsidian's own parsing and saving and shows the stored ISO value; a calendar button next to it still opens the
// native picker (a hidden date input, styles.css) for choosing a date with the mouse or on touch.

import { moment, Notice, setIcon } from "obsidian";

/** What the field shows and accepts, per property type. */
export const ISO_FIELDS = {
  date: { placeholder: "YYYY-MM-DD", picker: "date" },
  datetime: { placeholder: "YYYY-MM-DD HH:mm:ss", picker: "datetime-local" },
} as const;
export type IsoType = keyof typeof ISO_FIELDS;

/** The text a value picked in the native picker becomes: `YYYY-MM-DD`, or `YYYY-MM-DD HH:mm:ss` (always with seconds). */
export function pickedText(type: IsoType, picked: string): string {
  if (type === "date") return picked.slice(0, 10);
  const t = picked.slice(0, 19);
  return shownDateTime(t.length === 16 ? `${t}:00` : t);
}

/** A date & time as shown in the field: a space instead of the ISO "T" (`YYYY-MM-DD HH:mm:ss`). */
export function shownDateTime(value: string): string {
  return value.replace(/^(\d{4}-\d{2}-\d{2})T/, "$1 ");
}

/** A date & time typed in the field, back in the ISO form Obsidian's widget parses (`YYYY-MM-DDTHH:mm:ss`). */
export function isoDateTime(text: string): string {
  return text.trim().replace(/^(\d{4}-\d{2}-\d{2})\s+(?=\d)/, "$1T");
}

/** The picker's value for the text in the field, or "" if it isn't a (partial) ISO date the picker takes. */
export function pickerValue(type: IsoType, text: string): string {
  const t = text.trim();
  if (type === "date") return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : "";
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?))?/.exec(t);
  if (!m) return "";
  const time = m[2] ?? "00:00:00";
  return `${m[1]}T${time.length === 5 ? `${time}:00` : time}`;
}

/**
 * Whether text typed in the field is a complete ISO value. Obsidian's own parse is lenient (moment without
 * strict mode reads `06/11/2026` as 2006-11-20 and `2026` as 2026-01-01), so anything else is refused.
 */
export function isIsoText(type: IsoType, text: string): boolean {
  const t = text.trim();
  if (t === "") return true; // clearing the field
  if (type === "date") return moment(t, "YYYY-MM-DD", true).isValid();
  return moment(isoDateTime(t), ["YYYY-MM-DD[T]HH:mm:ss", "YYYY-MM-DD[T]HH:mm", "YYYY-MM-DD"], true).isValid();
}

/**
 * What a valid field shows once its value is saved: the date, or the date & time with a space and seconds
 * (`2026-11-07T10:00` -> `2026-11-07 10:00:00`), so the field matches what the note now holds. Anything that
 * isn't a complete ISO value comes back unchanged.
 */
export function canonicalText(type: IsoType, text: string): string {
  const t = text.trim();
  if (t === "" || !isIsoText(type, t)) return text;
  if (type === "date") return t;
  const m = moment(isoDateTime(t), ["YYYY-MM-DD[T]HH:mm:ss", "YYYY-MM-DD[T]HH:mm", "YYYY-MM-DD"], true);
  return m.format("YYYY-MM-DD HH:mm:ss");
}

/**
 * The notice shown when a field is left with text that isn't a date: what was typed, the format, and the value
 * the field went back to.
 */
export function invalidDateNotice(type: IsoType, typed: string, stored: string): string {
  const back =
    stored.trim() === "" ? "empty" : `"${type === "datetime" ? canonicalText(type, shownDateTime(stored)) : stored}"`;
  return `"${typed.trim()}" isn't a valid ${type === "datetime" ? "date & time" : "date"} (use ${
    ISO_FIELDS[type].placeholder
  }), so it wasn't saved. The field is back to ${back}.`;
}

/** The parts of Obsidian's date / datetime property widget used here. */
export interface DateWidget {
  inputEl: HTMLInputElement;
  /** The stored value (what the note holds). */
  value?: string;
  parse?(text: string): void;
  setValue?(value: string): void;
}

/** An <input> element, from any window: one in a popout or a Canvas card's frame isn't this window's HTMLInputElement. */
function isInput(x: unknown): x is HTMLInputElement {
  return typeof x === "object" && x !== null && "tagName" in x && x.tagName === "INPUT";
}

/** Whether what a date widget's render returned is the widget this module knows (it has its input element). */
export function isDateWidget(w: unknown): w is DateWidget {
  return typeof w === "object" && w !== null && "inputEl" in w && isInput(w.inputEl);
}

/** Make a rendered date / datetime property widget an ISO text field with a calendar button. */
export function isoifyWidget(type: IsoType, rendered: unknown, el: HTMLElement) {
  if (!isDateWidget(rendered)) return;
  const widget = rendered;
  const input = widget.inputEl;
  if (input.dataset.isoDate) return;
  input.dataset.isoDate = "1";
  // Date & times are shown and typed as `YYYY-MM-DD HH:mm:ss`; Obsidian still parses ISO and saves
  // `YYYY-MM-DDTHH:mm:ss` (what Dataview, Bases and Obsidian itself expect), so the "T" only disappears from the
  // field. The browser's datetime-local value leaves out zero seconds (`…T09:30` for `…T09:30:00`), and adding
  // them back while the input is still datetime-local is undone at once by the browser: they are added to the text.
  const shown = (v: string) => (type === "datetime" ? canonicalText(type, shownDateTime(v)) : v);
  const value = input.value;
  input.type = "text";
  input.value = shown(value);
  const parse = widget.parse?.bind(widget);
  if (parse)
    widget.parse = (text: string) => {
      const ok = isIsoText(type, text);
      // a value that isn't ISO is handed to Obsidian as something it can't parse, so it isn't saved
      input.toggleClass("is-invalid", !ok);
      input.setAttr("aria-invalid", ok ? "false" : "true");
      input.style.outline = ok ? "" : "1px solid var(--text-error)";
      input.title = ok ? "" : `Use ${ISO_FIELDS[type].placeholder}`;
      parse(ok ? (type === "datetime" ? isoDateTime(text) : text) : "not a date");
    };
  if (type === "datetime") {
    const setValue = widget.setValue?.bind(widget);
    if (setValue)
      widget.setValue = (value: string) => {
        setValue(value);
        input.value = shown(input.value);
      };
  }
  // Obsidian saves on blur (its listener was added first, so it has run): show the value as it is now stored.
  // Text that isn't a date wasn't saved: the field goes back to the stored value, with a notice saying so.
  input.addEventListener("blur", () => {
    if (input.getAttr("aria-invalid") === "true") {
      const typed = input.value;
      const stored = widget.value ?? "";
      if (widget.setValue) widget.setValue(stored);
      else {
        input.value = shown(stored);
        widget.parse?.(input.value);
      }
      new Notice(invalidDateNotice(type, typed, stored));
      return;
    }
    const text = canonicalText(type, input.value);
    if (text !== input.value) input.value = text;
  });
  input.placeholder = ISO_FIELDS[type].placeholder;
  input.spellcheck = false;
  // no inputmode="numeric": phone number pads have no "-" or ":"

  const button = el.createDiv({
    cls: "clickable-icon iso-date-picker",
    attr: { "aria-label": "Pick a date", role: "button", tabindex: "0" },
  });
  setIcon(button, "calendar");
  // rendered but invisible (styles.css): showPicker() needs a rendered input, and opens next to it, so the field's
  // container is its positioned parent
  const picker = el.createEl("input", {
    cls: "iso-date-hidden-picker",
    // step 1: the date & time picker offers seconds too
    attr: { type: ISO_FIELDS[type].picker, step: "1", tabindex: "-1", "aria-hidden": "true" },
  });
  el.addClass("iso-date-host");
  button.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      button.click();
    }
  });
  button.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();
    picker.value = pickerValue(type, input.value);
    try {
      picker.showPicker();
    } catch {
      picker.focus();
      picker.click();
    }
  });
  picker.addEventListener("change", () => {
    if (!picker.value) return;
    input.value = pickedText(type, picker.value);
    // Obsidian's widget parses on "input" and saves on "blur"
    input.dispatchEvent(new Event("input"));
    input.dispatchEvent(new Event("blur"));
  });
}
