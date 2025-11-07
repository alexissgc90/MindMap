# Arquitectura propuesta para la app tipo XMind enfocada a residentado

## 1. Visión general
- **Frontend**: SPA en React + TypeScript con canvas (React Flow/Konva) para el mapa, editor rich-text (Lexical) y vista Outline sincronizada. Offline-first mediante IndexedDB (Dexie) y service workers.
- **Backend**: Node.js (NestJS) con API GraphQL para entidades (`Question`, `NodeTemplate`, `Map`, `Comment`, `RubricScore`). WebSocket (Socket.IO) para coedición en tiempo real y presencia.
- **Persistencia**:
  - PostgreSQL para datos transaccionales y versionado de mapas.
  - Elastic/OpenSearch para búsquedas clínicas (por síntomas, etiología, complicaciones).
  - S3/OneDrive/GDrive para adjuntos, usando las integraciones tipo Xmind (refs en `xmind_search_pretty.json:54-68`).
- **Servicios de IA**: microservicio que consume LLM (local u hospedado) para Brainstorming Hub, generación de diferenciales, resúmenes estilo MindNode (`mindnode_features_pretty.json:1370-1383`) y evaluaciones automáticas basadas en rúbricas (MMAR).

## 2. Flujo de datos con el parser
1. Los bancos en texto plano se ingieren con `scripts/parse_questions.py` → generan JSON normalizado (`data/exantematicas.json`).
2. Un job ETL valida esquema vs `docs/ontology.md` y llena tablas `question`, `clinical_fact`, `answer_option`.
3. Los usuarios crean mapas seleccionando preguntas o plantillas (`NodeTemplate`). El editor genera nodos pre-poblados con campos clínicos (edad, morfología del rash, cronología). Esto habilita comparadores Sarampión/Rubéola/Roséola como los descritos en `Preguntas de exantemáticas.txt` (ej. líneas 1-132 y 446-483).
4. El motor de IA consume los `clinical_entities` para generar sugerencias de diagnósticos diferenciales, preguntas probables y resúmenes.
5. Los comentarios colaborativos se envían a Slack / email siguiendo el patrón observado en Xmind (`xmind_search_pretty.json:150-183`).

## 3. Módulos clave
- **Knowledge Service**: Expone GraphQL para consultar preguntas filtradas por `domain/topic`. Permite recombinar items para simulacros o mapas temáticos.
- **Mapping Engine**: Traductor entre `Question` y nodos del canvas. Soporta plantillas (timeline, arboles de decisión, comparadores) y Focus Mode tipo MindNode (`mindnode_features_pretty.json:1645-1674`).
- **Collaboration Service**: Maneja permisos, sesiones multiusuario, comentarios, pins y resolve status.
- **Analytics & MMAR Score**: Evalúa mapas vs rúbrica (`docs/ontology.md#rubricscore`) para dar feedback automático (por ejemplo, premiando cross-links entre complicaciones de varicela y manifestaciones neurológicas `Preguntas de exantemáticas.txt:426-444`).

## 4. Integraciones prioritarias
1. **Slack / Teams**: notificaciones de comentarios y recordatorios de estudio.
2. **Almacenamiento externo**: vincular guías PDF, imágenes dermatoscópicas, etc. (similar al flujo de Xmind `xmind_search_pretty.json:54-68`).
3. **Calendario / LMS**: sincronizar sesiones de repaso o simulacros.
4. **PubMed / guías clínicas**: anexar referencias directas a nodos (ver archivos `pubmed_39850290.txt`, `pubmed_19400964.txt`).

## 5. Roadmap inmediato
1. **Ampliar ontología** para otros temas (cardio, infectología) y definir diccionario de síntomas→atributos.
2. **Extraer hechos clínicos** automáticamente (NER + reglas) para poblar `clinical_entities` en `data/exantematicas.json`.
3. **Prototipo UI**: wireframes del canvas + Outline + vista de caso. Priorizar plantillas diferenciales.
4. **MVP colaborativo**: implementar comentarios/pins con @mentions y exportación Outline → documento, siguiendo patrones MindNode/Xmind.
5. **Pilotaje** con residentes: cargar ~200 preguntas, medir uso, recopilar feedback para iterar en motor de IA y rúbrica MMAR.
