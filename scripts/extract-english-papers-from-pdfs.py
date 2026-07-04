#!/usr/bin/env python
"""Extract English I past-paper PDFs into the importer JSON shape.

This is intentionally a local preparation tool. It reads PDFs from a user
provided folder and writes JSON under data/english-papers/. The generated JSON
contains real past-paper content and is ignored by git.
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import re
import sys
import unicodedata
from pathlib import Path
from typing import Any

try:
    import pdfplumber
except ImportError as exc:  # pragma: no cover - environment guard
    raise SystemExit("Missing dependency: pdfplumber") from exc


VALID_YEARS = list(range(2007, 2027))
SUBJECTIVE_PLACEHOLDER = "主观题暂不自动评分；参考答案待校对后导入。"


SMART_REPLACEMENTS = {
    "\u2018": "'",
    "\u2019": "'",
    "\u201c": '"',
    "\u201d": '"',
    "\u2013": "-",
    "\u2014": "-",
    "\u2026": "...",
    "\u00a0": " ",
    "\ufb01": "fi",
    "\ufb02": "fl",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract English I 2007-2026 PDFs into english-papers JSON.",
    )
    parser.add_argument("--source", required=True, help="Folder containing YYYY*.pdf files.")
    parser.add_argument("--output", required=True, help="Output JSON path.")
    parser.add_argument(
        "--embed-writing-page-images",
        action="store_true",
        help="Embed each writing source page as a data URI in the big-writing content.",
    )
    parser.add_argument(
        "--image-scale",
        type=float,
        default=1.15,
        help="Scale for embedded writing page images.",
    )
    return parser.parse_args()


def replace_smart_chars(text: str) -> str:
    for source, target in SMART_REPLACEMENTS.items():
        text = text.replace(source, target)
    return text


def ascii_clean(text: str) -> str:
    text = replace_smart_chars(text)
    text = unicodedata.normalize("NFKD", text)
    text = "".join(char for char in text if ord(char) < 128)
    text = re.sub(r"\[\s*([A-H])\s*\]", r"[\1]", text)
    text = re.sub(r"(?<!\s)(\[[A-H]\])", r" \1", text)
    text = re.sub(r"\(\s*([A-H])\s*\)", r"(\1)", text)
    text = re.sub(r"(\w)-\s*\n\s*(\w)", r"\1\2", text)
    text = re.sub(r"(?<=[A-Za-z]):(?=[A-Za-z])", "", text)
    text = re.sub(r"\s+:\s+", " ", text)
    text = re.sub(r"\r\n?", "\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    cleaned_lines: list[str] = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if re.fullmatch(r"-?\d+\s*-\s*(?:\d+)?", line):
            continue
        if re.fullmatch(r"\(?\)?\s*-?\d+\s*-\s*\(?\s*\d+\s*\)?\s*:?", line):
            continue
        if re.fullmatch(r"[:;.,()\- ]+", line):
            continue
        if re.fullmatch(r"\d+\s*(?:/\s*\d+)?", line) and line not in {"1", "2", "3"}:
            continue
        if re.fullmatch(r"(?:English|I|II|III|\(|\)|-|\s)+", line):
            continue
        cleaned_lines.append(line)
    text = "\n".join(cleaned_lines)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def prose(text: str) -> str:
    text = ascii_clean(text)
    text = re.sub(r"(?m)^\s*$", "\n", text)
    parts = [part.strip() for part in re.split(r"\n\s*\n", text) if part.strip()]
    paragraphs: list[str] = []
    for part in parts:
        lines = [line.strip() for line in part.splitlines() if line.strip()]
        paragraphs.append(" ".join(lines))
    return "\n\n".join(paragraphs).strip()


def find_required(pattern: str, text: str, label: str, flags: int = re.I | re.S) -> re.Match[str]:
    match = re.search(pattern, text, flags)
    if not match:
        raise ValueError(f"Could not find {label}")
    return match


def section_slice(text: str, start_pattern: str, end_pattern: str, label: str) -> str:
    start = find_required(start_pattern, text, label, re.I | re.S)
    end = re.search(end_pattern, text[start.end() :], re.I | re.S)
    if not end:
        raise ValueError(f"Could not find end of {label}")
    return text[start.end() : start.end() + end.start()].strip()


def option_token_matches(text: str) -> list[re.Match[str]]:
    pattern = re.compile(r"(?:(?<=^)|(?<=\s)|(?<=\n))(?:\[([A-H])\]|\(([A-H])\)|([A-H])\.)\s*", re.M)
    return list(pattern.finditer(text))


def option_label(match: re.Match[str]) -> str:
    for group in match.groups():
        if group:
            return group
    return ""


def parse_options(block: str) -> tuple[str, list[dict[str, str]]]:
    matches = option_token_matches(block)
    if any(match.group(1) or match.group(2) for match in matches):
        matches = [match for match in matches if match.group(1) or match.group(2)]
    first_a = next((index for index, match in enumerate(matches) if option_label(match) == "A"), None)
    if first_a is not None:
        matches = matches[first_a:]
    if not matches:
        return prose(block), []

    stem = prose(block[: matches[0].start()])
    options: list[dict[str, str]] = []
    for index, match in enumerate(matches):
        label = option_label(match)
        next_start = matches[index + 1].start() if index + 1 < len(matches) else len(block)
        content = prose(block[match.end() : next_start])
        if label and content:
            options.append({"label": label, "content": content})
    return stem, options


def numbered_blocks(text: str, numbers: range) -> dict[int, str]:
    number_set = set(numbers)
    pattern = re.compile(r"(?:(?<=^)|(?<=\n)|(?<=\s))(\d{1,2})\.\s+", re.M)
    matches = [match for match in pattern.finditer(text) if int(match.group(1)) in number_set]
    blocks: dict[int, str] = {}
    for index, match in enumerate(matches):
        number = int(match.group(1))
        next_start = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        blocks[number] = text[match.end() : next_start].strip()
    return blocks


def parse_answer_key(answer_text: str) -> dict[int, str]:
    answers: dict[int, str] = {}
    clean = ascii_clean(answer_text)
    for match in re.finditer(r"(?<!\d)(\d{1,2})\.\s*([A-H])\b", clean):
        number = int(match.group(1))
        if 1 <= number <= 45:
            answers[number] = match.group(2)
    return answers


def parse_cloze(text: str, answers: dict[int, str]) -> dict[str, Any]:
    block = section_slice(
        text,
        r"Section\s+(?:I|)\s*Use of English",
        r"Section\s+(?:II|)\s*Reading Comprehension",
        "Use of English",
    )
    q_blocks = numbered_blocks(block, range(1, 21))
    first_question = min((block.find(f"{number}.") for number in q_blocks), default=-1)
    content = prose(block[:first_question] if first_question >= 0 else block)
    questions: list[dict[str, Any]] = []
    for number in range(1, 21):
        stem, options = parse_options(q_blocks.get(number, ""))
        questions.append(
            {
                "questionNo": str(number),
                "stem": stem or f"Blank {number}",
                "options": options,
                "standardAnswer": answers.get(number, ""),
                "score": 0.5,
                "sortOrder": number,
            },
        )
    return {
        "section": "cloze",
        "passageNo": "cloze",
        "title": "Use of English",
        "content": content,
        "totalScore": 10,
        "sortOrder": 10,
        "questions": questions,
    }


def parse_reading(text: str, answers: dict[int, str]) -> list[dict[str, Any]]:
    part_a = section_slice(text, r"Part\s+A\s+Directions:", r"Part\s+B\s+Directions:", "Reading Part A")
    text_matches = list(re.finditer(r"(?<![A-Za-z])Text\s+([1-4])\b", part_a))
    if len(text_matches) != 4:
        raise ValueError(f"Expected 4 reading texts, found {len(text_matches)}")

    passages: list[dict[str, Any]] = []
    for index, match in enumerate(text_matches):
        text_no = int(match.group(1))
        start = match.end()
        end = text_matches[index + 1].start() if index + 1 < len(text_matches) else len(part_a)
        text_block = part_a[start:end].strip()
        question_range = range(21 + (text_no - 1) * 5, 26 + (text_no - 1) * 5)
        q_blocks = numbered_blocks(text_block, question_range)
        first_question_pos = min(
            (text_block.find(f"{number}.") for number in q_blocks if text_block.find(f"{number}.") >= 0),
            default=-1,
        )
        content = prose(text_block[:first_question_pos] if first_question_pos >= 0 else text_block)
        questions: list[dict[str, Any]] = []
        for number in question_range:
            stem, options = parse_options(q_blocks.get(number, ""))
            questions.append(
                {
                    "questionNo": str(number),
                    "stem": stem,
                    "options": options,
                    "standardAnswer": answers.get(number, ""),
                    "score": 2,
                    "sortOrder": number,
                },
            )
        passages.append(
            {
                "section": "reading",
                "passageNo": f"text{text_no}",
                "title": f"Text {text_no}",
                "content": content,
                "totalScore": 10,
                "sortOrder": 19 + text_no,
                "questions": questions,
            },
        )
    return passages


def parse_new_type(text: str, answers: dict[int, str]) -> dict[str, Any]:
    block = section_slice(text, r"Part\s+B\s+Directions:", r"Part\s+C\s+Directions:", "Reading Part B")
    options_block = re.split(r"\n\s*(?:[A-H]\s+)?41\.\s*(?:42\.|[A-H]\b)", block, maxsplit=1)[0]
    _, options = parse_options(options_block)
    if not options:
        # Fallback: expose answer letters so the UI can still save attempts.
        letters = sorted({answers.get(number, "") for number in range(41, 46) if answers.get(number)})
        options = [{"label": letter, "content": letter} for letter in letters]

    questions = [
        {
            "questionNo": str(number),
            "stem": f"Choose the best option for blank {number}.",
            "options": options,
            "standardAnswer": answers.get(number, ""),
            "score": 2,
            "sortOrder": number,
        }
        for number in range(41, 46)
    ]
    return {
        "section": "new_type",
        "passageNo": "new_type",
        "title": "Part B",
        "content": prose(block),
        "totalScore": 10,
        "sortOrder": 40,
        "questions": questions,
    }


def parse_translation(text: str) -> dict[str, Any]:
    block = section_slice(text, r"Part\s+C\s+Directions:", r"Section\s+(?:III\s+)?Writing", "Reading Part C")
    segment_matches = list(re.finditer(r"\((4[6-9]|50)\)\s*", block))
    questions: list[dict[str, Any]] = []
    for index, match in enumerate(segment_matches):
        number = int(match.group(1))
        next_start = segment_matches[index + 1].start() if index + 1 < len(segment_matches) else len(block)
        segment = prose(block[match.end() : next_start])
        questions.append(
            {
                "questionNo": str(number),
                "stem": segment or f"Translate segment {number} into Chinese.",
                "options": [],
                "standardAnswer": SUBJECTIVE_PLACEHOLDER,
                "score": 2,
                "sortOrder": number,
            },
        )
    if len(questions) != 5:
        raise ValueError(f"Expected 5 translation segments, found {len(questions)}")
    return {
        "section": "translation",
        "passageNo": "translation",
        "title": "Part C",
        "content": prose(block),
        "totalScore": 10,
        "sortOrder": 50,
        "questions": questions,
    }


def render_writing_page_data_uri(pdf_path: Path, scale: float) -> str:
    try:
        import pypdfium2 as pdfium
    except ImportError as exc:  # pragma: no cover - environment guard
        raise SystemExit("Missing dependency for image embedding: pypdfium2") from exc

    document = pdfium.PdfDocument(str(pdf_path))
    page = document[len(document) - 2]
    image = page.render(scale=scale).to_pil().convert("RGB")
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=72, optimize=True)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"


def parse_writing(text: str, pdf_path: Path, embed_image: bool, image_scale: float) -> list[dict[str, Any]]:
    match = find_required(r"Section\s+(?:III\s+)?Writing", text, "Writing section", re.I | re.S)
    block = text[match.end() :].strip()
    block = re.split(r"\n\s*\d{4}\s*\n\s*Section\s+(?:I|)\s*Use of English", block, maxsplit=1, flags=re.I | re.S)[0]

    q51 = find_required(r"51\.\s*Directions:", block, "Writing question 51", re.I | re.S)
    q52 = find_required(r"52\.\s*Directions:", block, "Writing question 52", re.I | re.S)
    small = prose(block[q51.start() : q52.start()])
    big = prose(block[q52.start() :])

    if embed_image:
        data_uri = render_writing_page_data_uri(pdf_path, image_scale)
        big = f"{big}\n\n![Writing page image]({data_uri})"

    return [
        {
            "section": "writing",
            "passageNo": "small_writing",
            "title": "Part A",
            "content": small,
            "totalScore": 10,
            "sortOrder": 60,
            "questions": [
                {
                    "questionNo": "51",
                    "stem": small,
                    "options": [],
                    "standardAnswer": SUBJECTIVE_PLACEHOLDER,
                    "score": 10,
                    "sortOrder": 51,
                },
            ],
        },
        {
            "section": "writing",
            "passageNo": "big_writing",
            "title": "Part B",
            "content": big,
            "totalScore": 20,
            "sortOrder": 61,
            "questions": [
                {
                    "questionNo": "52",
                    "stem": big,
                    "options": [],
                    "standardAnswer": SUBJECTIVE_PLACEHOLDER,
                    "score": 20,
                    "sortOrder": 52,
                },
            ],
        },
    ]


def extract_pdf_text(pdf_path: Path) -> tuple[str, str]:
    with pdfplumber.open(pdf_path) as pdf:
        page_texts = [
            page.extract_text(x_tolerance=1, y_tolerance=3) or ""
            for page in pdf.pages
        ]
    if len(page_texts) < 2:
        raise ValueError(f"{pdf_path.name}: PDF has too few pages")
    question_text = ascii_clean("\n".join(page_texts[:-1]))
    answer_text = page_texts[-1]
    return question_text, answer_text


def expected_pdf(source_dir: Path, year: int) -> Path:
    matches = sorted(source_dir.glob(f"{year}*.pdf"))
    if len(matches) != 1:
        raise FileNotFoundError(f"Expected exactly one PDF for {year}, found {len(matches)}")
    return matches[0]


def validate_paper(paper: dict[str, Any]) -> list[str]:
    warnings: list[str] = []
    passages = {passage["passageNo"]: passage for passage in paper["passages"]}
    expected_counts = {
        "cloze": 20,
        "text1": 5,
        "text2": 5,
        "text3": 5,
        "text4": 5,
        "new_type": 5,
        "translation": 5,
        "small_writing": 1,
        "big_writing": 1,
    }
    for passage_no, expected in expected_counts.items():
        actual = len(passages.get(passage_no, {}).get("questions", []))
        if actual != expected:
            warnings.append(f"{paper['year']} {passage_no}: expected {expected} questions, got {actual}")

    for passage in paper["passages"]:
        for question in passage["questions"]:
            if not question["stem"]:
                warnings.append(f"{paper['year']} {passage['passageNo']} {question['questionNo']}: empty stem")
            if not question["standardAnswer"]:
                warnings.append(f"{paper['year']} {passage['passageNo']} {question['questionNo']}: empty answer")
            if passage["section"] in {"cloze", "reading"} and len(question["options"]) != 4:
                warnings.append(
                    f"{paper['year']} {passage['passageNo']} {question['questionNo']}: "
                    f"expected 4 options, got {len(question['options'])}",
                )
            if passage["section"] == "new_type" and len(question["options"]) < 5:
                warnings.append(
                    f"{paper['year']} new_type {question['questionNo']}: "
                    f"expected at least 5 options, got {len(question['options'])}",
                )
    return warnings


def parse_paper(pdf_path: Path, year: int, embed_image: bool, image_scale: float) -> tuple[dict[str, Any], list[str]]:
    question_text, answer_text = extract_pdf_text(pdf_path)
    answers = parse_answer_key(answer_text)
    missing_answers = [number for number in range(1, 46) if number not in answers]
    if missing_answers:
        raise ValueError(f"{year}: missing objective answers {missing_answers}")

    passages = [
        parse_cloze(question_text, answers),
        *parse_reading(question_text, answers),
        parse_new_type(question_text, answers),
        parse_translation(question_text),
        *parse_writing(question_text, pdf_path, embed_image, image_scale),
    ]
    paper = {
        "year": year,
        "paperType": "english1",
        "totalScore": 100,
        "passages": passages,
    }
    return paper, validate_paper(paper)


def main() -> int:
    args = parse_args()
    source_dir = Path(args.source)
    output_path = Path(args.output)
    if not source_dir.exists():
        raise SystemExit(f"Source folder not found: {source_dir}")

    papers: list[dict[str, Any]] = []
    all_warnings: list[str] = []
    for year in VALID_YEARS:
        pdf_path = expected_pdf(source_dir, year)
        paper, warnings = parse_paper(pdf_path, year, args.embed_writing_page_images, args.image_scale)
        papers.append(paper)
        all_warnings.extend(warnings)
        print(f"{year}: passages={len(paper['passages'])}, questions={sum(len(p['questions']) for p in paper['passages'])}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps({"papers": papers}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Wrote {output_path}")
    if all_warnings:
        print("\nWarnings:", file=sys.stderr)
        for warning in all_warnings:
            print(f"- {warning}", file=sys.stderr)
    return 0 if not all_warnings else 2


if __name__ == "__main__":
    raise SystemExit(main())
