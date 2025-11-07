# Pipeline de ingestión y exposición de preguntas

## 1. Ingesta
1. **Fuente**: archivos `.txt`, `.csv` u otros formatos planos.
2. **Parser** (`scripts/parse_questions.py`): produce JSON normalizado (`Question[]`).
3. **Enriquecimiento** (`scripts/enrich_clinical_facts.py`): agrega `clinical_entities` usando patrones (configurables) y, en el futuro, modelos NER.
4. **Validación**: se valida contra el esquema (`docs/ontology.md`). Errores se reportan y se guardan en un log de ETL.

## 2. Persistencia
### Tablas principales (PostgreSQL)
- `question` (`id`, `source_exam`, `year`, `domain`, `topic`, `subtopic`, `focus`, `stem`, `answer_key`, `answer_text`, `metadata` JSONB).
- `answer_option` (`id`, `question_id`, `label`, `text`, `linked_entity`).
- `clinical_fact` (`id`, `question_id`, `type`, `value`, `text_span`, `attributes` JSONB).
- `map` (mapas construidos por usuarios) y `map_node` (instancias de nodos, referencia a `question_id` o plantillas).
- `comment`, `rubric_score`, `attachment` para colaboración.

### Indices recomendados
- `GIN` en `question.metadata` y `clinical_fact.attributes` para filtros flexibles.
- `btree` compuestos (`domain`, `topic`, `year`) y `tsvector` para búsqueda textual del stem.

## 3. Exposición vía GraphQL
### Tipos
```graphql
type Question {
  id: ID!
  sourceExam: String!
  year: Int
  domain: String
  topic: String
  subtopic: String
  focus: String
  stem: String!
  options: [AnswerOption!]!
  answerKey: String!
  clinicalEntities: [ClinicalFact!]!
}

type AnswerOption {
  id: ID!
  text: String!
  linkedEntity: String
}

type ClinicalFact {
  type: String!
  value: String!
  textSpan: String!
  attributes: JSON
}

type MapNode {
  id: ID!
  question: Question
  template: NodeTemplate
  position: Point!
}
```

### Consultas
- `questions(filter: QuestionFilter): [Question!]!`
- `question(id: ID!): Question`
- `map(id: ID!): Map`
- `suggestDifferentials(facts: [ClinicalInput!]!): [Question!]!`

### Mutaciones
- `createMap`, `updateMapNode`, `addComment`, `scoreMap`.

## 4. Procesos batch
- **Sync Search Index**: replica `question` + `clinical_fact` hacia Elastic para queries tipo “rash reticulado AND fiebre”.
- **Materialized Views**: agregados por tema/año para dashboards.
- **Versionado**: cada import genera `ingestion_batch` para rastrear origen y permitir rollback si un dataset viene con errores.

## 5. Seguridad y auditoría
- Registros por institución (multitenancy). Columnas `tenant_id` en tablas principales.
- Control de acceso a mapas/preguntas según rol (residente, tutor, admin).
- Auditoría de cambios en mapas (triggers que guardan diff).
