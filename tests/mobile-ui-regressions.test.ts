import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("mobile chat composer stays inside the visible viewport", () => {
  const chat = read("mobile/src/screens/ChatScreen.tsx");
  const styles = read("mobile/src/index.css");

  assert.match(chat, /chat-viewport flex min-h-0 flex-col/);
  assert.match(chat, /shrink-0 border-t/);
  assert.match(styles, /\.chat-viewport\s*\{[\s\S]*100dvh/);
});

test("mobile library uses the current API response and favorites contract", () => {
  const library = read("mobile/src/screens/LibraryScreen.tsx");

  assert.match(library, /subjectName\?:/);
  assert.match(library, /favorite\?:/);
  assert.match(library, /method: "PUT"/);
  assert.match(library, /JSON\.stringify\(\{ documentId: docId, favorite \}\)/);
  assert.match(library, /id: res\.studyPackId/);
  assert.doesNotMatch(library, /subject_name|is_favorite/);
});

test("mobile Tailwind build defines the shared UI compatibility utilities", () => {
  const config = read("mobile/tailwind.config.js");

  assert.match(config, /"linear-to-l"/);
  assert.match(config, /boxShadow/);
  assert.match(config, /scale:[\s\S]*97:[\s\S]*98:/);
});
