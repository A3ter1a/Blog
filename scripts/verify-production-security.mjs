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

async function request(baseUrl, path) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    redirect: "manual",
    headers: {
      "Cache-Control": "no-cache",
      "User-Agent": "Asteroid-production-security-verifier/1.0",
    },
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
      path: "/debug",
      expected: [404],
      risk: "如果这里不是 404，Supabase 调试页面可能暴露到公网。",
    },
    {
      name: "未登录不能确认管理员身份",
      path: "/api/auth/admin",
      expected: [401],
      risk: "如果这里不是 401，管理员鉴权接口可能存在绕过风险。",
    },
    {
      name: "未登录不能读取 AI 配置状态",
      path: "/api/ai/config",
      expected: [401],
      risk: "如果这里不是 401，AI 配置接口可能没有被管理员保护。",
    },
  ];

  let failed = 0;
  let unreachable = 0;

  for (const check of checks) {
    try {
      const res = await request(baseUrl, check.path);
      const ok = check.expected.includes(res.status);
      const marker = ok ? "PASS" : "FAIL";
      console.log(`${marker} ${check.name}: HTTP ${res.status}, 期望 ${formatExpected(check.expected)}`);

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

async function main() {
  const baseUrl = parseBaseUrl();
  console.log(`Asteroid 生产安全验收: ${baseUrl}`);
  console.log("");

  const { failed, unreachable } = await runStatusChecks(baseUrl);
  await runRootWarning(baseUrl);

  console.log("");
  if (unreachable > 0) {
    console.log(`结果: ${unreachable} 个关键检查无法访问目标地址。请换网络、检查代理/TLS，或在 Vercel 部署环境外的正常网络中重试。`);
    process.exitCode = 2;
    return;
  }

  if (failed > 0) {
    console.log(`结果: ${failed} 个关键检查未通过。请先处理生产部署或后台配置。`);
    process.exitCode = 1;
    return;
  }

  console.log("结果: 关键未登录安全检查通过。仍需人工确认 Supabase RLS 已执行、管理员登录后功能可用。");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`验收脚本异常: ${message}`);
  process.exitCode = 1;
});
