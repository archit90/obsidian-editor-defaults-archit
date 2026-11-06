// Date / Date & time properties shown as ISO text instead of the browser's locale-formatted date picker.
//
// Obsidian 1.15.0 renders these property types with a native <input type="date"> / <input type="datetime-local">
// (app.js: the "date" / "datetime" entries of metadataTypeManager.registeredTypeWidgets, widget classes with
// `inputEl`, parse via moment(value, ["YYYY-MM-DD"]) / ["YYYY-MM-DD[T]HH:mm:ss"], commit on blur / Enter). The
// browser draws such inputs in the OS locale (en-US: mm/dd/yyyy), whatever is stored. Turning the input into a
// text field keeps Obsidian's own parsing and saving and shows the stored ISO value; a calendar button next to
// it still opens the native picker (a hidden date input) for choosing a date with the mouse or on touch.

import { moment, setIcon } from "obsidian";

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

/** Make a rendered date / datetime property widget an ISO text field with a calendar button. */
/** The parts of Obsidian's date / datetime property widget used here (app.js r5 and subclasses). */
export interface DateWidget {
  inputEl?: HTMLInputElement;
  parse?(text: string): void;
  setValue?(value: string): void;
}

export function isoifyWidget(type: IsoType, widget: DateWidget | undefined, el: HTMLElement) {
  const input = widget?.inputEl;
  if (!widget || !input || input.dataset.isoDate) return;
  input.dataset.isoDate = "1";
  // the browser's datetime-local value leaves out zero seconds: put them back before it becomes text
  if (type === "datetime" && /T\d{2}:\d{2}$/.test(input.value)) input.value += ":00";
  input.type = "text";
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
    // Shown and typed as `YYYY-MM-DD HH:mm:ss`; Obsidian still parses ISO and saves `YYYY-MM-DDTHH:mm:ss` (what
    // Dataview, Bases and Obsidian itself expect), so the "T" only disappears from the field.
    input.value = shownDateTime(input.value);
    const setValue = widget.setValue?.bind(widget);
    if (setValue)
      widget.setValue = (value: string) => {
        setValue(value);
        input.value = shownDateTime(input.value);
      };
  }
  input.placeholder = ISO_FIELDS[type].placeholder;
  input.spellcheck = false;
  // no inputmode="numeric": phone number pads have no "-" or ":"

  const button = el.createDiv({
    cls: "clickable-icon iso-date-picker",
    attr: { "aria-label": "Pick a date", role: "button", tabindex: "0" },
  });
  setIcon(button, "calendar");
  const picker = el.createEl("input", {
    cls: "iso-date-hidden-picker",
    // step 1: the date & time picker offers seconds too
    attr: { type: ISO_FIELDS[type].picker, step: "1", tabindex: "-1", "aria-hidden": "true" },
  });
  // rendered but invisible: showPicker() needs a rendered input, and opens next to it
  picker.setCssStyles({ position: "absolute", width: "1px", height: "1px", opacity: "0", pointerEvents: "none" });
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
