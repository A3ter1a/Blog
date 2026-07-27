import net from "node:net";

const PROXY_HOST = "127.0.0.1";
const PROXY_PORT = 7890;
const LOCAL_HOST = "127.0.0.1";
const TARGETS = {
  production: {
    localPort: 15432,
    targetHost: "aws-1-ap-southeast-1.pooler.supabase.com",
    targetPort: 5432,
  },
  shadow: {
    localPort: 15433,
    targetHost: "aws-0-ap-southeast-1.pooler.supabase.com",
    targetPort: 5432,
  },
};
const MAX_HEADER_BYTES = 64 * 1024;

const targetName = process.argv[2] ?? "production";
const target = TARGETS[targetName];
if (!target) {
  console.error("目标必须是 production 或 shadow。");
  process.exit(2);
}

const server = net.createServer((client) => {
  const proxy = net.createConnection({ host: PROXY_HOST, port: PROXY_PORT });
  let header = Buffer.alloc(0);
  let tunnelReady = false;

  const closeBoth = () => {
    client.destroy();
    proxy.destroy();
  };

  client.on("error", closeBoth);
  proxy.on("error", closeBoth);
  proxy.setTimeout(15_000, closeBoth);

  proxy.once("connect", () => {
    proxy.write(
      `CONNECT ${target.targetHost}:${target.targetPort} HTTP/1.1\r\n` +
      `Host: ${target.targetHost}:${target.targetPort}\r\n` +
      "Proxy-Connection: keep-alive\r\n\r\n",
    );
  });

  const readProxyHeader = (chunk) => {
    header = Buffer.concat([header, chunk]);
    if (header.length > MAX_HEADER_BYTES) {
      closeBoth();
      return;
    }

    const headerEnd = header.indexOf("\r\n\r\n");
    if (headerEnd < 0) return;

    const statusLine = header.subarray(0, header.indexOf("\r\n")).toString("ascii");
    if (!/^HTTP\/1\.[01] 200\b/.test(statusLine)) {
      closeBoth();
      return;
    }

    tunnelReady = true;
    proxy.setTimeout(0);
    proxy.off("data", readProxyHeader);

    const remaining = header.subarray(headerEnd + 4);
    if (remaining.length > 0) client.write(remaining);
    client.pipe(proxy);
    proxy.pipe(client);
  };

  proxy.on("data", readProxyHeader);
  client.on("close", () => {
    if (!tunnelReady) proxy.destroy();
  });
});

server.on("error", (error) => {
  console.error(`WP1-B 本地隧道启动失败：${error.message}`);
  process.exitCode = 1;
});

server.listen(target.localPort, LOCAL_HOST, () => {
  console.log(`WP1-B ${targetName} 本地代理隧道已监听 ${LOCAL_HOST}:${target.localPort}`);
});

const shutdown = () => server.close(() => process.exit(0));
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
