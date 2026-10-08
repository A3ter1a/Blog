#!/usr/bin/env python
"""Read retained XDF exam images with existing local OCR; no external upload."""
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "tmp/english1-2021-2026-import/xdf-sources"
installed = next(p / "tmp/ocr-runtime" for p in Path("C:/Users/phoen/Desktop/Study").iterdir() if (p / "tmp/ocr-runtime").exists())
sys.path.insert(0, str(installed))
from rapidocr_onnxruntime import RapidOCR

engine = RapidOCR(intra_op_num_threads=4, inter_op_num_threads=4, det_limit_side_len=1600)
for year in ([int(year) for year in sys.argv[1:]] or range(2021, 2026)):
    image_dir = WORK / str(year)
    if year in {2023, 2024} and (image_dir / "zhejiang").exists():
        image_dir = image_dir / "zhejiang"
    if year == 2026:
        image_dir = image_dir / "shijiazhuang"
    for image in sorted(image_dir.glob("page-*")):
        if image.suffix.lower() not in {".jpg", ".png", ".jpeg", ".webp"}:
            continue
        number = int(image.stem.split("-")[-1])
        if year == 2025 and number > 11:
            continue
        output = image.with_suffix(".ocr.json")
        if output.exists():
            continue
        started = time.monotonic()
        result, elapsed = engine(str(image))
        rows = [{"box": box, "text": text, "confidence": float(confidence)} for box, text, confidence in (result or [])]
        output.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        image.with_suffix(".ocr.txt").write_text("\n".join(row["text"] for row in rows) + "\n", encoding="utf-8")
        print(year, image.name, len(rows), round(time.monotonic() - started, 2), flush=True)
