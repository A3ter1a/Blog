import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { createNextRuntimeEnv } from "./next-runtime-env.mjs";

// Use Next's own loader so development env precedence stays consistent.
const require = createRequire(import.meta.url);
const nextRequire = createRequire(require.resolve("next/package.json"));
const { loadEnvConfig } = nextRequire("@next/env");
loadEnvConfig(process.cwd(), true);

let env;
try {
  env = createNextRuntimeEnv();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Next 运行环境准备失败。");
  process.exit(1);
}

const child = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "dev", ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env,
  stdio: "inherit",
  windowsHide: true,
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}
child.once("error", (error) => {
  console.error(`开发服务启动失败：${error.message}`);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  process.exitCode = Number.isInteger(code) ? code : signal ? 1 : 0;
});
