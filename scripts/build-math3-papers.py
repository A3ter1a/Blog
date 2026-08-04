#!/usr/bin/env python3
"""Build a reviewable Math III paper manifest from local PDF sources.

The source PDFs are intentionally kept outside Git.  This script creates a
deterministic staging manifest for the fixed math_papers/math_paper_problems
tables; it does not write to Supabase.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from bisect import bisect_right
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import pdfplumber
from pypdf import PdfReader


EXPECTED_PROBLEMS = {
    **{year: 23 for year in range(2008, 2021)},
    2007: 24,
    **{year: 22 for year in range(2021, 2027)},
}

QUESTION_COUNTS = {
    2007: (10, 16),
    **{year: (8, 14) for year in range(2008, 2021)},
    **{year: (10, 16) for year in range(2021, 2027)},
}

SOURCE_URLS = {
    2007: "https://doc.kmf.com/ky_material/28/97/28973add16854269a27aec876cf5a739.pdf",
    2008: "https://doc.kmf.com/ky_material/52/3c/523cde93e65c70cf1c1fc2221cdd0d36.pdf",
    2009: "https://download.kaoyan.com/download-1011223p1",
    2010: "https://yz.chsi.com.cn/kyzx/kp/201001/20100112/61508921.html",
    2011: "https://zky.koocdn.com/guonei-college/picture/18f8b3136d1346f09c11d5c7f12923c1.pdf",
    2013: "https://doc.kmf.com/ky_material/e1/00/e100ea6157e4c89151d225c827052ab1.pdf",
    2015: "https://math.mnnu.edu.cn/__local/D/A1/DA/A84718DB997AF16E6FD59E8382C_7BA1EC3D_73895.pdf?e=.pdf",
    2016: "https://file.xdf.cn/uploads/160601/762_160601112442hUNiCbt77qmEYMwN.pdf",
    2017: "https://file.xdf.cn/uploads/161226/124_161226105701ryGYkt5xWE2zKD6q.pdf",
    2018: "https://file.xdf.cn/uploads/171224/708_171224143007vhrfpeD95dOYdsSd.pdf",
    2019: "https://file.xdf.cn/uploads/181223/182_181223170301v7zKkNtCEoMlvfgi.pdf",
    2020: "https://file.xdf.cn/uploads/191222/230_191222200043qwrgoTrX1yw1o01k.pdf",
    2021: "https://www.ztbu.edu.cn/uploadfile/files/2023/05/24/20230524103613832.pdf",
    2022: "https://static.kaoyan.cn/file/question/2022/11/21/ea56dcdee0a6c11644b67392eb61371f.pdf",
    2023: "https://edu.xaiu.edu.cn/__local/B/49/03/F0E77C313620BC074A2C3B2717D_F6E0CFA9_58447.pdf",
    2024: "https://edu.xaiu.edu.cn/__local/5/BB/C6/021099EEDB95E6436FF134C55A1_5223C927_453D5.pdf",
    2025: "https://m.juyingonline.com/upload/202412/23/202412231047354282.pdf",
    2026: "https://static.kaoyan.cn/file/question/2025/12/27/000fde2e45f4bafcc0bde33b16b8647b.pdf",
}

PRIVATE_USE_RE = re.compile(r"[\ue000-\uf8ff]")
QUESTION_MARKER_RE = re.compile(
    r"(?<![\d\w])(?:\(\s*(?P<paren>\d{1,2})\s*\)|（\s*(?P<full>\d{1,2})\s*）|(?P<plain>\d{1,2})\s*[、．.])"
)
ANSWER_LABEL_RE = re.compile(r"(?:【\s*答案\s*】|答案\s*[:：]?|【\s*参考答案\s*】)")
ANALYSIS_LABEL_RE = re.compile(r"(?:【\s*(?:解析|详解|分析)\s*】|(?:解析|详解|分析)\s*[:：]?)")
SCORE_RE = re.compile(r"本题(?:满分|分值)\s*([0-9]+(?:\.[0-9]+)?)\s*分")


@dataclass
class Document:
    path: Path | None
    text: str
    page_starts: list[int]
    page_count: int
    raw_length: int
    private_use_count: int

    def pages_for(self, start: int, end: int) -> list[int]:
        if not self.page_starts:
            return []
        first = bisect_right(self.page_starts, max(0, start))
        last = bisect_right(self.page_starts, max(start, end - 1))
        return list(range(max(1, first), max(first, last) + 1))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="从本地 PDF 生成数学三真题导入清单")
    parser.add_argument("--answer-dir", type=Path, required=True, help="答案解析 PDF 所在目录")
    parser.add_argument("--question-dir", type=Path, required=True, help="补充题目 PDF 或题目页所在目录")
    parser.add_argument("--output", type=Path, default=Path("data/math-papers/math3-2007-2026.json"))
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalize_text(value: str) -> tuple[str, int]:
    replacements = {
        "\uf028": "(",
        "\uf029": ")",
        "\uf02c": ",",
        "\uf061": "α",
        "\uf062": "β",
        "\uf063": "χ",
        "\uf064": "δ",
        "\uf065": "ε",
        "\uf066": "φ",
        "\uf067": "γ",
        "\uf06c": "λ",
        "\uf06d": "μ",
        "\uf070": "π",
        "\uf071": "θ",
        "\uf073": "σ",
        "\uf074": "τ",
        "\uf076": "ν",
        "\uf077": "ω",
        "\uf0b1": "±",
        "\uf0ae": "→",
        "\uf03d": "=",
        "\uf02d": "−",
        "\uf02b": "+",
        "\uf0a3": "≤",
        "\uf03e": "≥",
        "\uf0b9": "≠",
        "\uf0a5": "∞",
        "\uf0f2": "∫",
        "\uf0e5": "∑",
        "\uf0b7": "·",
        "\uf0b4": "×",
        "\uf0a2": "′",
        "\uf0b6": "∂",
        "\uf022": "∈",
        "\uf020": " ",
        "\uf0d7": "·",
        "\uf0a7": "·",
    }
    for source, target in replacements.items():
        value = value.replace(source, target)
    private_use_count = len(PRIVATE_USE_RE.findall(value))
    value = PRIVATE_USE_RE.sub("□", value)
    value = value.replace("\ufffd", "□")
    value = "".join(char for char in value if char in "\n\r\t" or ord(char) >= 32)
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n[ \t]+", "\n", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip(), private_use_count


def read_pdf(path: Path | None) -> Document:
    if path is None or not path.exists():
        return Document(path, "", [], 0, 0, 0)
    try:
        pages: list[str] = []
        try:
            with pdfplumber.open(path) as pdf:
                pages = [page.extract_text(x_tolerance=1, y_tolerance=3) or "" for page in pdf.pages]
        except Exception:
            reader = PdfReader(str(path))
            for page in reader.pages:
                try:
                    pages.append(page.extract_text() or "")
                except Exception:
                    pages.append("")
        normalized_pages: list[str] = []
        private_use_count = 0
        for page in pages:
            normalized, private_count = normalize_text(page)
            private_use_count += private_count
            normalized_pages.append(normalized)
        page_starts: list[int] = []
        combined: list[str] = []
        cursor = 0
        for index, page in enumerate(normalized_pages):
            page_starts.append(cursor)
            combined.append(page)
            cursor += len(page)
            if index < len(normalized_pages) - 1:
                combined.append("\n\n")
                cursor += 2
        combined_text = "".join(combined)
        return Document(path, combined_text, page_starts, len(pages), len(combined_text), private_use_count)
    except Exception:
        return Document(path, "", [], 0, 0, 0)


def find_year_file(directory: Path, year: int) -> Path | None:
    if not directory.exists():
        return None
    candidates = sorted(
        path for path in directory.glob(f"{year}*.pdf")
        if path.is_file() and "答案" not in path.name and "参考解析" not in path.name
    )
    if candidates:
        return candidates[0]
    # The user's answer directory uses Chinese names and is still a valid
    # fallback when no separate question booklet is available.
    candidates = sorted(path for path in directory.glob(f"{year}*.pdf") if path.is_file())
    return candidates[0] if candidates else None


def find_answer_file(directory: Path, year: int) -> Path | None:
    if not directory.exists():
        return None
    candidates = sorted(path for path in directory.glob(f"{year}*.pdf") if path.is_file())
    return candidates[0] if candidates else None


def marker_number(match: re.Match[str]) -> int:
    value = match.group("paren") or match.group("full") or match.group("plain")
    return int(value)


def find_sequential_markers(text: str, max_problem: int) -> list[re.Match[str]]:
    matches = list(QUESTION_MARKER_RE.finditer(text))
    selected: list[re.Match[str]] = []
    cursor = 0
    for number in range(1, max_problem + 1):
        candidates = [
            match for match in matches
            if match.start() >= cursor and marker_number(match) == number
        ]
        if not candidates:
            continue
        selected.append(candidates[0])
        cursor = candidates[0].end()
    return selected


def first_label_index(value: str, labels: Iterable[re.Pattern[str]]) -> int:
    positions = [match.start() for label in labels if (match := label.search(value))]
    return min(positions) if positions else len(value)


def clean_problem_prompt(value: str) -> str:
    value = re.sub(r"考研资料下载中心\s+https?://\S+", "", value)
    value = re.sub(r"(?:20\d{2}\s*)?研究生入学试题（数三）\s*\d*", "", value)
    value = re.sub(r"(?:数学试题(?:及解析)?\s*)?第\s*\d+\s*页（共\s*\d+\s*页）", "", value)
    value = re.sub(r"新东方(?:网考研频道|在线考研)\s+https?://\S+", "", value)
    value = re.sub(r"^(?:[一二三四五六七八九十]+[、.]|\d+\s+)?(?:选择题|填空题|解答题)\s*", "", value)
    value = re.sub(r"^[-—\s]+", "", value)
    value = value.replace("【 】", "").replace("【】", "")
    value = re.sub(r"\s+", " ", value).strip()
    return value


def extract_question_blocks(document: Document, max_problem: int) -> dict[int, tuple[str, list[int], int]]:
    if not document.text:
        return {}
    markers = find_sequential_markers(document.text, max_problem)
    result: dict[int, tuple[str, list[int], int]] = {}
    for index, marker in enumerate(markers):
        number = marker_number(marker)
        end = markers[index + 1].start() if index + 1 < len(markers) else len(document.text)
        raw_block = document.text[marker.end():end]
        prompt_end = first_label_index(raw_block, [ANSWER_LABEL_RE, ANALYSIS_LABEL_RE])
        prompt = clean_problem_prompt(raw_block[:prompt_end])
        result[number] = (prompt, document.pages_for(marker.start(), end), document.private_use_count)
    return result


def extract_answer_blocks(document: Document, max_problem: int) -> dict[int, tuple[str, list[int]]]:
    if not document.text:
        return {}
    markers = find_sequential_markers(document.text, max_problem)
    result: dict[int, tuple[str, list[int]]] = {}
    for index, marker in enumerate(markers):
        number = marker_number(marker)
        end = markers[index + 1].start() if index + 1 < len(markers) else len(document.text)
        raw_block = document.text[marker.end():end]
        answer_match = ANSWER_LABEL_RE.search(raw_block)
        analysis_match = ANALYSIS_LABEL_RE.search(raw_block)
        if answer_match:
            answer_start = answer_match.end()
            answer_end = analysis_match.start() if analysis_match and analysis_match.start() > answer_start else len(raw_block)
            answer = raw_block[answer_start:answer_end].strip()
            if len(answer) < 2 and analysis_match:
                answer = raw_block[analysis_match.end():].strip()
        elif analysis_match:
            answer = raw_block[analysis_match.end():].strip()
        else:
            answer = raw_block.strip()
        answer = re.sub(r"\s+", " ", answer).strip()
        if answer:
            result[number] = (answer, document.pages_for(marker.start(), end))
    return result


def score_for(year: int, number: int) -> float:
    choice_end, fill_end = QUESTION_COUNTS[year]
    if number <= choice_end:
        return 4.0 if year < 2021 else 5.0
    if number <= fill_end:
        return 4.0 if year < 2021 else 5.0
    if year == 2007:
        return {17: 10.0, 18: 11.0, 19: 11.0, 20: 10.0, 21: 11.0, 22: 11.0, 23: 11.0, 24: 11.0}.get(number, 11.0)
    if year < 2021:
        return {15: 10.0, 16: 10.0, 17: 10.0, 18: 10.0, 19: 10.0, 20: 11.0, 21: 11.0, 22: 11.0, 23: 11.0}.get(number, 10.0)
    return {17: 10.0, 18: 12.0, 19: 12.0, 20: 12.0, 21: 12.0, 22: 12.0}.get(number, 10.0)


def problem_type(year: int, number: int, prompt: str) -> str:
    choice_end, fill_end = QUESTION_COUNTS[year]
    if number <= choice_end:
        return "choice"
    if number <= fill_end:
        return "fill"
    return "proof" if "证明" in prompt else "calculation"


def is_placeholder(value: str) -> bool:
    return value.startswith("[") and value.endswith("]")


def build_paper(year: int, answer_dir: Path, question_dir: Path) -> dict:
    max_problem = EXPECTED_PROBLEMS[year]
    answer_path = find_answer_file(answer_dir, year)
    question_path = find_year_file(question_dir, year)

    answer_document = read_pdf(answer_path)
    question_document = read_pdf(question_path)
    answer_blocks = extract_answer_blocks(answer_document, max_problem)
    if len(answer_blocks) < max_problem // 2:
        question_answer_blocks = extract_answer_blocks(question_document, max_problem)
        for number, block in question_answer_blocks.items():
            answer_blocks.setdefault(number, block)
    question_blocks = extract_question_blocks(question_document, max_problem)

    # Some downloaded answer PDFs contain the full question before each answer.
    # Use it only when the separate question booklet has no usable block.
    if len(question_blocks) < max_problem:
        answer_question_blocks = extract_question_blocks(answer_document, max_problem)
        for number, block in answer_question_blocks.items():
            current = question_blocks.get(number)
            if current is None or len(current[0]) < len(block[0]):
                question_blocks[number] = block

    problems: list[dict] = []
    needs_visual_review: list[int] = []
    for number in range(1, max_problem + 1):
        prompt_info = question_blocks.get(number)
        answer_info = answer_blocks.get(number)
        prompt = prompt_info[0] if prompt_info else ""
        prompt_pages = prompt_info[1] if prompt_info else []
        standard_answer = answer_info[0] if answer_info else ""
        answer_pages = answer_info[1] if answer_info else []

        prompt_missing = len(prompt) < 12 or "答案" in prompt[:80] or "解析" in prompt[:80]
        answer_missing = len(standard_answer) < 2
        flags: list[str] = []
        if prompt_missing:
            prompt = f"[第 {number} 题题面未从 PDF 文本层确认；请核对来源文件第 {prompt_pages[0] if prompt_pages else '未知'} 页。]"
            flags.append("prompt_missing")
        if answer_missing:
            standard_answer = f"[第 {number} 题参考答案未从 PDF 文本层确认；请核对答案解析文件。]"
            flags.append("answer_missing")
        if "□" in prompt:
            flags.append("formula_or_matrix_glyphs")
        if year == 2010:
            flags.append("scanned_question_pages")
        if year in {2018, 2023, 2024} and number > (8 if year == 2018 else 0):
            flags.append("visual_formula_review")
        quality = "needs_visual_review" if flags else "verified"
        if quality != "verified":
            needs_visual_review.append(number)

        score = score_for(year, number)
        rubric = [{
            "criterion": "最终答案与官方参考答案一致，并按题目要求核对必要步骤",
            "maxScore": score,
        }]
        content_seed = json.dumps({
            "problemNo": number,
            "problemType": problem_type(year, number, prompt),
            "prompt": prompt,
            "standardAnswer": standard_answer,
            "scoringRubric": rubric,
            "maxScore": score,
        }, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        problems.append({
            "problemNo": number,
            "problemType": problem_type(year, number, prompt),
            "prompt": prompt,
            "standardAnswer": standard_answer,
            "scoringRubric": rubric,
            "maxScore": score,
            "contentVersion": 1,
            "contentChecksum": hashlib.sha256(content_seed.encode("utf-8")).hexdigest(),
            "sourcePages": sorted(set(prompt_pages or answer_pages)),
            "quality": quality,
            "qualityFlags": flags,
        })

    source_path = question_path or answer_path
    if source_path and source_path.exists():
        source_checksum = sha256_file(source_path)
    else:
        source_checksum = hashlib.sha256(f"math_3:{year}".encode("utf-8")).hexdigest()
    return {
        "examYear": year,
        "paperCode": "math_3",
        "title": f"{year} 年考研数学三真题",
        "sourceChecksum": source_checksum,
        "sourceUrl": SOURCE_URLS.get(year),
        "status": "active",
        "sourceFiles": [str(path) for path in [question_path, answer_path] if path],
        "quality": "needs_visual_review" if needs_visual_review else "verified",
        "qualityFlags": {"problemNos": needs_visual_review},
        "problems": problems,
    }


def main() -> int:
    args = parse_args()
    papers = [build_paper(year, args.answer_dir, args.question_dir) for year in range(2007, 2027)]
    payload = {
        "schemaVersion": 1,
        "paperCode": "math_3",
        "examYearRange": "2007-2026",
        "generatedBy": "scripts/build-math3-papers.py",
        "papers": papers,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    total_problems = sum(len(paper["problems"]) for paper in papers)
    visual_papers = [paper["examYear"] for paper in papers if paper["quality"] != "verified"]
    print(f"已生成数学三导入清单: papers={len(papers)}, problems={total_problems}")
    print(f"需要视觉复核的年份: {', '.join(map(str, visual_papers)) or '无'}")
    print(f"输出: {args.output.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
