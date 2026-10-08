import { execFileSync } from "node:child_process";

const windowsInternetSettingsKey = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";

function readWindowsInternetProxy() {
  if (process.platform !== "win32") return null;

  const readRegistryValue = (name) => {
    try {
      return execFileSync("reg.exe", ["query", windowsInternetSettingsKey, "/v", name], {
        encoding: "utf8",
        windowsHide: true,
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      return "";
    }
  };

  const enabled = /ProxyEnable\s+REG_DWORD\s+0x1\b/i.test(readRegistryValue("ProxyEnable"));
  if (!enabled) return null;

  const value = readRegistryValue("ProxyServer")
    .match(/ProxyServer\s+REG_SZ\s+(.+)$/im)?.[1]
    ?.trim();
  if (!value) return null;

  const httpsProxy = value.match(/(?:^|;)https=([^;]+)/i)?.[1]?.trim();
  const firstProxy = value.split(";")[0]?.split("=").pop()?.trim();
  const candidate = httpsProxy || firstProxy || "";
  if (!candidate || /^socks/i.test(candidate)) return null;
  return /^https?:\/\//i.test(candidate) ? candidate : `http://${candidate}`;
}

export function createNextRuntimeEnv(baseEnv = process.env) {
  const env = { ...baseEnv };
  const inheritedProxy = env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy;
  if (!inheritedProxy) {
    const systemProxy = readWindowsInternetProxy();
    if (systemProxy) {
      env.HTTPS_PROXY = systemProxy;
      env.HTTP_PROXY = systemProxy;
      console.log("Next 服务已继承 Windows 系统代理，用于访问 Supabase 等外部服务。");
    }
  }

  const hasProxy = Boolean(env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy);
  if (hasProxy && env.NODE_USE_ENV_PROXY !== "0") {
    if (!process.allowedNodeEnvironmentFlags.has("--use-env-proxy")) {
      throw new Error("本地代理需要 Node.js 22.21+ 或 24.5+；请更新 Node.js，或移除开发环境中的代理配置。");
    }
    env.NODE_USE_ENV_PROXY = "1";
    const exclusions = env.no_proxy ?? env.NO_PROXY ?? "";
    env.NO_PROXY = [exclusions, "localhost", "127.0.0.1", "::1"].filter(Boolean).join(",");
    delete env.no_proxy;
    console.log("Next 服务已启用环境代理，本机请求保持直连。");
  }

  return env;
}
