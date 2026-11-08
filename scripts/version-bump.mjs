// `npm run release` (= `npm version patch`) runs this through package.json's "version" script, after npm has bumped
// package.json: it copies the new version into manifest.json and adds it to versions.json with the manifest's
// minAppVersion. npm then commits and tags it (tag = the version, no "v": .npmrc). `git push --follow-tags` and the
// release workflow (.github/workflows/release.yml) publish the release BRAT installs from.
//
// Releases change the patch version only (0.1.0 → 0.1.1 → 0.1.2 …): the minor and major versions stay as they are.
// A new minor or major version is a deliberate decision: ALLOW_MINOR_BUMP=1 npm version minor. Without it, this
// refuses, and puts package.json and package-lock.json back to the current version.
import { readFileSync, writeFileSync } from "node:fs";

const version = process.env.npm_package_version;
if (!version) throw new Error("run through npm version (npm run release)");
const readJson = f => JSON.parse(readFileSync(f, "utf8"));
const writeJson = (f, v) => writeFileSync(f, JSON.stringify(v, null, 2) + "\n");
const manifest = readJson("manifest.json");
const [oldMajor, oldMinor] = manifest.version.split(".");
const [major, minor] = version.split(".");

if ((major !== oldMajor || minor !== oldMinor) && process.env.ALLOW_MINOR_BUMP !== "1") {
  const pkg = readJson("package.json");
  pkg.version = manifest.version;
  writeJson("package.json", pkg);
  const lock = readJson("package-lock.json");
  lock.version = manifest.version;
  if (lock.packages?.[""]) lock.packages[""].version = manifest.version;
  writeJson("package-lock.json", lock);
  console.error(
    `version ${version} refused: releases bump the patch version only (${manifest.version} → ${oldMajor}.${oldMinor}.x, ` +
      "npm run release). For a new minor or major version: ALLOW_MINOR_BUMP=1 npm version minor|major",
  );
  process.exit(1);
}

manifest.version = version;
writeJson("manifest.json", manifest);
const versions = readJson("versions.json");
versions[version] = manifest.minAppVersion;
writeJson("versions.json", versions);
