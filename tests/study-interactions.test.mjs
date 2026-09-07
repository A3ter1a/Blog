import assert from "node:assert/strict";
import test from "node:test";
import { getLoginReturnPath } from "../lib/login-return.ts";
import { isQuizAnswerProvided, shouldSendAssistantQuestion } from "../lib/study-interactions.ts";

test("Chinese composition confirmation does not send an assistant question", () => {
  const enter = { key: "Enter", shiftKey: false, isComposing: false };
  assert.equal(shouldSendAssistantQuestion(enter), true);
  assert.equal(shouldSendAssistantQuestion({ ...enter, isComposing: true }), false);
  assert.equal(shouldSendAssistantQuestion({ ...enter, keyCode: 229 }), false);
  assert.equal(shouldSendAssistantQuestion({ ...enter, shiftKey: true }), false);
});

test("quick quiz distinguishes false from unanswered and empty selections", () => {
  for (const answer of [undefined, null, "", "  ", []]) assert.equal(isQuizAnswerProvided(answer), false);
  for (const answer of [false, true, "A", ["A", "C"]]) assert.equal(isQuizAnswerProvided(answer), true);
});

test("login returns to learning pages without changing account slots or following external URLs", () => {
  assert.equal(getLoginReturnPath("/tools/review"), "/tools/review");
  assert.equal(getLoginReturnPath("/notes/private/my-note"), "/notes/private/my-note");
  assert.equal(getLoginReturnPath("/tools/review?account=math#queue"), "/tools/review");
  for (const path of [null, "https://example.com", "//example.com", "/\\example.com", "/login", "/api/jobs", "/tools/../../login"]) {
    assert.equal(getLoginReturnPath(path), "/tools");
  }
});
