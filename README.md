# MindMap

Aplicación tipo XMind/MindNode enfocada en mapas clínicos para residentado:

- **Frontend**: React + Vite + React Flow, nodos enriquecidos (colores por nivel, modo flashcard, inspector lateral, layouts mindmap/árbol/timeline, importación/exportación Markdown).
- **Backend**: API Express con endpoints `/api/import` y `/api/export` que traducen Markdown ↔ grafos.
- **Datos y scripts**: Parsers en `scripts/` para convertir bancos de preguntas a JSON (`data/`) y enriquecer hechos clínicos con patrones (`config/clinical_patterns.json`).

## Scripts principales

```bash
# raíz del repo
npm install          # instala dependencias de workspace, backend y frontend
npm run dev          # corre backend (4000) y frontend (5173) en paralelo
npm run build        # build backend y frontend
```

Para ejecutar cada paquete individualmente:
```bash
npm install --prefix backend
npm run dev --prefix backend   # API Express

npm install --prefix frontend
npm run dev --prefix frontend  # Vite + React Flow
```

## Requisitos

- Node.js 18+
- npm 10+
- (Opcional) Cuenta/Token GitHub para publicar en `origin`.

## Estructura del proyecto

```
backend/      # API Express import/export de Markdown
frontend/     # React Flow editor, panel Outline/Formato
data/         # Bancos de preguntas y mapas de ejemplo
docs/         # Arquitectura, ontología, pipeline
scripts/      # parseadores/enriquecedores de preguntas
```

## Próximos pasos sugeridos

1. Añadir licencia (por ejemplo, MIT) en la raíz.
2. Configurar despliegue (Vercel/Render) para frontend/backend.
3. Integrar autenticación y persistencia real (según `docs/architecture.md`).
