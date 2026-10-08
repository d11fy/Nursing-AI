import test from "node:test";
import assert from "node:assert/strict";
import { waitForChatFile } from "../lib/chat/attachments";
import {
  questionOptions,
  questionText,
  isCorrectAnswer,
} from "../mobile/src/services/quiz";
const uploaded = {
  conversationId: "conversation",
  lectureId: "lecture",
  status: "processing",
};

test("a chat document is not usable until processing returns a real attachment", async () => {
  let requests = 0;
  const result = await waitForChatFile(
    uploaded,
    async (cid, lid) => {
      assert.equal(cid, "conversation");
      assert.equal(lid, "lecture");
      requests++;
      return requests === 1
        ? { status: "processing" }
        : { status: "ready", attachmentId: "attachment" };
    },
    { delay: async () => {} },
  );
  assert.equal(requests, 2);
  assert.equal(result.attachmentId, "attachment");
  assert.equal(result.lectureId, "lecture");
});
test("failed, timed-out and cancelled processing cannot create a pending chat attachment", async () => {
  await assert.rejects(
    waitForChatFile(
      uploaded,
      async () => ({ status: "failed", error: "OCR failed" }),
      { delay: async () => {} },
    ),
    /OCR failed/,
  );
  await assert.rejects(
    waitForChatFile(uploaded, async () => ({ status: "processing" }), {
      attempts: 2,
      delay: async () => {},
    }),
    /ما زال/,
  );
  const controller = new AbortController();
  controller.abort();
  let called = false;
  await assert.rejects(
    waitForChatFile(
      uploaded,
      async () => {
        called = true;
        return { status: "ready", attachmentId: "id" };
      },
      { signal: controller.signal },
    ),
    { name: "AbortError" },
  );
  assert.equal(called, false);
});
test("mobile uses the same question text, answer values and grading as the website", () => {
  const q = {
    questionText: "Which intervention?",
    options: ["A. Oxygen", "B. Fluids"],
    correctAnswer: "A",
  };
  assert.equal(questionText(q), "Which intervention?");
  assert.equal(questionOptions(q)[0].value, "A. Oxygen");
  assert.equal(isCorrectAnswer(q, "A. Oxygen", false), true);
  assert.equal(isCorrectAnswer(q, "B. Fluids", false), false);
  const pack = {
    question: "A different question",
    options: ["Oxygen", "Fluids"],
    correct_answer: "Fluids",
  };
  assert.equal(
    isCorrectAnswer(pack, questionOptions(pack)[1].value, true),
    true,
  );
  assert.equal(isCorrectAnswer(pack, "B", true), false);
  assert.equal(
    isCorrectAnswer({ correctAnswer: ["A", "C"] }, ["C", "A"], false),
    true,
  );
  assert.equal(
    isCorrectAnswer({ correctAnswer: ["A", "C"] }, ["A"], false),
    false,
  );
});
