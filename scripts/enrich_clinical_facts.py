#!/usr/bin/env python3
"""Enriquece preguntas con hechos clínicos basados en patrones simples."""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any, Dict, List


def load_patterns(path: Path) -> List[Dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    for item in data:
        item["regex"] = re.compile(item["pattern"], re.IGNORECASE)
    return data


def enrich_question(question: Dict[str, Any], patterns: List[Dict[str, Any]]) -> Dict[str, Any]:
    text = question.get("stem", "")
    entities: List[Dict[str, Any]] = question.get("clinical_entities", []) or []
    for pattern in patterns:
        for match in pattern["regex"].finditer(text):
            attributes = dict(pattern.get("attributes") or {})
            if pattern["type"] == "timeline" and match.groups():
                attributes["value"] = match.group(1)
            entity = {
                "type": pattern["type"],
                "value": pattern["label"],
                "text_span": match.group(0),
                "attributes": attributes,
            }
            entities.append(entity)
    question["clinical_entities"] = entities
    return question


def process(input_path: Path, output_path: Path, pattern_path: Path) -> None:
    questions = json.loads(input_path.read_text(encoding="utf-8"))
    patterns = load_patterns(pattern_path)
    enriched = [enrich_question(dict(q), patterns) for q in questions]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(enriched, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Enriquecidas {len(enriched)} preguntas → {output_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Añade clinical_entities a preguntas usando patrones configurables.")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--patterns", type=Path, default=Path("config/clinical_patterns.json"))
    args = parser.parse_args()
    process(args.input, args.output, args.patterns)


if __name__ == "__main__":
    main()
