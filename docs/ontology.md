# Ontología y modelo de datos para bancos de preguntas clínicas

## Objetivo
Contar con una estructura homogénea que permita:
1. Ingestar preguntas de múltiples áreas (no solo exantemáticas).
2. Reutilizar los mismos nodos en mapas conceptuales y flujos de decisión.
3. Alimentar motores de reglas/IA y rúbricas de evaluación (tipo MMAR).

## Entidades principales

### `Question`
| Campo | Tipo | Descripción |
| --- | --- | --- |
| `id` | string | Identificador único (ej. `RM-2014-01`). |
| `source_exam` | string | Nombre del examen/fuente. |
| `year` | integer | Año de la pregunta. |
| `domain` | enum | Sistema o área (Piel, Multisistémico, etc.). |
| `topic` | enum | Tema macro (Exantemáticas, Neonatología, etc.). |
| `subtopic` | enum | Subtema clínico (Sarampión, Varicela…). |
| `focus` | string | “Subtema específico” o habilidad evaluada. |
| `stem` | rich-text | Enunciado completo. |
| `options` | `AnswerOption[]` | Arreglo de alternativas. |
| `answer_key` | string | Letra o identificador de la alternativa correcta. |
| `clinical_entities` | `ClinicalFact[]` | Datos clínicos extraídos (síntomas, hallazgos, labs). |
| `reasoning_tags` | string[] | Etiquetas de habilidades (dx diferencial, epidemiología, tratamiento). |
| `media_refs` | `MediaRef[]` | Enlaces a imágenes/archivos asociados. |
| `difficulty` | enum | Básico / Intermedio / Avanzado (calculado o manual). |
| `metadata` | object | Campos libres (autor, nivel Bloom, etc.). |

### `AnswerOption`
| Campo | Tipo | Descripción |
| --- | --- | --- |
| `id` | string | Letra (`A`, `B`, …) o UUID. |
| `text` | string | Descripción de la alternativa. |
| `linked_entity` | string | Referencia a una entidad clínica (ej. `sarampion`). |

### `ClinicalFact`
| Campo | Tipo | Descripción |
| --- | --- | --- |
| `type` | enum | `symptom`, `sign`, `lab`, `imaging`, `epidemiology`, `timeline`, etc. |
| `value` | string | Texto normalizado (ej. `eritema morbiliforme`). |
| `attributes` | object | Subcampos como `location`, `onset`, `duration`, `pattern`. |
| `certainty` | enum | `reported`, `observed`, `implied`. |

### `NodeTemplate`
Define cómo mapear preguntas a nodos de mind-map/decision-tree.
| Campo | Tipo | Descripción |
| --- | --- | --- |
| `template_id` | string | Ej. `exantema_clasico`. |
| `required_fields` | string[] | Campos obligatorios (`rash_morfologia`, `fase_febril`, etc.). |
| `rules` | array | Reglas de inferencia (DSL) para sugerir diagnósticos, diferenciales o alertas. |
| `visual_preset` | object | Colores, íconos, layout. |

### `RubricScore`
Permite puntuar la calidad del mapa construido por el usuario.
| Campo | Tipo | Descripción |
| --- | --- | --- |
| `criterion` | enum | `concept_links`, `hierarchies`, `cross_links`, `examples`, `visuals`, `color_code`. |
| `score` | number (0-1) | Valor normalizado. |
| `evidence` | string | Texto o nodo que justifica la puntuación. |

## Taxonomía reusable

1. **Sistemas/Áreas**: `Piel`, `Neurológico`, `Cardiovascular`, `Respiratorio`, etc.
2. **Temas**: `Exantemáticas`, `Emergencias`, `Farmacología`, …
3. **Habilidades evaluadas**: `diagnostico`, `epidemiologia`, `complicaciones`, `tratamiento`, `prevencion`.
4. **Tipos de hechos clínicos**: `timeline`, `rash`, `fiebre`, `laboratorio`, `exposicion`, `vacunacion`, `complicacion`.
5. **Estados temporales**: `prodromos`, `aparicion_rash`, `resolucion`, `secuelas`.

Cada nueva base de preguntas solo necesita mapear sus campos nativos a esta ontología.

## Serialización
- **JSON normalizado**: cada `Question` se guarda como documento independiente.
- **JSON-LD / GraphQL**: recomendado para interoperar con motores de conocimiento y permitir referencias cruzadas entre entidades clínicas.
- **Indices de búsqueda**: usar `clinical_entities.value` y `reasoning_tags` como campos indexados para búsquedas sintomáticas.

## Compatibilidad con el editor
- Los nodos del mapa consumen `NodeTemplate` + datos de `Question`.
- El modo Outline se alimenta de la jerarquía `topic -> subtopic -> question`.
- El motor de IA puede usar `clinical_entities` para crear prompts estructurados.

## Extensiones futuras
- `LearningObjective` enlazado a cada pregunta.
- `EvidenceLink` para asociar guías o artículos (ej. enlaces PubMed).
- `AssessmentItem` para generar versiones simuladas con parámetros (edad, comorbilidades).
