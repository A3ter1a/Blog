import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

// Use an existing Playwright installation; this script never installs packages.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const modules = {
  react: "react/cjs/react.production.js",
  "react/jsx-runtime": "react/cjs/react-jsx-runtime.production.js",
  "react-dom": "react-dom/cjs/react-dom.production.js",
  "react-dom/client": "react-dom/cjs/react-dom-client.production.js",
  scheduler: "scheduler/cjs/scheduler.production.js",
};
const factories = Object.entries(modules).map(([id, path]) =>
  `${JSON.stringify(id)}: function(module, exports, require) {\n${readFileSync(new URL(`../node_modules/${path}`, import.meta.url), "utf8")}\n}`,
);
const component = ts.transpileModule(readFileSync(new URL("../components/ui/CachedImage.tsx", import.meta.url), "utf8"), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
factories.push(`"cover": function(module, exports, require) {\n${component}\n}`);
const bundle = `const process = { env: { NODE_ENV: 'production' } };
const factories = {${factories.join(",\n")}}; const loaded = {};
function require(id) { if (!loaded[id]) { const m = loaded[id] = {exports:{}}; factories[id](m, m.exports, require); } return loaded[id].exports; }
const React = require('react');
require('react-dom/client').createRoot(document.getElementById('root')).render(
  React.createElement(React.Fragment, null,
    React.createElement(require('cover').CachedImage, {src:'/eager.svg', alt:'eager cover', loading:'eager', width:100, height:100}),
    React.createElement('div', {style:{height:10000}}),
    React.createElement(require('cover').CachedImage, {src:'/lazy.svg', alt:'lazy cover', loading:'lazy', width:100, height:100})
  )
);`;
const requests = { eager: 0, lazy: 0 };
const server = createServer((req, res) => {
  if (req.url === "/bundle.js") {
    res.setHeader("Content-Type", "text/javascript");
    res.end(bundle);
  } else if (req.url?.endsWith(".svg")) {
    requests[req.url === "/eager.svg" ? "eager" : "lazy"] += 1;
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("Content-Type", "image/svg+xml");
    res.end('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="blue"/></svg>');
  } else {
    res.setHeader("Content-Type", "text/html");
    res.end('<!doctype html><div id="root"></div><script src="/bundle.js"></script>');
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "msedge" });
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByAltText("eager cover").waitFor();
  await page.waitForFunction(() => document.querySelector('img[alt="eager cover"]').naturalWidth > 0);
  // Allow the previous component's asynchronous Cache Storage/fetch effects to settle.
  await page.waitForTimeout(500);
  const initial = { ...requests };
  await page.getByAltText("lazy cover").scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('img[alt="lazy cover"]').naturalWidth > 0);
  await page.waitForTimeout(100);
  const afterScroll = { ...requests };
  await page.goto(`http://127.0.0.1:${server.address().port}/return`);
  await page.waitForFunction(() => document.querySelector('img[alt="eager cover"]')?.naturalWidth > 0);
  await page.waitForTimeout(500);
  console.log(JSON.stringify({ initial, afterScroll, returning: requests, errors }, null, 2));
  assert.deepEqual(errors, []);
  assert.deepEqual(initial, { eager: 1, lazy: 0 }, "First paint must not duplicate cover downloads or fetch offscreen covers");
  assert.deepEqual(afterScroll, { eager: 1, lazy: 1 });
  assert.deepEqual(requests, { eager: 1, lazy: 1 }, "Returning to the page must reuse the HTTP image cache");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
