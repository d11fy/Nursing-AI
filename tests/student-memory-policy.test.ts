import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyQuestion, scopeResponse } from "../lib/ai/question-policy";
import { topicKey } from "../lib/student-memory";

test("curriculum policy separates non-nursing and ambiguous questions", () => {
  assert.equal(classifyQuestion("كيف أكتب كود بايثون؟", false, false), "NON_NURSING");
  assert.equal(classifyQuestion("اشرح الضغط", false, false), "AMBIGUOUS");
  assert.equal(classifyQuestion("ما علامات Heart Failure؟", true, false), "NURSING_IN_SCOPE");
  assert.match(scopeResponse.NO_SOURCE, /المنهج/);
});

test("memory topic keys are deterministic and bounded", () => {
  const key = topicKey("  اشرح Heart Failure بالتفصيل ");
  assert.equal(key, topicKey("  اشرح Heart Failure بالتفصيل "));
  assert.ok(key.length <= 80);
});
