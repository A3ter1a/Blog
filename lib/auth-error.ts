type ErrorPayload = {
  error?: unknown;
};

export type AdminAuthCheckResult = {
  ok: boolean;
  status: number;
  payload: unknown;
};

export type AdminAuthResolution = {
  isAdmin: boolean;
  retryable: boolean;
  error: string | null;
  cache: "positive" | "clear" | "preserve";
};

function getServerError(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const error = (value as ErrorPayload).error;
  return typeof error === "string" && error.trim() ? error.trim() : null;
}

export function getAdminAuthFailureMessage(status: number, payload: unknown): string {
  if (status === 401) {
    return "登录会话已失效，请刷新页面后重试。";
  }

  if (status === 403) {
    return "登录成功，但该账号没有管理员权限。请确认 Supabase 的 admin_users 记录与登录邮箱一致。";
  }

  if (status === 503) {
    return "登录成功，但服务器暂时无法读取管理员权限。请检查 Supabase 连接后重试。";
  }

  if (status >= 500) {
    return "登录成功，但服务器暂时无法确认管理员权限，请稍后重试。";
  }

  return getServerError(payload) ?? "登录成功，但暂时无法确认管理员权限，请稍后重试。";
}

export function resolveAdminAuthCheck(
  result: AdminAuthCheckResult,
  fallbackIsAdmin = false,
): AdminAuthResolution {
  if (result.ok) {
    return {
      isAdmin: true,
      retryable: false,
      error: null,
      cache: "positive",
    };
  }

  const retryable = result.status >= 500;
  return {
    isAdmin: retryable && fallbackIsAdmin,
    retryable,
    error: getAdminAuthFailureMessage(result.status, result.payload),
    cache: retryable ? "preserve" : "clear",
  };
}
