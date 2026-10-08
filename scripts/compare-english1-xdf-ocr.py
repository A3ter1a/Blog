"""Retain line geometry and list candidate/source discrepancies for review."""
import json
import re
from pathlib import Path
from statistics import median

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "tmp/english1-2021-2026-import"


def coalesce(path: Path) -> str:
    rows = json.loads(path.read_text(encoding="utf-8"))
    rows.sort(key=lambda row: sum(point[1] for point in row["box"]) / 4)
    heights = [max(p[1] for p in row["box"]) - min(p[1] for p in row["box"]) for row in rows]
    tolerance = median(heights) * 0.42 if heights else 8
    groups = []
    for row in rows:
        center = sum(point[1] for point in row["box"]) / 4
        if groups and abs(center - groups[-1][0]) < tolerance:
            groups[-1][1].append(row)
        else:
            groups.append((center, [row]))
    lines = []
    for _, group in groups:
        group.sort(key=lambda row: min(point[0] for point in row["box"]))
        fragments = []
        for row in group:
            fragment = row["text"].strip()
            if "XDF.CN" in fragment or "xdf.cn" in fragment:
                continue
            fragment = re.sub(r"[\u4e00-\u9fff]+", "", fragment).strip()
            if fragment:
                fragments.append(fragment)
        line = " ".join(fragments)
        if not re.search(r"[A-Za-z]{3}", line):
            continue
        lines.append(line)
    return "\n".join(lines)


def main() -> None:
    for year in range(2021, 2027):
        folder = WORK / "xdf-sources" / str(year)
        if year == 2024:
            folder /= "zhejiang"
        if year == 2026:
            folder /= "shijiazhuang"
        texts = []
        for path in sorted(folder.glob("page-*.ocr.json")):
            if year == 2025 and int(path.stem.split("-")[1].split(".")[0]) > 11:
                continue
            text = coalesce(path)
            path.with_suffix(".coalesced.txt").write_text(text, encoding="utf-8")
            texts.append(text)
        (WORK / f"{year}-xdf-ocr.txt").write_text("\n\n".join(texts), encoding="utf-8")
        print(year, len(texts))


if __name__ == "__main__":
    main()
