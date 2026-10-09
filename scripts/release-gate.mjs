// Release gate: a release is not ready unless every step passes.
//   npm run release:gate            (all steps)
//   npm run release:gate -- --skip-e2e
// Used locally and by .github/workflows/release-gate.yml.
import { spawnSync } from "node:child_process";

const skipE2e = process.argv.includes("--skip-e2e");
const steps = [
  ["Next.js route types", "npx", ["next", "typegen"]],
  ["TypeScript (web)", "npx", ["tsc", "--noEmit"]],
  ["ESLint (errors fail the gate)", "npx", ["eslint", "--quiet", "."]],
  ["Unit, integration, quota, leakage and security tests", "npm", ["test"]],
  ["Icon-only buttons have accessible names", "node", ["scripts/audit-icon-buttons.mjs"]],
  ["Mobile build (TypeScript + Vite)", "npm", ["run", "mobile:build"]],
  ["Web production build", "npm", ["run", "build"]],
  ["No high/critical vulnerabilities in production dependencies", "npm", ["audit", "--omit=dev", "--audit-level=high"]],
  ["No high/critical vulnerabilities in mobile runtime dependencies", "npm", ["--prefix", "mobile", "audit", "--omit=dev", "--audit-level=high"]],
  ...(skipE2e ? [] : [["Mobile end-to-end tests", "npm", ["run", "test:mobile"]]]),
];

const results = [];
for (const [name, command, args] of steps) {
  console.log(`\n=== ${name}`);
  const started = Date.now();
  // npm/npx are .cmd shims on Windows and need a shell; the arguments are fixed literals above.
  const run = process.platform === "win32"
    ? spawnSync([command, ...args].join(" "), { stdio: "inherit", shell: true })
    : spawnSync(command, args, { stdio: "inherit" });
  const ok = run.status === 0;
  results.push({ name, ok, seconds: Math.round((Date.now() - started) / 1000) });
  if (!ok) break;
}
console.log("\nRelease gate summary");
for (const result of results) console.log(`${result.ok ? "PASS" : "FAIL"}  ${result.name} (${result.seconds}s)`);
const skipped = steps.length - results.length;
if (skipped) console.log(`SKIPPED ${skipped} later step(s) after the failure`);
process.exitCode = results.every((result) => result.ok) && !skipped ? 0 : 1;
