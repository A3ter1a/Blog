import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const evidence = [
  { stage: "3", desktop: "stage3-ai-content-1440-gate.png", desktopMin: [1400, 850], compact: "stage3-ai-content-1024-gate.png", compactMin: [1000, 700] },
  { stage: "4", desktop: "stage4-ai-review-1440-gate.png", desktopMin: [1400, 850], compact: "stage4-ai-review-1024-gate.png", compactMin: [1000, 700] },
  { stage: "5", desktop: "stage5-collection-workspace-1440-mock.png", desktopMin: [1400, 850], compact: "stage5-collection-workspace-1024-mock.png", compactMin: [1000, 700] },
  { stage: "6", desktop: "stage6-message-center-cancelled-1440.png", desktopMin: [1400, 850], compact: "stage6-message-center-1024-viewport.png", compactMin: [1000, 700] },
  { stage: "7", desktop: "stage7-note-reader-1440.png", desktopMin: [1400, 850], compact: "stage7-note-reader-1024.png", compactMin: [1000, 700] },
  { stage: "8", desktop: "stage8-ai-review-unauthenticated-1440.png", desktopMin: [1400, 850], compact: "stage8-ai-review-unauthenticated-1024.png", compactMin: [1000, 700] },
  { stage: "9", desktop: "stage9-roleplay-settings-1440.png", desktopMin: [1400, 850], compact: "stage9-roleplay-settings-1024.png", compactMin: [1000, 700] },
];

function readImage(relativePath, minimum) {
  const fullPath = path.join(root, "output", "playwright", relativePath);
  if (!fs.existsSync(fullPath)) throw new Error(`missing browser evidence: ${relativePath}`);
  const bytes = fs.readFileSync(fullPath);
  let format;
  let width;
  let height;
  if (bytes.length >= 24 && bytes.readUInt32BE(0) === 0x89504e47 && bytes.readUInt32BE(4) === 0x0d0a1a0a) {
    format = "png";
    width = bytes.readUInt32BE(16);
    height = bytes.readUInt32BE(20);
  } else if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    format = "jpeg";
    let index = 2;
    while (index + 9 < bytes.length) {
      if (bytes[index] !== 0xff) { index += 1; continue; }
      const marker = bytes[index + 1];
      index += 2;
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      const segmentLength = bytes.readUInt16BE(index);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        height = bytes.readUInt16BE(index + 3);
        width = bytes.readUInt16BE(index + 5);
        break;
      }
      index += segmentLength;
    }
  }
  if (!format || !width || !height) throw new Error(`unsupported or unreadable image: ${relativePath}`);
  if (width < minimum[0] || height < minimum[1]) throw new Error(`browser evidence too small: ${relativePath} (${width}x${height})`);
  return { path: relativePath, format, width, height, bytes: bytes.length };
}

const checked = [];
for (const item of evidence) {
  checked.push({ stage: item.stage, desktop: readImage(item.desktop, item.desktopMin), compact: readImage(item.compact, item.compactMin) });
}

console.log(JSON.stringify({
  status: "passed",
  note: "Evidence is visual QA only; stage 8 captures are intentionally unauthenticated safety gates.",
  stages: checked,
}, null, 2));
