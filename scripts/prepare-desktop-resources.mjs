// Stages everything the Tauri desktop bundle needs as plain resources:
//   src-tauri/resources/app/    <- .next/standalone + its static assets + public/
//   src-tauri/resources/node/   <- a portable Node.js binary for THIS build machine
// Runs as part of `beforeBuildCommand` on every CI matrix leg (windows/mac), so it
// reads process.platform/arch to know exactly which Node binary that runner needs.
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const NODE_VERSION = "22.20.0";

const STANDALONE = path.join(ROOT, ".next", "standalone");
const RESOURCES = path.join(ROOT, "src-tauri", "resources");
const APP_OUT = path.join(RESOURCES, "app");
const NODE_OUT_DIR = path.join(RESOURCES, "node");
const NODE_OUT_BIN = path.join(NODE_OUT_DIR, "node"); // no extension on any OS - see src-tauri/src/lib.rs

function log(msg) {
  console.log(`[prepare-desktop-resources] ${msg}`);
}

function assertExists(p, what) {
  if (!fs.existsSync(p)) throw new Error(`${what} not found at ${p} - did "next build" run first?`);
}

// ---- 1. stage the Next.js standalone app -----------------------------------
function stageApp() {
  assertExists(STANDALONE, "next build standalone output");
  fs.rmSync(APP_OUT, { recursive: true, force: true });
  fs.mkdirSync(APP_OUT, { recursive: true });
  fs.cpSync(STANDALONE, APP_OUT, { recursive: true });

  // Next.js does not include these in the standalone output by default.
  const staticSrc = path.join(ROOT, ".next", "static");
  const staticDst = path.join(APP_OUT, ".next", "static");
  if (fs.existsSync(staticSrc)) fs.cpSync(staticSrc, staticDst, { recursive: true });

  const publicSrc = path.join(ROOT, "public");
  const publicDst = path.join(APP_OUT, "public");
  if (fs.existsSync(publicSrc)) fs.cpSync(publicSrc, publicDst, { recursive: true });

  log(`staged app -> ${APP_OUT}`);
}

// ---- 2. download + stage a portable Node binary for this OS/arch ----------
function nodeDistName() {
  const plat = os.platform(); // 'win32' | 'darwin'
  const arch = os.arch(); // 'x64' | 'arm64'
  if (plat === "win32") return { dist: `node-v${NODE_VERSION}-win-x64`, ext: "zip", relBin: "node.exe" };
  if (plat === "darwin") return { dist: `node-v${NODE_VERSION}-darwin-${arch}`, ext: "tar.gz", relBin: "bin/node" };
  throw new Error(`unsupported build platform: ${plat}`);
}

async function stageNode() {
  const { dist, ext, relBin } = nodeDistName();
  const url = `https://nodejs.org/dist/v${NODE_VERSION}/${dist}.${ext}`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "greenlight-node-"));
  const archivePath = path.join(tmp, `node.${ext}`);

  log(`downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to download ${url}: ${res.status}`);
  fs.writeFileSync(archivePath, Buffer.from(await res.arrayBuffer()));

  log(`extracting ${archivePath}`);
  if (ext === "zip") {
    // GNU tar (what Git Bash/MSYS ships) can't read .zip; PowerShell's
    // Expand-Archive is present on every Windows box, CI or local.
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${tmp}' -Force"`,
      { stdio: "inherit" }
    );
  } else {
    execSync(`tar -xzf "${archivePath}" -C "${tmp}"`, { stdio: "inherit" });
  }

  const extractedBin = path.join(tmp, dist, relBin);
  assertExists(extractedBin, "extracted node binary");

  fs.rmSync(NODE_OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(NODE_OUT_DIR, { recursive: true });
  fs.copyFileSync(extractedBin, NODE_OUT_BIN);
  fs.chmodSync(NODE_OUT_BIN, 0o755);

  fs.rmSync(tmp, { recursive: true, force: true });
  log(`staged node -> ${NODE_OUT_BIN}`);
}

stageApp();
await stageNode();
log("done");
