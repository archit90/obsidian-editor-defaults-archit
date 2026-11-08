import momentLib from "moment";

// Minimal runtime stand-in for the `obsidian` module in unit tests. Only what the tested modules touch at
// import time or call; the plugins' UI code isn't unit-tested (it's checked in the app, see each README).
export class TAbstractFile {
  path = "";
  name = "";
  parent: TFolder | null = null;
}
export class TFolder extends TAbstractFile {
  children: TAbstractFile[] = [];
  isRoot() {
    return this.path === "/";
  }
}
export class TFile extends TAbstractFile {
  basename = "";
  extension = "md";
  stat = { ctime: 0, mtime: 0, size: 0 };
  static make(path: string): TFile {
    const f = new TFile();
    f.path = path;
    f.name = path.split("/").pop() ?? path;
    const dot = f.name.lastIndexOf(".");
    f.basename = dot > 0 ? f.name.slice(0, dot) : f.name;
    f.extension = dot > 0 ? f.name.slice(dot + 1) : "";
    return f;
  }
}
export class Plugin {}
export class PluginSettingTab {}
export class ItemView {}
export class Modal {}
export class FuzzySuggestModal<T> {
  __t?: T;
}
export class Component {}
export class MarkdownRenderer {}
export class Notice {}
export class Menu {}
export class Setting {}
export class WorkspaceLeaf {}
export class WorkspaceSplit {}
export const Keymap = { isModEvent: () => false };
export const Platform = { isMobile: false, isDesktop: true };
export function getLinkpath(linktext: string): string {
  const i = linktext.search(/[#^|]/);
  return i >= 0 ? linktext.slice(0, i) : linktext;
}
export function debounce<A extends unknown[]>(fn: (...a: A) => unknown) {
  const d = (...a: A) => void fn(...a);
  d.cancel = () => d;
  d.run = () => undefined;
  return d;
}
export function setIcon() {}
export function parseYaml(s: string): unknown {
  return JSON.parse(s);
}
export function stringifyYaml(v: unknown): string {
  return JSON.stringify(v);
}
// Obsidian re-exports moment; it's installed here as obsidian's dependency
export const moment = momentLib;
