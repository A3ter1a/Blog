import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";
import { getLoginReturnPath } from "../lib/login-return.ts";
import { getAdminAuthFailureMessage, resolveAdminAuthCheck } from "../lib/auth-error.ts";
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
  assert.equal(getLoginReturnPath("/create?edit=note-1&from=%2Fnotes#editor"), "/create?edit=note-1&from=%2Fnotes");
  assert.equal(getLoginReturnPath("/notes?directory=ai&slot=math"), "/notes?directory=ai");
  for (const path of [null, "https://example.com", "//example.com", "/\\example.com", "/login", "/api/jobs", "/tools/../../login"]) {
    assert.equal(getLoginReturnPath(path), "/tools");
  }
});

test("管理员登录失败显示真实的会话、权限或 Supabase 状态", () => {
  assert.match(getAdminAuthFailureMessage(401, null), /会话已失效/);
  assert.match(getAdminAuthFailureMessage(403, { error: "Admin permission required" }), /没有管理员权限/);
  assert.match(getAdminAuthFailureMessage(503, { error: "Admin authority source is unavailable" }), /无法读取管理员权限/);
  assert.match(getAdminAuthFailureMessage(418, { error: "unexpected response" }), /unexpected response/);
});

test("管理员权限临时不可读时保留会话并提供可操作的重试", () => {
  const loginPage = readFileSync(resolve("app/login/page.tsx"), "utf8");
  const authHook = readFileSync(resolve("hooks/useAdminAuth.ts"), "utf8");

  assert.match(loginPage, /resolveAdminAuthCheck\(\{ ok: false, status: adminResponse\.status, payload: adminPayload \}\)/);
  assert.match(loginPage, /重新检查管理员权限/);
  assert.match(authHook, /resolveAdminAuthCheck\(result, fallbackIsAdmin\)/);
  assert.match(authHook, /retryable: resolution\.retryable/);
  assert.match(readFileSync(resolve("components/auth/AdminGate.tsx"), "utf8"), /管理员权限暂时无法确认/);
});

test("管理员权限响应按认证、权限和临时服务故障分流", () => {
  assert.deepEqual(
    resolveAdminAuthCheck({ ok: true, status: 200, payload: null }),
    { isAdmin: true, retryable: false, error: null, cache: "positive" },
  );
  assert.deepEqual(
    resolveAdminAuthCheck({ ok: false, status: 403, payload: { error: "Admin permission required" } }),
    { isAdmin: false, retryable: false, error: getAdminAuthFailureMessage(403, { error: "Admin permission required" }), cache: "clear" },
  );
  assert.deepEqual(
    resolveAdminAuthCheck({ ok: false, status: 503, payload: { error: "Admin authority source is unavailable" } }, true),
    { isAdmin: true, retryable: true, error: getAdminAuthFailureMessage(503, { error: "Admin authority source is unavailable" }), cache: "preserve" },
  );
});
