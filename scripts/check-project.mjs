import fs from "node:fs";
import { spawnSync } from "node:child_process";

const required = [
  "index.html",
  "admin.html",
  "worker.js",
  "migrations/0001_phase1.sql",
  "scripts/import-catalog.mjs",
  "tests/worker.test.js",
  "ARCHITECTURE.md",
  "CONTRIBUTING.md"
];

const missing = required.filter(file => !fs.existsSync(file));
if (missing.length) {
  process.stderr.write("Missing required project files:\n" + missing.map(x => " - " + x).join("\n") + "\n");
  process.exit(1);
}

const jsFiles = ["worker.js", "scripts/import-catalog.mjs", "scripts/check-project.mjs"];
for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(`JavaScript syntax check failed: ${file}\n${result.stderr || result.stdout}`);
    process.exit(result.status || 1);
  }
}

process.stdout.write(`Project check passed: ${required.length} required files and ${jsFiles.length} JavaScript syntax checks.\n`);
