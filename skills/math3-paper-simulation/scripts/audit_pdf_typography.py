#!/usr/bin/env python3
"""Audit the measurable typography invariants of a generated math-3 PDF."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

import pdfplumber
from pypdf import PdfReader


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--page-width", type=float, required=True)
    parser.add_argument("--page-height", type=float, required=True)
    parser.add_argument("--body-size", type=float, default=10.29)
    parser.add_argument("--tolerance", type=float, default=0.05)
    parser.add_argument("--min-body-share", type=float, default=0.70)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    reader = PdfReader(str(args.pdf))
    if reader.is_encrypted:
        raise SystemExit("PDF is encrypted")

    errors: list[str] = []
    page_reports: list[dict[str, object]] = []
    with pdfplumber.open(args.pdf) as pdf:
        for index, page in enumerate(pdf.pages, 1):
            if abs(page.width - args.page_width) > args.tolerance:
                errors.append(f"page {index}: width {page.width:.3f}")
            if abs(page.height - args.page_height) > args.tolerance:
                errors.append(f"page {index}: height {page.height:.3f}")

            text = page.extract_text() or ""
            if not text.strip():
                errors.append(f"page {index}: empty text")
            if "\ufffd" in text or "□" in text:
                errors.append(f"page {index}: replacement glyph in extracted text")

            sizes = Counter(round(float(char.get("size", 0.0)), 2) for char in page.chars)
            body_count = sum(
                count
                for size, count in sizes.items()
                if abs(size - args.body_size) <= args.tolerance
            )
            share = body_count / len(page.chars) if page.chars else 0.0
            if share < args.min_body_share:
                errors.append(f"page {index}: body share {share:.3f}")

            page_reports.append(
                {
                    "page": index,
                    "width": round(page.width, 3),
                    "height": round(page.height, 3),
                    "characters": len(page.chars),
                    "body_size_share": round(share, 4),
                    "sizes": dict(sizes.most_common()),
                }
            )

    report = {
        "pdf": str(args.pdf.resolve()),
        "pages": len(reader.pages),
        "encrypted": reader.is_encrypted,
        "page_reports": page_reports,
        "errors": errors,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
