// Bumps the patch version in package.json and src-tauri/tauri.conf.json so the
// Tauri updater (which compares semver) sees each push to main as a new release.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const pkgPath = path.join(ROOT, "package.json");
const confPath = path.join(ROOT, "src-tauri", "tauri.conf.json");

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const [major, minor, patch] = pkg.version.split(".").map(Number);
const next = `${major}.${minor}.${patch + 1}`;

pkg.version = next;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

const conf = JSON.parse(fs.readFileSync(confPath, "utf8"));
conf.version = next;
fs.writeFileSync(confPath, JSON.stringify(conf, null, 2) + "\n");

console.log(next);
