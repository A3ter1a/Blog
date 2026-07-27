import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const nextCli = resolve("node_modules/next/dist/bin/next");
const result = spawnSync(process.execPath, [nextCli, "build"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    ASTEROID_OFFLINE_BUILD: "1",
    NEXT_TELEMETRY_DISABLED: "1",
  },
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
