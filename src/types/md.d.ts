// Markdown files imported by the plugin (the bundled settings note) are their text: esbuild's text loader.
declare module "*.md" {
  const text: string;
  export default text;
}
