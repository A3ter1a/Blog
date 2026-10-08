#!/usr/bin/env python
"""Prepare a six-year candidate import without changing the database.

The candidate is deliberately not labelled verified. Source files and unresolved
cross-source differences must be reviewed before applying the JSON to Supabase.
"""

from __future__ import annotations

import importlib.util
import json
import re
from pathlib import Path

import pdfplumber
import pypdfium2 as pdfium

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "tmp/english1-2021-2026-import"
OUTPUT = ROOT / "data/english-papers/english1-2021-2026-candidate.json"


def text_clean(text: str) -> str:
    # Retain Unicode punctuation, Chinese captions and diacritics. Never
    # silently discard non-ASCII text as the older extractor did.
    return re.sub(r"[ \t]+", " ", text.replace("\r\n", "\n")).strip()


def prose(text: str) -> str:
    return "\n\n".join(
        " ".join(block.split())
        for block in re.split(r"\n\s*\n", text_clean(text))
        if block.strip()
    )


def extract_layout_text(pdf_path: Path, first: int, stop: int) -> str:
    output: list[str] = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages[first:stop]:
            lines = [line for line in page.extract_text_lines(x_tolerance=1, y_tolerance=3) if line["top"] < page.height - 45]
            candidates = [line["x0"] for line in lines if len(line["text"]) > 45]
            left = min(candidates, default=page.width * 0.1)
            previous_bottom: float | None = None
            for line in lines:
                value = text_clean(line["text"])
                if not value or value.isdigit() or "公众号" in value:
                    continue
                indented = left + 15 < line["x0"] < left + 40
                separated = previous_bottom is not None and line["top"] - previous_bottom > 23
                section_start = bool(re.match(r"(?:Text\s+[1-4]|Part\s+[ABC]|Section|\d{1,2}\.\s|[A-H]\.\s|\((?:4[1-5])\))", value))
                if indented or separated or section_start:
                    output.append("")
                output.append(value)
                previous_bottom = line["bottom"]
    return text_clean("\n".join(output))


def writing_crop(year: int) -> str:
    # Regions in the separately retained 14-page candidate PDFs. Include the
    # complete visual and its original caption, but exclude the answer key.
    bounds = {
        2021: (140, 480, 350, 680),
        2022: (90, 395, 500, 635),
        2023: (165, 600, 420, 790),
        2024: (80, 535, 515, 770),
        2025: (100, 610, 500, 747),
        2026: (95, 550, 500, 755),
    }
    doc = pdfium.PdfDocument(WORK / "sources" / f"{year}-english1.pdf")
    page = doc[len(doc) - 1]
    image = page.render(scale=2).to_pil().convert("RGB")
    image = image.crop(tuple(round(value * 2) for value in bounds[year]))
    target = WORK / "writing-images" / f"{year}-writing.png"
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target)
    return target.relative_to(ROOT).as_posix()


def main() -> None:
    spec = importlib.util.spec_from_file_location("english_extractor", ROOT / "scripts/extract-english-papers-from-pdfs.py")
    assert spec and spec.loader
    extractor = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(extractor)
    extractor.ascii_clean = text_clean
    extractor.prose = prose
    answers = extractor.load_fallback_answers(str(ROOT / "data/english-papers/english1-2007-2026.json"))
    papers = []
    evidence = []
    for year in range(2021, 2027):
        if year == 2021:
            source = WORK / "sources/independent-2010-2024.pdf"
            page_range = (45, 59)
        elif year == 2022:
            source = WORK / "sources/independent-2010-2024.pdf"
            page_range = (30, 45)
        else:
            source = WORK / "sources" / f"{year}-english1.pdf"
            page_range = (0, 14)
        text = extract_layout_text(source, *page_range)
        (WORK / f"{year}-layout.txt").write_text(text, encoding="utf-8")
        # The PDF 52 diagrams are not prose. Exclude diagram labels from the
        # written requirements, and retain them as the separately rendered crop.
        text = re.sub(r"(\(20\s+points\))[\s\S]*$", r"\1", text)
        passages = [
            extractor.parse_cloze(text, answers[year]),
            *extractor.parse_reading(text, answers[year]),
            extractor.parse_new_type(text, answers[year]),
            extractor.parse_translation(text),
            *extractor.parse_writing(text, source, False, 1),
        ]
        new_type = next(p for p in passages if p["section"] == "new_type")
        for question in new_type["questions"]:
            number = question["questionNo"]
            match = re.search(rf"\({number}\)\s*([^\n]+)", new_type["content"])
            question["stem"] = match.group(1).strip() if match else number
        big = next(p for p in passages if p["passageNo"] == "big_writing")
        image_path = writing_crop(year)
        # Local-only attachment path; the candidate has not been published.
        image_marker = f"\n\n![{year} original writing visual]({image_path})"
        big["content"] += image_marker
        big["questions"][0]["stem"] += image_marker
        paper = {"year": year, "paperType": "english1", "totalScore": 100, "passages": passages}
        counts = [len(p["questions"]) for p in passages]
        if counts != [20, 5, 5, 5, 5, 5, 5, 1, 1]:
            raise ValueError(f"{year}: incomplete questions {counts}")
        if sum(q["score"] for p in passages for q in p["questions"]) != 100:
            raise ValueError(f"{year}: wrong score sum")
        papers.append(paper)
        evidence.append({
            "year": year,
            "textSource": source.relative_to(ROOT).as_posix(),
            "pages": [page_range[0] + 1, page_range[1]],
            "groups": len(passages),
            "questions": sum(counts),
            "paragraphs": {p["passageNo"]: len(p["content"].split("\n\n")) for p in passages},
            "writingVisual": image_path,
            "status": "candidate_requires_source_confirmation",
        })
        print(year, len(passages), sum(counts))
    OUTPUT.write_text(json.dumps({"papers": papers}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (WORK / "candidate-evidence.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
