import { spawn } from "node:child_process";
import process from "node:process";

const [envPath, nextBin, port] = process.argv.slice(2);
if (!envPath || !nextBin || !port) {
  console.error("用法：node start-next-with-env.mjs <env-path> <next-bin> <port>");
  process.exit(2);
}

process.loadEnvFile(envPath);
const child = spawn(process.execPath, [nextBin, "dev", "-p", port], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
  windowsHide: true,
});

const forwardSignal = (signal) => {
  if (!child.killed) child.kill(signal);
};
process.once("SIGINT", () => forwardSignal("SIGINT"));
process.once("SIGTERM", () => forwardSignal("SIGTERM"));
child.once("error", (error) => {
  console.error(`Next 子进程启动失败：${error.message}`);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  process.exitCode = Number.isInteger(code) ? code : signal ? 1 : 0;
});
