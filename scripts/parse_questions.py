#!/usr/bin/env python3
"""Parser genérico para bancos de preguntas en formato texto estilo residentado."""
from __future__ import annotations

import argparse
import json
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import List, Optional

OPTION_RE = re.compile(r"^([A-Z])\)\s*(.+)$")
HEADER_RE = re.compile(r"Pregunta\s+(?P<number>\d+)\s*\((?P<label>[^)]+)\):", re.IGNORECASE)
META_RE = re.compile(r"^(?P<key>Área|Area|Tema|Subtema|Subtema específico|Subtema especifico):\s*(?P<value>.+)$", re.IGNORECASE)


@dataclass
class AnswerOption:
    id: str
    text: str
    linked_entity: Optional[str] = None


@dataclass
class Question:
    id: str
    source_exam: str
    year: Optional[int]
    number: int
    domain: Optional[str]
    topic: Optional[str]
    subtopic: Optional[str]
    focus: Optional[str]
    stem: str
    options: List[AnswerOption]
    answer_key: str
    answer_text: str
    clinical_entities: List[dict] = field(default_factory=list)
    reasoning_tags: List[str] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)


def normalize_spaces(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def parse_header(line: str) -> tuple[int, str, Optional[int]]:
    match = HEADER_RE.match(line)
    if not match:
        raise ValueError(f"No se pudo interpretar el encabezado: {line!r}")
    number = int(match.group("number"))
    label = match.group("label").strip()
    tokens = label.split()
    year = None
    exam = label
    if tokens:
        try:
            year = int(tokens[-1])
            exam = " ".join(tokens[:-1]) or tokens[-1]
        except ValueError:
            exam = label
    return number, exam.strip(), year


def parse_chunk(chunk: str) -> Question:
    lines = [ln.rstrip() for ln in chunk.splitlines() if ln.strip() or ln.startswith("Pregunta")]  # mantener encabezado
    header_line = next((ln for ln in lines if ln.lower().startswith("pregunta")), None)
    if not header_line:
        raise ValueError("Bloque sin encabezado de pregunta")
    number, exam, year = parse_header(header_line)

    meta = {}
    idx = lines.index(header_line) + 1
    while idx < len(lines):
        line = lines[idx].strip()
        meta_match = META_RE.match(line)
        if not meta_match:
            break
        key = meta_match.group("key").lower()
        value = meta_match.group("value").strip()
        meta[key] = value
        idx += 1
    # saltar línea en blanco si existe
    while idx < len(lines) and not lines[idx].strip():
        idx += 1

    # stem hasta encontrar una opción
    stem_lines: List[str] = []
    while idx < len(lines) and not OPTION_RE.match(lines[idx].strip()):
        stem_lines.append(lines[idx])
        idx += 1
    stem = "\n".join([ln.strip() for ln in stem_lines]).strip()

    options: List[AnswerOption] = []
    while idx < len(lines):
        line = lines[idx].strip()
        if line.lower().startswith("respuesta correcta"):
            break
        opt_match = OPTION_RE.match(line)
        if opt_match:
            opt_id, opt_text = opt_match.groups()
            options.append(AnswerOption(id=opt_id, text=opt_text.strip()))
        idx += 1

    answer_key = ""
    answer_text = ""
    answer_line = next((ln for ln in lines if ln.lower().startswith("respuesta correcta")), None)
    if answer_line:
        match = re.search(r"Respuesta correcta:\s*([A-Z])\)\s*(.+)$", answer_line, re.IGNORECASE)
        if match:
            answer_key = match.group(1).upper()
            answer_text = match.group(2).strip()

    qid = f"{(exam or 'EXAM').replace(' ', '').upper()}-{year or 'XXXX'}-{number:02d}"
    reasoning_tags = sorted({
        normalize_spaces(meta.get("subtema", "")),
        normalize_spaces(meta.get("subtema específico", meta.get("subtema especifico", ""))),
    } - {""})

    return Question(
        id=qid,
        source_exam=exam,
        year=year,
        number=number,
        domain=meta.get("área") or meta.get("area"),
        topic=meta.get("tema"),
        subtopic=meta.get("subtema"),
        focus=meta.get("subtema específico") or meta.get("subtema especifico"),
        stem=stem,
        options=options,
        answer_key=answer_key,
        answer_text=answer_text,
        reasoning_tags=reasoning_tags,
        metadata={
            "raw_header": header_line,
        },
    )


def parse_file(path: Path) -> List[Question]:
    text = path.read_text(encoding="utf-8")
    raw_chunks = [chunk.strip() for chunk in re.split(r"\n+─{10,}\n+", text) if chunk.strip()]
    questions = [parse_chunk(chunk) for chunk in raw_chunks]
    return questions


def questions_to_dicts(questions: List[Question]) -> List[dict]:
    payload = []
    for q in questions:
        data = asdict(q)
        data["options"] = [asdict(opt) for opt in q.options]
        payload.append(data)
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Parsea un archivo de preguntas en texto plano a JSON estructurado.")
    parser.add_argument("input", type=Path, help="Ruta del .txt origen")
    parser.add_argument("output", type=Path, help="Ruta de salida (.json)")
    args = parser.parse_args()

    questions = parse_file(args.input)
    data = questions_to_dicts(questions)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Se procesaron {len(data)} preguntas en {args.output}")


if __name__ == "__main__":
    main()
