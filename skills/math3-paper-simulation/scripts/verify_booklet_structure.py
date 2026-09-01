#!/usr/bin/env python3
"""Verify the hard structural gates for a generated Math-3 booklet PDF."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import pdfplumber
from pypdf import PdfReader

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


FORBIDDEN_DEGRADATION_PATTERNS = (
    r"√\s*\(",
    r"\bx\s*/\s*\d",
    r"\blim\s+f\s*\(",
    r"\[\[",
    r"\\frac",
    r"\$",
)

QUESTION_NUMBER_PATTERN = re.compile(r"(?<!\d)(\d{1,2})\s*[.．]|第\s*(\d{1,2})\s*题")
KATEX_SUM_INDEX_PATTERN = re.compile(r"∞\s+n")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--expected-pages", type=int, default=None)
    parser.add_argument("--page-width", type=float, default=793.701)
    parser.add_argument("--page-height", type=float, default=595.276)
    parser.add_argument("--tolerance", type=float, default=1.0)
    parser.add_argument("--answer-booklet", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    reader = PdfReader(str(args.pdf))
    errors: list[str] = []
    pages: list[str] = []
    expected_pages = args.expected_pages if args.expected_pages is not None else (10 if args.answer_booklet else 9)

    producer = str((reader.metadata or {}).get("/Producer", ""))
    if "reportlab" in producer.lower():
        errors.append("producer is ReportLab; math3 booklets must come from a structured browser print path so KaTeX remains structured")

    if len(reader.pages) != expected_pages:
        errors.append(f"page count {len(reader.pages)} != {expected_pages}")

    with pdfplumber.open(args.pdf) as pdf:
        for index, page in enumerate(pdf.pages, 1):
            if abs(page.width - args.page_width) > args.tolerance or abs(page.height - args.page_height) > args.tolerance:
                errors.append(f"page {index}: size {page.width:.3f}x{page.height:.3f}")
            text = page.extract_text() or ""
            pages.append(text)
            if not text.strip():
                errors.append(f"page {index}: empty text")

    offset = 1 if args.answer_booklet else 0
    if pages and args.answer_booklet:
        if "数学（三）模拟卷" not in pages[0]:
            errors.append("cover: missing 数学（三）模拟卷")
        if "标准答案册" not in pages[0]:
            errors.append("cover: missing 标准答案册")

    if len(pages) >= offset + 5:
        if "一、选择题" not in pages[offset]:
            errors.append("page 2: missing choice heading")
        if "一、选择题" in pages[offset + 1] or "选择题（续" in pages[offset + 1] or "第 6～10 题" in pages[offset + 1]:
            errors.append("page 3: repeated choice continuation heading")
        if "二、填空题" not in pages[offset + 2]:
            errors.append("page 4: missing fill heading")
        if "三、解答题：第 17～22 题" not in pages[offset + 3]:
            errors.append("page 5: missing solution range heading")
        for index, text in enumerate(pages[offset + 4:offset + 9], offset + 5):
            if "三、解答题" in text or "一题一面" in text:
                errors.append(f"page {index}: repeated solution heading")

        expected_question_numbers = [
            list(range(1, 6)),
            list(range(6, 11)),
            list(range(11, 17)),
            [17],
            [18],
            [19],
            [20],
            [21],
            [22],
        ]
        for relative_index, expected in enumerate(expected_question_numbers):
            page_index = offset + relative_index
            if page_index >= len(pages):
                continue
            found = sorted(
                {
                    int(number)
                    for match in QUESTION_NUMBER_PATTERN.finditer(pages[page_index])
                    for number in (match.group(1), match.group(2))
                    if number is not None
                }
            )
            if found != expected:
                errors.append(
                    f"page {page_index + 1}: question numbers {found} != expected {expected}"
                )

    forbidden_layout_text = (
        "全国硕士研究生招生考试",
        "训练系统生成",
        "非官方试卷",
        "选择题（续",
        "一题一面",
    )
    for phrase in forbidden_layout_text:
        if phrase in "\n".join(pages):
            errors.append(f"forbidden layout text: {phrase}")

    if args.answer_booklet and pages:
        for phrase in ("答案、解析仅供复盘", "完整模拟 22题", "数学三 iPad"):
            if phrase in pages[0]:
                errors.append(f"cover: forbidden text {phrase}")

    combined_text = "\n".join(pages)
    for pattern in FORBIDDEN_DEGRADATION_PATTERNS:
        if re.search(pattern, combined_text, flags=re.IGNORECASE):
            errors.append(f"formula degradation pattern: {pattern}")

    # pdfplumber can emit KaTeX's two-dimensional sum indices top-to-bottom as
    # "∞ n" even when the PDF still contains the structured ∑ glyph.  Treat it
    # as a degradation only when no nearby sum glyph survives extraction; the
    # visual gate remains authoritative for the actual two-dimensional layout.
    for match in KATEX_SUM_INDEX_PATTERN.finditer(combined_text):
        window = combined_text[max(0, match.start() - 240) : match.end() + 240]
        if "∑" not in window:
            errors.append("formula degradation pattern: ∞\\s+n")
            break

    report = {
        "pdf": str(args.pdf.resolve()),
        "pages": len(pages),
        "answer_booklet": args.answer_booklet,
        "errors": errors,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
