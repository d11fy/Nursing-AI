// The Android client must reject malformed server data instead of rendering
// or acting on it (release info, answer feedback, offline profile copy).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVersionResponse } from "../mobile/src/services/release";
import { answerFeedback, completionReview } from "../mobile/src/services/quiz";
import { parseProfileSnapshot } from "../mobile/src/services/profileSnapshot";

test("update check accepts only a well-formed release", () => {
  const good = { latest_version: "1.2.0", latest_version_code: 5, apk_url: "/api/download/apk", release_notes: "n", force_update: true, published_at: "x", available: true };
  assert.deepEqual(parseVersionResponse(good), { ...good });
  for (const bad of [null, "1.2.0", {}, { ...good, latest_version: "latest" }, { ...good, latest_version_code: "5" },
    { ...good, latest_version_code: 0 }, { ...good, apk_url: "" }, { ...good, latest_version_code: 5.5 }])
    assert.equal(parseVersionResponse(bad), null, JSON.stringify(bad));
  assert.equal(parseVersionResponse({ ...good, force_update: "yes" })?.force_update, false, "only literal true forces an update");
  assert.equal(parseVersionResponse({ ...good, available: false })?.available, false);
});

test("answer feedback is read from either endpoint and never invented", () => {
  assert.deepEqual(answerFeedback({ isCorrect: false, correctAnswer: "False", rationale: "r", topic: "t" }),
    { correctAnswer: "False", explanation: "r", isCorrect: false });
  assert.deepEqual(answerFeedback({ success: true, recorded: true, review: { correctAnswer: ["A", "C"], explanation: "e", isCorrect: true } }),
    { correctAnswer: ["A", "C"], explanation: "e", isCorrect: true });
  assert.equal(answerFeedback({ success: true, recorded: true, review: null }), null, "exam mode reveals nothing");
  assert.equal(answerFeedback(undefined), null);
  const review = completionReview({ review: [{ questionId: "q1", correctAnswer: "A" }, { questionId: 7, correctAnswer: "B" }, null, { questionId: "q3" }] });
  assert.deepEqual([...review.keys()], ["q1"]);
  assert.equal(completionReview({ review: "oops" }).size, 0);
});

test("offline profile copy is discarded unless it is a complete active profile", () => {
  const valid = JSON.stringify({ user_id: "u1", full_name: "طالب", email: "s@example.test", role: "student", status: "active" });
  assert.equal(parseProfileSnapshot(valid)?.user_id, "u1");
  for (const bad of [null, "", "{", JSON.stringify({ user_id: "u1" }), JSON.stringify({ user_id: "u1", full_name: "x", role: "owner", status: "active" }),
    JSON.stringify({ user_id: "u1", full_name: "x", role: "student", status: "suspended" })])
    assert.equal(parseProfileSnapshot(bad), null, String(bad));
});
