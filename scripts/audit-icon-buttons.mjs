// Lists buttons whose only content is an icon and that have no accessible
// name (aria-label / aria-labelledby / title / sr-only text). Used by the
// accessibility regression test; exits 1 when any are found.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOTS = ["app", "components", "features", "mobile/src"];
const files = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (name === "node_modules" || name.startsWith(".")) continue;
    if (statSync(full).isDirectory()) walk(full);
    else if (full.endsWith(".tsx")) files.push(full);
  }
}
ROOTS.forEach((root) => walk(root));

const findings = [];
const BUTTON = /<(button|Button)\b((?:[^>"'{}]|"[^"]*"|'[^']*'|\{(?:[^{}]|\{[^{}]*\})*\})*)>([\s\S]*?)<\/\1>/g;
for (const file of files) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(BUTTON)) {
    const [, , attributes, children] = match;
    if (/aria-label(ledby)?=|title=|\brender=/.test(attributes)) continue;
    const text = children
      .replace(/<([A-Z][A-Za-z0-9.]*)\b[^>]*\/>/g, "") // icon components
      .replace(/<[^>]+>/g, "")
      .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
      .trim();
    if (text === "" && !/sr-only/.test(children)) {
      const line = source.slice(0, match.index).split("\n").length;
      findings.push(`${file.replaceAll("\\", "/")}:${line}`);
    }
  }
}
if (findings.length) {
  console.log(findings.join("\n"));
  process.exitCode = 1;
} else {
  console.log("No icon-only buttons without an accessible name.");
}
