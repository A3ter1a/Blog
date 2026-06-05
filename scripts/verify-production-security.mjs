#!/usr/bin/env node

const DEFAULT_BASE_URL = "https://www.a3ter1a.cn";

function parseBaseUrl() {
  const urlFlagIndex = process.argv.indexOf("--url");
  const rawUrl = urlFlagIndex >= 0 ? process.argv[urlFlagIndex + 1] : DEFAULT_BASE_URL;

  if (!rawUrl) {
    throw new Error("缺少 --url 参数值");
  }

  return rawUrl.replace(/\/+$/, "");
}

async function request(baseUrl, path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method || "GET",
    redirect: "manual",
    headers: {
      "Cache-Control": "no-cache",
      "User-Agent": "Asteroid-production-security-verifier/1.0",
      ...(options.headers || {}),
    },
    body: options.body,
  });

  return res;
}

function formatExpected(expected) {
  return expected.join(" 或 ");
}

async function runStatusChecks(baseUrl) {
  const checks = [
    {
      name: "/debug 生产环境不可访问",
      method: "GET",
      path: "/debug",
      expected: [404],
      risk: "如果这里不是 404，Supabase 调试页面可能暴露到公网。",
    },
    {
      name: "未登录不能确认管理员身份",
      method: "GET",
      path: "/api/auth/admin",
      expected: [401],
      risk: "如果这里不是 401，管理员鉴权接口可能存在绕过风险。",
    },
    {
      name: "未登录不能读取 AI 配置状态",
      method: "GET",
      path: "/api/ai/config",
      expected: [401],
      risk: "如果这里不是 401，AI 配置接口可能没有被管理员保护。",
    },
    {
      name: "未登录不能测试 AI 配置",
      method: "POST",
      path: "/api/ai/config",
      expected: [401],
      risk: "如果这里不是 401，未登录访客可能触发 AI key 测试或外部 API 调用。",
    },
    {
      name: "未登录不能调用 DeepSeek 题目分析",
      method: "POST",
      path: "/api/ai/analyze",
      expected: [401],
      risk: "如果这里不是 401，未登录访客可能消耗 DeepSeek 配额或探测 AI 接口。",
    },
    {
      name: "未登录不能调用 Qwen OCR",
      method: "POST",
      path: "/api/ai/ocr",
      expected: [401],
      risk: "如果这里不是 401，未登录访客可能消耗 Qwen OCR 配额或上传图片内容。",
    },
  ];

  let failed = 0;
  let unreachable = 0;

  for (const check of checks) {
    try {
      const res = await request(baseUrl, check.path, {
        method: check.method,
        headers: check.method === "POST" ? { "Content-Type": "application/json" } : undefined,
        body: check.method === "POST" ? "{}" : undefined,
      });
      const ok = check.expected.includes(res.status);
      const marker = ok ? "PASS" : "FAIL";
      console.log(`${marker} ${check.method} ${check.name}: HTTP ${res.status}, 期望 ${formatExpected(check.expected)}`);

      if (!ok) {
        failed += 1;
        console.log(`     风险: ${check.risk}`);
      }
    } catch (error) {
      unreachable += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.log(`ERROR ${check.name}: 请求失败: ${message}`);
      console.log("      说明: 当前机器无法连到目标地址，不能据此证明线上已安全或不安全。");
    }
  }

  return { failed, unreachable };
}

async function runRootWarning(baseUrl) {
  try {
    const res = await request(baseUrl, "/");
    if (!res.ok) {
      console.log(`WARN 首页检查跳过: HTTP ${res.status}`);
      return;
    }

    const html = await res.text();
    if (html.includes('href="/create"') || html.includes("创建")) {
      console.log("WARN 首页 HTML 中仍出现创建入口相关文本。请用无痕窗口未登录访问首页，确认导航里是否还显示“创建”。");
      return;
    }

    console.log("PASS 首页 HTML 未发现明显创建入口文本。");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`WARN 首页检查失败: ${message}`);
  }
}

async function runHeaderChecks(baseUrl) {
  const exactChecks = [
    {
      name: "安全头 X-Content-Type-Options",
      key: "x-content-type-options",
      expected: "nosniff",
      risk: "缺少 nosniff 时，浏览器可能错误猜测资源类型，增加脚本注入风险。",
    },
    {
      name: "安全头 Referrer-Policy",
      key: "referrer-policy",
      expected: "strict-origin-when-cross-origin",
      risk: "缺少 Referrer-Policy 时，外链请求可能带出过多来源路径信息。",
    },
    {
      name: "安全头 X-Frame-Options",
      key: "x-frame-options",
      expected: "DENY",
      risk: "缺少 X-Frame-Options 时，页面可能被第三方网站嵌入并诱导点击。",
    },
    {
      name: "安全头 X-Permitted-Cross-Domain-Policies",
      key: "x-permitted-cross-domain-policies",
      expected: "none",
      risk: "缺少该头时，旧式跨域策略文件可能扩大资源暴露面。",
    },
  ];

  const containsChecks = [
    {
      name: "CSP 允许受控视频嵌入",
      key: "content-security-policy",
      expectedParts: [
        "frame-src https://www.bilibili.com https://player.bilibili.com https://www.youtube.com",
        "media-src 'self' blob: https: data:",
      ],
      risk: "CSP 不符合预期时，可能误放开 iframe 或误拦截笔记里的视频播放。",
    },
    {
      name: "Permissions-Policy 禁用高风险浏览器权限",
      key: "permissions-policy",
      expectedParts: ["camera=()", "microphone=()", "geolocation=()", "payment=()"],
      risk: "缺少 Permissions-Policy 时，浏览器敏感能力的默认边界不够清楚。",
    },
  ];

  let failed = 0;
  let unreachable = 0;

  try {
    const res = await request(baseUrl, "/");

    for (const check of exactChecks) {
      const actual = res.headers.get(check.key);
      const ok = actual === check.expected;
      const marker = ok ? "PASS" : "FAIL";
      console.log(`${marker} ${check.name}: ${actual || "缺失"}`);

      if (!ok) {
        failed += 1;
        console.log(`     期望: ${check.expected}`);
        console.log(`     风险: ${check.risk}`);
      }
    }

    for (const check of containsChecks) {
      const actual = res.headers.get(check.key) || "";
      const ok = check.expectedParts.every((part) => actual.includes(part));
      const marker = ok ? "PASS" : "FAIL";
      console.log(`${marker} ${check.name}: ${actual || "缺失"}`);

      if (!ok) {
        failed += 1;
        console.log(`     期望包含: ${check.expectedParts.join(" ; ")}`);
        console.log(`     风险: ${check.risk}`);
      }
    }
  } catch (error) {
    unreachable += 1;
    const message = error instanceof Error ? error.message : String(error);
    console.log(`ERROR 安全头检查: 请求失败: ${message}`);
    console.log("      说明: 当前机器无法连到目标地址，不能据此证明线上安全头已生效。");
  }

  return { failed, unreachable };
}

async function main() {
  const baseUrl = parseBaseUrl();
  console.log(`Asteroid 生产安全验收: ${baseUrl}`);
  console.log("");

  const { failed, unreachable } = await runStatusChecks(baseUrl);
  const headerResult = await runHeaderChecks(baseUrl);
  await runRootWarning(baseUrl);

  const totalFailed = failed + headerResult.failed;
  const totalUnreachable = unreachable + headerResult.unreachable;

  console.log("");
  if (totalUnreachable > 0) {
    console.log(`结果: ${totalUnreachable} 个关键检查无法访问目标地址。请换网络、检查代理/TLS，或在 Vercel 部署环境外的正常网络中重试。`);
    process.exitCode = 2;
    return;
  }

  if (totalFailed > 0) {
    console.log(`结果: ${totalFailed} 个关键检查未通过。请先处理生产部署或后台配置。`);
    process.exitCode = 1;
    return;
  }

  console.log("结果: 关键未登录安全检查和安全头检查通过。仍需人工确认 Supabase RLS 已执行、管理员登录后功能可用。");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`验收脚本异常: ${message}`);
  process.exitCode = 1;
});
