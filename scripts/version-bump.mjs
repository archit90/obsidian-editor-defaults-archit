// `npm version patch|minor|major` runs this (package.json "version" script) after bumping package.json: it copies
// the new version into manifest.json and adds it to versions.json with the manifest's minAppVersion. npm then
// commits and tags it (tag = the version, no "v": .npmrc). `git push --follow-tags` and the release workflow
// (.github/workflows/release.yml) publishes the release BRAT installs from.
import { readFileSync, writeFileSync } from "node:fs";

const version = process.env.npm_package_version;
if (!version) throw new Error("run through npm version");
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
manifest.version = version;
writeFileSync("manifest.json", JSON.stringify(manifest, null, 2) + "\n");
const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[version] = manifest.minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, 2) + "\n");
