const express = require('express');
const cors = require('cors');
const multer = require('multer');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '5mb' }));

const SPACING_X = 260;
const SPACING_Y = 120;

const createId = (() => {
  let counter = 1;
  return () => `node-${counter++}`;
})();

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/import', upload.single('file'), (req, res) => {
  try {
    const markdown = extractMarkdown(req);
    if (!markdown) {
      return res.status(400).json({ error: 'Se requiere un archivo .md o el campo markdown en el cuerpo.' });
    }
    const payload = parseMarkdown(markdown);
    res.json(payload);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudo procesar el archivo Markdown.' });
  }
});

app.post('/api/export', (req, res) => {
  try {
    const { nodes, edges } = req.body || {};
    if (!Array.isArray(nodes) || !Array.isArray(edges)) {
      return res.status(400).json({ error: 'Debe enviar nodos y edges válidos.' });
    }
    const markdown = buildMarkdown({ nodes, edges });
    res.json({ markdown });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudo generar el Markdown.' });
  }
});

app.listen(PORT, () => {
  console.log(`API escuchando en http://localhost:${PORT}`);
});

function extractMarkdown(req) {
  if (req.file && req.file.buffer) {
    return req.file.buffer.toString('utf-8');
  }
  if (typeof req.body?.markdown === 'string') {
    return req.body.markdown;
  }
  return '';
}

function parseMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  const nodes = [];
  const edges = [];
  const stack = [];
  const levelCount = {};
  let lastHeadingLevel = 1;

  const pushNode = (label, level) => {
    const trimmed = label.trim();
    if (!trimmed) return null;
    const id = createId();
    const position = {
      x: (level - 1) * SPACING_X,
      y: (levelCount[level] || 0) * SPACING_Y,
    };
    levelCount[level] = (levelCount[level] || 0) + 1;
    const node = {
      id,
      type: 'default',
      position,
      data: {
        label: trimmed,
        description: '',
        level,
      },
    };
    nodes.push(node);
    if (level > 1) {
      let parent = null;
      for (let idx = level - 2; idx >= 0; idx -= 1) {
        if (stack[idx]) {
          parent = stack[idx];
          break;
        }
      }
      if (!parent) {
        parent = stack[stack.length - 1];
      }
      if (parent) {
        edges.push({
          id: `e-${parent.id}-${id}`,
          source: parent.id,
          target: id,
          type: 'smoothstep',
        });
      }
    }
    stack[level - 1] = node;
    stack.length = level;
    return node;
  };

  lines.forEach((rawLine) => {
    const headingMatch = rawLine.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      lastHeadingLevel = level;
      pushNode(headingMatch[2], level);
      return;
    }

    const bulletMatch = rawLine.match(/^(\s*)[-*+]\s+(.*)$/);
    if (bulletMatch) {
      const indent = Math.floor((bulletMatch[1].length || 0) / 2);
      const level = Math.min(6, (lastHeadingLevel || 1) + indent + 1);
      pushNode(bulletMatch[2], level);
      return;
    }

    const trimmed = rawLine.trim();
    if (!trimmed) return;
    const current = stack[stack.length - 1];
    if (current) {
      const desc = current.data.description ? `${current.data.description}\n${trimmed}` : trimmed;
      current.data.description = desc;
    }
  });

  return {
    nodes,
    edges,
    summary: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
    },
  };
}

function buildMarkdown({ nodes = [], edges = [] }) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const parentMap = new Map(edges.map((edge) => [edge.target, edge.source]));
  const childrenMap = new Map();
  edges.forEach((edge) => {
    const list = childrenMap.get(edge.source) || [];
    list.push(edge.target);
    childrenMap.set(edge.source, list);
  });

  const roots = nodes
    .filter((node) => !parentMap.has(node.id))
    .sort((a, b) => a.position.y - b.position.y);

  const lines = [];
  roots.forEach((root) => traverse(root.id, 1, lines, childrenMap, nodeMap));
  return lines.join('\n');
}

function traverse(nodeId, depth, lines, childrenMap, nodeMap) {
  const node = nodeMap.get(nodeId);
  if (!node) return;
  const label = (node.data?.label || 'Nodo').trim();
  if (depth <= 3) {
    lines.push(`${'#'.repeat(depth)} ${label}`);
  } else {
    const indent = '  '.repeat(depth - 3);
    lines.push(`${indent}- ${label}`);
  }
  if (node.data?.description) {
    const descLines = node.data.description.split('\n').map((ln) => ln.trim()).filter(Boolean);
    descLines.forEach((text) => {
      const indent = '  '.repeat(Math.max(0, depth - 2));
      lines.push(`${indent}- ${text}`);
    });
  }

  const children = (childrenMap.get(nodeId) || [])
    .map((childId) => nodeMap.get(childId))
    .filter(Boolean)
    .sort((a, b) => a.position.y - b.position.y);

  children.forEach((child) => traverse(child.id, depth + 1, lines, childrenMap, nodeMap));
}
