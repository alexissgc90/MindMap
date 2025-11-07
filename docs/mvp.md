# MVP del editor de mapas clínicos

## Objetivo
Permitir que un residente importe un banco de preguntas estructurado y construya mapas conceptuales/árboles de decisión colaborativos que resuman diferenciales y resuelvan preguntas probables.

## Alcance funcional
1. **Gestión de datasets**
   - Subir/seleccionar colecciones (`Question`, `ClinicalFact`).
   - Filtrar por área/tema/subtema.
2. **Canvas**
   - Crear nodos desde plantillas o arrastrando preguntas.
   - Campos estructurados (edad, rash, timeline) autocompletados con los `clinical_entities` detectados.
   - Conectores para relaciones causa-efecto/dx diferencial.
   - Modo Focus y Outline sincronizados.
3. **Colaboración**
   - Comentarios anclados a nodos, @mentions, pins.
   - Notificaciones Slack/email.
4. **IA / Asistencias**
   - Brainstorming Hub: sugiere diferenciales según los hechos clínicos del nodo.
   - Generación de resúmenes y tarjetas Q&A.
5. **Evaluación**
   - Rúbrica automática (criterios MMAR) que puntúa el mapa y ofrece feedback inmediato.

## Componentes técnicos
- **Frontend**
  - React + Vite.
  - `react-flow` para canvas, `zustand` para estado, `quill/lexical` para notas.
  - `IndexedDB` para borradores offline.
- **Backend**
  - NestJS GraphQL + Prisma (PostgreSQL).
  - Socket.IO para coedición/comentarios en vivo.
  - Servicio IA (FastAPI) que orquesta modelos locales/API externas.

## Backlog inmediato (orden sugerido)
1. Configurar monorepo (pnpm + turbo) con packages `frontend`, `api`, `ai-service`.
2. Implementar importador inicial: endpoint `POST /questions/import` que consume `data/*.json`.
3. Exponer consultas básicas (`questions`, `question(id)`).
4. Prototipo canvas con React Flow + nodos basados en plantillas (ej. “Caso exantemático”).
5. Comentarios locales (sin tiempo real) + panel Outline.
6. Integración Slack (webhook) para notificaciones de comentarios.
7. Motor MMAR v1: calcular puntuación en backend y mostrar en UI.
8. Activar coedición y modo Focus/Presentación.
9. IA Brainstorming Hub (usar heurísticas + modelo GPT/LLM).

## Métricas de éxito
- Tiempo medio para mapear 5 preguntas < 15 minutos.
- ≥80% de nodos cuentan con hechos clínicos auto-rellenados.
- Feedback positivo (≥4/5) de al menos 3 residentes piloto.
