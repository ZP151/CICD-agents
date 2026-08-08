#!/usr/bin/env node
/**
 * Credential persistence audit (Phase 4 4a-1, ADR-0005).
 *
 * Scans MergePilot's persisted stores for non-empty `adoPat` values. The
 * credential contract is: stores never hold the value (runtime injection
 * only), so any occurrence is a containment violation to report and clean.
 *
 * NEVER prints a credential value — only counts and locations.
 *
 * Targets (dataDir = RUNTIME_DATA_DIR or ~/.mergepilot):
 *   project-links.json   — per Project Link
 *   chat-history.json    — per session inlineProjectLink (+ nested shapes)
 *
 * Usage:
 *   node scripts/audit-credential-persistence.mjs             report only
 *   node scripts/audit-credential-persistence.mjs --clean     blank values in place
 *   node scripts/audit-credential-persistence.mjs --json      machine-readable report
 *
 * Exit codes: 0 = no non-empty adoPat found (or --clean applied); 1 = found
 * without --clean.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.RUNTIME_DATA_DIR ?? path.join(os.homedir(), ".mergepilot");

const TARGETS = ["project-links.json", "chat-history.json"];

function collectNonEmptyAdoPat(node, pathSoFar, findings) {
  if (Array.isArray(node)) {
    node.forEach((item, i) => collectNonEmptyAdoPat(item, `${pathSoFar}[${i}]`, findings));
    return;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (key === "adoPat" && typeof value === "string" && value.length > 0) {
        findings.push(pathSoFar === "" ? key : `${pathSoFar}.${key}`);
      }
      collectNonEmptyAdoPat(value, pathSoFar === "" ? key : `${pathSoFar}.${key}`, findings);
    }
  }
}

function blankAdoPat(node) {
  if (Array.isArray(node)) {
    node.forEach(blankAdoPat);
    return;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (key === "adoPat" && typeof value === "string") node[key] = "";
      else blankAdoPat(value);
    }
  }
}

const args = process.argv.slice(2);
const clean = args.includes("--clean");
const json = args.includes("--json");

const report = { dataDir, scanned: [], totalNonEmpty: 0, cleaned: clean };
let dirty = false;

for (const fileName of TARGETS) {
  const filePath = path.join(dataDir, fileName);
  const entry = { file: fileName, exists: false, nonEmpty: 0, locations: [] };
  if (fs.existsSync(filePath)) {
    entry.exists = true;
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
      collectNonEmptyAdoPat(parsed, "", entry.locations);
      entry.nonEmpty = entry.locations.length;
      if (entry.nonEmpty > 0) {
        dirty = true;
        report.totalNonEmpty += entry.nonEmpty;
        if (clean) {
          blankAdoPat(parsed);
          fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2), "utf8");
        }
      }
    } catch {
      entry.nonEmpty = -1; // unreadable
    }
  }
  report.scanned.push(entry);
}

if (json) {
  process.stdout.write(JSON.stringify(report, null, 1) + "\n");
} else {
  for (const entry of report.scanned) {
    const loc = entry.nonEmpty === -1 ? "UNREADABLE" : `${entry.nonEmpty} non-empty adoPat`;
    console.log(`${entry.file}: ${entry.exists ? loc : "absent"}`);
    if (!clean && entry.nonEmpty > 0) {
      console.log(`  locations (values redacted): ${entry.locations.join(", ")}`);
    }
  }
  console.log(`total non-empty adoPat: ${report.totalNonEmpty}${clean ? " (cleaned)" : ""}`);
}
process.exit(dirty && !clean ? 1 : 0);
