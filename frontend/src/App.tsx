import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ChangeEvent,
  DragEvent,
  MouseEvent as ReactMouseEvent,
  WheelEvent as ReactWheelEvent,
} from 'react';
import ReactFlow, { Background, Controls, MiniMap, MarkerType, applyEdgeChanges, applyNodeChanges } from 'reactflow';
import type { Connection, Edge, EdgeChange, Node, NodeChange, ReactFlowInstance } from 'reactflow';
import axios from 'axios';
import { nanoid } from 'nanoid';
import 'reactflow/dist/style.css';
import './App.css';
import MindNode from './components/MindNode';
import ContextMenu from './components/ContextMenu';
import { GraphActionsProvider } from './contexts/GraphActionsContext';
import type { NodeData } from './types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

const DEFAULT_NODE_WIDTH = 220;
const DEFAULT_BODY_WIDTH = 240;
const DEFAULT_NODE_HEIGHT = 70;
const DEFAULT_FONT_SIZE = 16;
const DEFAULT_FILL_COLOR = '#ffffff';
const DEFAULT_BORDER_WIDTH = 2;
const COLOR_PALETTE = ['#2362d1', '#2d9aff', '#50b5ff', '#6dd5ff', '#4b83ff', '#1c4ee0'];
const FONT_FAMILIES = [
  { label: 'Inter', value: 'Inter, system-ui' },
  { label: 'Roboto', value: 'Roboto, sans-serif' },
  { label: 'Merriweather', value: 'Merriweather, serif' },
  { label: 'JetBrains Mono', value: 'JetBrains Mono, monospace' },
];
const MAP_THEMES = [
  {
    id: 'fresh-blue',
    name: 'Fresh Blue',
    swatches: ['#1b4cbf', '#2362d1', '#2d9aff', '#4b83ff', '#71b7ff', '#a7d8ff'],
  },
  {
    id: 'coral',
    name: 'Coral',
    swatches: ['#f97316', '#f8b400', '#ff6f59', '#ffa987', '#ffc36a', '#ffe1a8'],
  },
  {
    id: 'olive',
    name: 'Olive',
    swatches: ['#3a7d44', '#73a942', '#aad576', '#395c6b', '#62929a', '#a3c4bc'],
  },
];
const APP_THEMES = {
  dark: { className: 'theme-dark' },
  light: { className: 'theme-light' },
};
const LAYOUT_SPACING_X = 260;
const LAYOUT_SPACING_Y = 140;
const SNAP_DISTANCE = 150;
const HISTORY_LIMIT = 100;
const BRANCH_COLORS = ['#FF7A18', '#FFB800', '#34C759', '#0EA5E9', '#5856D6', '#EC4899', '#FF6B6B', '#00B8D9'];

const hexToRgb = (hex: string) => {
  const normalized = hex.replace('#', '');
  const bigint = Number.parseInt(normalized.length === 3 ? normalized.repeat(2) : normalized, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
};

const rgbToHex = (r: number, g: number, b: number) =>
  `#${[r, g, b]
    .map((channel) => {
      const value = Math.max(0, Math.min(255, Math.round(channel)));
      return value.toString(16).padStart(2, '0');
    })
    .join('')}`;

const lightenColor = (hex: string, amount: number) => {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
};

const tintBranchColor = (hex: string, depth: number) => {
  const factor = Math.min(Math.max(depth, 0) * 0.08, 0.35);
  return lightenColor(hex, factor);
};

type MindMapNode = Node<NodeData>;
type MindMapEdge = Edge;
type LayoutMode = 'mindmap' | 'logic' | 'org' | 'tree' | 'timeline';
type HistoryEntry = { nodes: MindMapNode[]; edges: MindMapEdge[] };

type HistoryState = {
  entries: HistoryEntry[];
  index: number;
};

type ContextMenuState = {
  x: number;
  y: number;
  nodeId: string;
} | null;

type NewNodeInput = {
  position?: { x: number; y: number };
  data?: Partial<NodeData>;
};

type StyleScope = 'selected' | 'level1' | 'level2';
type FlashcardScope = 'selected' | 'branch' | 'selection' | 'level1' | 'level2plus' | 'floating' | 'all';

type EdgeStyleConfig = {
  stroke: string;
  strokeWidth: number;
  type: 'smoothstep' | 'straight' | 'step';
};

type ContextMenuItem = { action: string; label: string };

const FLASHCARD_SCOPE_OPTIONS: Array<{ value: FlashcardScope; label: string }> = [
  { value: 'selected', label: 'Tema seleccionado' },
  { value: 'branch', label: 'Rama del seleccionado' },
  { value: 'selection', label: 'Selección múltiple' },
  { value: 'level1', label: 'Nivel 1 (raíces)' },
  { value: 'level2plus', label: 'Niveles 2+' },
  { value: 'floating', label: 'Nodos flotantes' },
  { value: 'all', label: 'Todo el mapa' },
];

const getColorByLevel = (level = 1, custom?: string, palette = COLOR_PALETTE) =>
  custom ?? palette[(level - 1) % palette.length];

const deepCloneNodes = (nodes: MindMapNode[]): MindMapNode[] =>
  nodes.map((node) => ({
    ...node,
    data: { ...node.data },
    position: { ...node.position },
  }));

const deepCloneEdges = (edges: MindMapEdge[]): MindMapEdge[] => edges.map((edge) => ({ ...edge }));

const normalizeNodes = (incoming: MindMapNode[], palette = COLOR_PALETTE): MindMapNode[] =>
  incoming.map((node) => {
    const level = node.data?.level ?? 1;
    const accentColor = getColorByLevel(level, undefined, palette);
    const data: NodeData = { ...(node.data ?? {}) };
    data.label = data.label ?? 'Nodo';
    data.description = data.description ?? '';
    data.fontSize = data.fontSize ?? DEFAULT_FONT_SIZE;
    data.customColor = data.customColor ?? false;
    data.isEditing = data.isEditing ?? false;
    data.fillColor = data.fillColor ?? DEFAULT_FILL_COLOR;
    data.borderWidth = data.borderWidth ?? DEFAULT_BORDER_WIDTH;
    data.fontFamily = data.fontFamily ?? FONT_FAMILIES[0].value;
    data.fontWeight = data.fontWeight ?? 'bold';
    data.fontStyle = data.fontStyle ?? 'normal';
    data.textDecoration = data.textDecoration ?? 'none';
    data.highlightColor = data.highlightColor ?? '#00000000';
    data.bodyWidth = data.bodyWidth ?? DEFAULT_BODY_WIDTH;
    data.isFloating = data.isFloating ?? false;
    data.textColor = data.textColor ?? '#0f172a';
    data.flashcardMode = data.flashcardMode ?? false;
    data.isRevealed = data.isRevealed ?? true;
    data.level = data.level ?? level;
    if (data.customColor) {
      data.color = data.color ?? accentColor;
    } else {
      data.color = accentColor;
    }
    data.borderColor = data.borderColor ?? data.color ?? accentColor;
    return {
      ...node,
      width: node.width ?? DEFAULT_NODE_WIDTH,
      height: node.height ?? DEFAULT_NODE_HEIGHT,
      position: node.position ?? { x: 0, y: 0 },
      type: 'mindNode',
      hidden: node.hidden ?? false,
      data,
    };
  });

const cloneNodes = (nodes: MindMapNode[]): MindMapNode[] =>
  nodes.map((node) => ({
    ...node,
    position: { ...node.position },
    data: { ...node.data },
  }));

const mergeNodeState = (source: MindMapNode[], target: MindMapNode[]): MindMapNode[] =>
  target.map((node) => {
    const previous = source.find((candidate) => candidate.id === node.id);
    if (!previous) return node;
    return {
      ...node,
      hidden: previous.hidden ?? false,
      data: {
        ...previous.data,
        ...node.data,
      },
    };
  });

const shiftToPositiveQuadrant = (nodes: MindMapNode[]): MindMapNode[] => {
  if (!nodes.length) return nodes;
  const minX = Math.min(...nodes.map((node) => node.position.x));
  const minY = Math.min(...nodes.map((node) => node.position.y));
  const offsetX = minX < 40 ? 60 - minX : 0;
  const offsetY = minY < 40 ? 60 - minY : 0;
  return nodes.map((node) => ({
    ...node,
    position: {
      x: node.position.x + offsetX,
      y: node.position.y + offsetY,
    },
  }));
};

const buildGraphMaps = (nodes: MindMapNode[], edges: MindMapEdge[]) => {
  const childMap = new Map<string, string[]>();
  const parentMap = new Map<string, string>();
  edges.forEach((edge) => {
    const list = childMap.get(edge.source) ?? [];
    list.push(edge.target);
    childMap.set(edge.source, list);
    parentMap.set(edge.target, edge.source);
  });
  const orderIndex = new Map(nodes.map((node, idx) => [node.id, idx]));
  return { childMap, parentMap, orderIndex };
};

const collectSubtreeIds = (rootId: string, edges: MindMapEdge[]): Set<string> => {
  const childMap = new Map<string, string[]>();
  edges.forEach((edge) => {
    const list = childMap.get(edge.source) ?? [];
    list.push(edge.target);
    childMap.set(edge.source, list);
  });
  const stack = [rootId];
  const visited = new Set<string>();
  while (stack.length) {
    const current = stack.pop();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    const children = childMap.get(current) ?? [];
    children.forEach((child) => stack.push(child));
  }
  return visited;
};

const pickNodesByScope = (
  nodes: MindMapNode[],
  edges: MindMapEdge[],
  scope: FlashcardScope,
  selectedNodeId: string | null,
  selectedNodeIds: string[] = [],
): MindMapNode[] => {
  const primarySelected =
    selectedNodeIds[selectedNodeIds.length - 1] ?? selectedNodeId ?? selectedNodeIds[0] ?? null;
  switch (scope) {
    case 'selected':
      return primarySelected ? nodes.filter((node) => node.id === primarySelected) : [];
    case 'branch': {
      if (!primarySelected) return [];
      const subtree = collectSubtreeIds(primarySelected, edges);
      return nodes.filter((node) => subtree.has(node.id));
    }
    case 'selection': {
      if (!selectedNodeIds.length) return [];
      const selectedSet = new Set(selectedNodeIds);
      return nodes.filter((node) => selectedSet.has(node.id));
    }
    case 'level1':
      return nodes.filter((node) => (node.data?.level ?? 1) === 1);
    case 'level2plus':
      return nodes.filter((node) => (node.data?.level ?? 1) > 1);
    case 'floating':
      return nodes.filter((node) => node.data?.isFloating);
    case 'all':
    default:
      return nodes;
  }
};

const toggleBranchCollapse = (
  nodeId: string,
  collapse: boolean,
  nodes: MindMapNode[],
  edges: MindMapEdge[],
) => {
  const subtree = collectSubtreeIds(nodeId, edges);
  if (subtree.size <= 1) {
    return { nodes, edges };
  }

  const updatedNodes = nodes.map((node) => {
    if (!subtree.has(node.id)) return node;
    if (node.id === nodeId) {
      return {
        ...node,
        hidden: false,
        data: {
          ...node.data,
          isCollapsed: collapse,
          collapsedChildrenCount: collapse ? subtree.size - 1 : 0,
        },
      };
    }
    return {
      ...node,
      hidden: collapse,
    };
  });

  const updatedEdges = edges.map((edge) => {
    if (!subtree.has(edge.source) || !subtree.has(edge.target)) return edge;
    return {
      ...edge,
      hidden: collapse,
    };
  });

  return { nodes: updatedNodes, edges: updatedEdges };
};

const applyBranchMetadata = (
  nodes: MindMapNode[],
  edges: MindMapEdge[],
  options: { coloredBranches: boolean },
) => {
  const { childMap, parentMap } = buildGraphMaps(nodes, edges);
  const branchAssignments = new Map<string, string>();
  const nodeBranchColors = new Map<string, string>();
  const branchRoots: string[] = [];

  nodes.forEach((node) => {
    if (!parentMap.has(node.id)) {
      const children = childMap.get(node.id) ?? [];
      if (!children.length) {
        branchRoots.push(node.id);
      } else {
        children.forEach((childId) => branchRoots.push(childId));
      }
    }
  });

  const branchColorLookup = new Map<string, string>();
  branchRoots.forEach((branchId, index) => {
    const color = BRANCH_COLORS[index % BRANCH_COLORS.length];
    branchColorLookup.set(branchId, color);
  });

  const assignBranch = (nodeId: string, branchId: string, depth: number) => {
    branchAssignments.set(nodeId, branchId);
    const branchColor = branchColorLookup.get(branchId);
    if (branchColor) {
      nodeBranchColors.set(nodeId, tintBranchColor(branchColor, depth));
    }
    const children = childMap.get(nodeId) ?? [];
    children.forEach((childId) => assignBranch(childId, branchId, depth + 1));
  };

  nodes.forEach((node) => {
    if (!parentMap.has(node.id)) {
      const children = childMap.get(node.id) ?? [];
      if (!children.length) {
        if (!branchColorLookup.has(node.id)) {
          branchColorLookup.set(node.id, BRANCH_COLORS[branchColorLookup.size % BRANCH_COLORS.length]);
        }
        assignBranch(node.id, node.id, 0);
      } else {
        children.forEach((childId) => {
          if (!branchColorLookup.has(childId)) {
            branchColorLookup.set(childId, BRANCH_COLORS[branchColorLookup.size % BRANCH_COLORS.length]);
          }
          assignBranch(childId, childId, 0);
        });
      }
    }
  });

  nodes.forEach((node) => {
    if (!branchAssignments.has(node.id)) {
      branchColorLookup.set(node.id, branchColorLookup.get(node.id) ?? BRANCH_COLORS[branchColorLookup.size % BRANCH_COLORS.length]);
      assignBranch(node.id, node.id, 0);
    }
  });

  const enhancedNodes = nodes.map((node) => {
    const branchKey = branchAssignments.get(node.id) ?? node.id;
    const branchColor = nodeBranchColors.get(node.id);
    const data: NodeData = {
      ...node.data,
      branchKey,
      branchColor,
      childCount: (childMap.get(node.id) ?? []).length,
      collapsedChildrenCount: node.data?.isCollapsed ? node.data?.collapsedChildrenCount ?? 0 : 0,
    };
    if (options.coloredBranches && !data.customColor && branchColor) {
      data.color = branchColor;
      data.borderColor = branchColor;
    }
    return {
      ...node,
      hidden: node.hidden ?? false,
      data,
    };
  });

  return { nodes: enhancedNodes, nodeBranchColors };
};

const setFloatingStateForSubtree = (
  nodes: MindMapNode[],
  subtree: Set<string>,
  isFloating: boolean,
): MindMapNode[] =>
  nodes.map((node) =>
    subtree.has(node.id)
      ? {
          ...node,
          data: {
            ...node.data,
            isFloating,
          },
        }
      : node,
  );

const positionSubtreeNearParent = (
  nodes: MindMapNode[],
  rootId: string,
  parentId: string,
  edges: MindMapEdge[],
): MindMapNode[] => {
  const parentNode = nodes.find((node) => node.id === parentId);
  const rootNode = nodes.find((node) => node.id === rootId);
  if (!parentNode || !rootNode) return nodes;
  const siblings = edges.filter((edge) => edge.source === parentId && edge.target !== rootId).length;
  const targetX = parentNode.position.x + LAYOUT_SPACING_X * 0.8;
  const targetY = parentNode.position.y + siblings * (DEFAULT_NODE_HEIGHT + 40);
  const deltaX = targetX - rootNode.position.x;
  const deltaY = targetY - rootNode.position.y;
  const subtree = collectSubtreeIds(rootId, edges);
  return nodes.map((node) =>
    subtree.has(node.id)
      ? {
          ...node,
          position: {
            x: node.position.x + deltaX,
            y: node.position.y + deltaY,
          },
        }
      : node,
  );
};

const applyTreeLayout = (
  nodes: MindMapNode[],
  edges: MindMapEdge[],
  options: { orientation?: 'LR' | 'TB'; spacingX?: number; spacingY?: number } = {},
) => {
  const { orientation = 'LR', spacingX = LAYOUT_SPACING_X, spacingY = LAYOUT_SPACING_Y } = options;
  const layoutNodes = cloneNodes(nodes);
  const { childMap, parentMap, orderIndex } = buildGraphMaps(layoutNodes, edges);
  const sortByOrder = (ids: string[]) => ids.sort((a, b) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0));

  const levelSpacing =
    (orientation === 'TB' ? spacingY : spacingX) +
    (orientation === 'TB' ? DEFAULT_NODE_HEIGHT : DEFAULT_NODE_WIDTH) * 0.5;
  const crossSpacing =
    (orientation === 'TB' ? spacingX : spacingY) +
    (orientation === 'TB' ? DEFAULT_NODE_WIDTH : DEFAULT_NODE_HEIGHT) * 0.8;

  const roots = layoutNodes
    .filter((node) => !parentMap.has(node.id))
    .sort((a, b) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0));

  let currentLine = 0;
  const visited = new Set<string>();

  const assignPositions = (nodeId: string, depth: number): number => {
    const node = layoutNodes.find((n) => n.id === nodeId);
    if (!node) return currentLine;
    visited.add(nodeId);
    const children = sortByOrder([...(childMap.get(nodeId) ?? [])]);

    if (!children.length) {
      const orderCoord = currentLine;
      node.position =
        orientation === 'TB'
          ? { x: orderCoord, y: depth * levelSpacing }
          : { x: depth * levelSpacing, y: orderCoord };
      node.data = { ...node.data, level: depth + 1 };
      currentLine += crossSpacing;
      return orderCoord;
    }

    const childCoords = children.map((childId) => assignPositions(childId, depth + 1));
    const minCoord = childCoords[0];
    const maxCoord = childCoords[childCoords.length - 1];
    const orderCoord = (minCoord + maxCoord) / 2;
    node.position =
      orientation === 'TB'
        ? { x: orderCoord, y: depth * levelSpacing }
        : { x: depth * levelSpacing, y: orderCoord };
    node.data = { ...node.data, level: depth + 1 };
    return orderCoord;
  };

  const layoutRoot = (nodeId: string) => {
    const startLine = currentLine;
    assignPositions(nodeId, 0);
    if (currentLine === startLine) {
      currentLine += crossSpacing;
    }
  };

  roots.forEach((root) => layoutRoot(root.id));

  layoutNodes
    .filter((node) => !visited.has(node.id))
    .sort((a, b) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0))
    .forEach((node) => layoutRoot(node.id));

  return shiftToPositiveQuadrant(layoutNodes);
};

const applyMindmapLayout = (nodes: MindMapNode[], edges: MindMapEdge[]) => {
  const layoutNodes = cloneNodes(nodes);
  if (!layoutNodes.length) return layoutNodes;

  const { childMap, parentMap, orderIndex } = buildGraphMaps(layoutNodes, edges);
  const roots = layoutNodes.filter((node) => !parentMap.has(node.id));
  const primaryRoot = (roots.length ? roots : [layoutNodes[0]])[0];
  const center = { x: 0, y: 0 };
  const radiusBase = 260;
  const radiusStep = 200;
  const visited = new Set<string>();

  const setPosition = (nodeId: string, angle: number, depth: number) => {
    const node = layoutNodes.find((n) => n.id === nodeId);
    if (!node) return;
    const radius = depth === 0 ? 0 : radiusBase + (depth - 1) * radiusStep;
    const radialOffset = depth > 1 ? (LAYOUT_SPACING_X * 0.18) : 0;
    node.position = {
      x: center.x + (radius + radialOffset) * Math.cos(angle),
      y: center.y + (radius + radialOffset) * Math.sin(angle),
    };
    node.data = { ...node.data, level: depth + 1 };
  };

  const layoutBranch = (nodeId: string, angle: number, depth: number, hemisphere: 1 | -1) => {
    visited.add(nodeId);
    setPosition(nodeId, angle, depth);
    const children = [...(childMap.get(nodeId) ?? [])].sort(
      (a, b) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0),
    );
    if (!children.length) return;
    const spread = depth <= 1 ? Math.PI / 3 : Math.PI / 4;
    const startAngle = angle - (spread / 2) * hemisphere;
    const step = children.length > 1 ? (spread * hemisphere) / (children.length - 1) : 0;
    children.forEach((childId, index) => {
      const jitter = children.length > 1 ? (index - (children.length - 1) / 2) * 0.03 : 0;
      const childAngle = children.length > 1 ? startAngle + step * index + jitter : angle;
      layoutBranch(childId, childAngle, depth + 1, hemisphere);
    });
  };

  const layoutMainBranches = () => {
    setPosition(primaryRoot.id, 0, 0);
    visited.add(primaryRoot.id);
    const mainChildren = [...(childMap.get(primaryRoot.id) ?? [])].sort(
      (a, b) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0),
    );
    if (!mainChildren.length) return;
    const splitIndex = Math.ceil(mainChildren.length / 2);
    const rightChildren = mainChildren.slice(0, splitIndex);
    const leftChildren = mainChildren.slice(splitIndex);

    const distribute = (items: string[], centerAngle: number, spread: number, hemisphere: 1 | -1) => {
      if (!items.length) return;
      const startAngle = centerAngle - (spread / 2) * hemisphere;
      const step = items.length > 1 ? (spread * hemisphere) / (items.length - 1) : 0;
      items.forEach((childId, idx) => {
        const childAngle = items.length > 1 ? startAngle + step * idx : centerAngle;
        layoutBranch(childId, childAngle, 1, hemisphere);
      });
    };

    distribute(rightChildren, 0, Math.PI / 2, 1);
    distribute(leftChildren, Math.PI, Math.PI / 2, -1);
  };

  layoutMainBranches();

  layoutNodes
    .filter((node) => !visited.has(node.id))
    .forEach((node, index) => {
      const angle = (index / Math.max(1, layoutNodes.length)) * 2 * Math.PI;
      layoutBranch(node.id, angle, node.data?.level ?? 2, angle >= -Math.PI / 2 && angle <= Math.PI / 2 ? 1 : -1);
    });

  return shiftToPositiveQuadrant(layoutNodes);
};

const applyTimelineLayout = (nodes: MindMapNode[]) => {
  const layoutNodes = cloneNodes(nodes);
  return layoutNodes
    .sort((a, b) => (a.data?.level ?? 0) - (b.data?.level ?? 0))
    .map((node, index) => ({
      ...node,
      position: {
        x: index * (LAYOUT_SPACING_X * 0.9),
        y: (node.data?.level ?? 1) * 40,
      },
    }));
};

const createInitialNodes = () =>
  normalizeNodes([
    {
      id: nanoid(8),
      type: 'mindNode',
      position: { x: 0, y: 0 },
      data: { label: 'Tema principal', level: 1 },
    } as MindMapNode,
  ]);

const getOutlineLabel = (node: MindMapNode) => `${'• '.repeat(Math.max(1, node.data?.level ?? 1))}${node.data?.label}`;

const App = () => {
  const [nodes, setNodes] = useState<MindMapNode[]>(() => createInitialNodes());
  const [edges, setEdges] = useState<MindMapEdge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const contextMenuItems = useMemo<ContextMenuItem[] | undefined>(() => {
    if (!contextMenu?.nodeId) return undefined;
    const node = nodes.find((candidate) => candidate.id === contextMenu.nodeId);
    if (!node) return undefined;
    const hasChildren = (node.data?.childCount ?? 0) > 0;
    const items: ContextMenuItem[] = [
      { action: 'add-child', label: 'Agregar subtema' },
      { action: 'add-sibling', label: 'Agregar tema hermano' },
      { action: 'add-floating', label: 'Agregar tema flotante' },
      { action: 'duplicate', label: 'Duplicar' },
      { action: 'delete', label: 'Eliminar' },
    ];
    if (hasChildren) {
      items.push({
        action: node.data?.isCollapsed ? 'unfold-branch' : 'fold-branch',
        label: node.data?.isCollapsed ? 'Desplegar rama' : 'Plegar rama',
      });
    }
    items.push({ action: 'show-branch', label: 'Mostrar solo esta rama' });
    items.push({ action: 'export-branch', label: 'Exportar rama (Markdown)' });
    return items;
  }, [contextMenu?.nodeId, nodes]);
  const [markdownInput, setMarkdownInput] = useState('');
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('mindmap');
  const [paletteId, setPaletteId] = useState(MAP_THEMES[0].id);
  const [appTheme, setAppTheme] = useState<keyof typeof APP_THEMES>('dark');
  const [dropActive, setDropActive] = useState(false);
  const [outlineFilter, setOutlineFilter] = useState('');
  const [{ entries: historyEntries, index: historyIndex }, setHistoryState] = useState<HistoryState>({
    entries: [],
    index: -1,
  });
  const [status, setStatus] = useState({ text: 'Listo', loading: false });
  const reactFlowWrapper = useRef<HTMLDivElement | null>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const branchColorMapRef = useRef<Map<string, string>>(new Map());
  const initializedHistoryRef = useRef(false);
  const [formatPanelOpen, setFormatPanelOpen] = useState(true);
  const [formatSectionsOpen, setFormatSectionsOpen] = useState({
    style: true,
    presentation: false,
    map: true,
  });
  const [styleTab, setStyleTab] = useState<'shape' | 'text' | 'structure' | 'branching'>('shape');
  const [styleScope, setStyleScope] = useState<StyleScope>('selected');
  const [flashcardScope, setFlashcardScope] = useState<FlashcardScope>('selected');
  const [edgeStyleConfig, setEdgeStyleConfig] = useState<EdgeStyleConfig>({
    stroke: '#94a3b8',
    strokeWidth: 2,
    type: 'smoothstep',
  });
  const [showMiniMap, setShowMiniMap] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [showBackgroundGrid, setShowBackgroundGrid] = useState(true);
  const [showSnapLines, setShowSnapLines] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(true);
  const [coloredBranches, setColoredBranches] = useState(true);
  const [branchFocusId, setBranchFocusId] = useState<string | null>(null);
  const selectedNodeIds = useMemo(() => {
    const activeSelections = nodes.filter((node) => node.selected).map((node) => node.id);
    if (!activeSelections.length && selectedNodeId) {
      return [selectedNodeId];
    }
    return activeSelections;
  }, [nodes, selectedNodeId]);

  useEffect(() => {
    if (!selectedNodeIds.length) {
      setSelectedNodeId(null);
    } else if (!selectedNodeId || !selectedNodeIds.includes(selectedNodeId)) {
      setSelectedNodeId(selectedNodeIds[selectedNodeIds.length - 1]);
    }
  }, [selectedNodeId, selectedNodeIds]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  useEffect(() => {
    if (branchFocusId && !nodes.some((node) => node.id === branchFocusId)) {
      setBranchFocusId(null);
    }
  }, [branchFocusId, nodes]);

  const activePalette = useMemo(
    () => MAP_THEMES.find((theme) => theme.id === paletteId)?.swatches ?? COLOR_PALETTE,
    [paletteId],
  );

  const restyleEdges = useCallback(
    (
      incoming: MindMapEdge[],
      config: EdgeStyleConfig,
      branchColorMap: Map<string, string>,
      useBranchColors: boolean,
    ) =>
      incoming.map((edge) => {
        const branchStroke = useBranchColors
          ? branchColorMap.get(edge.target) ?? branchColorMap.get(edge.source)
          : undefined;
        const stroke = branchStroke ?? config.stroke;
        return {
          ...edge,
          type: config.type,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: stroke,
          },
          style: {
            ...(edge.style ?? {}),
            stroke,
            strokeWidth: config.strokeWidth,
          },
          hidden: edge.hidden ?? false,
        };
      }),
    [],
  );

  const pushHistoryEntry = useCallback((snapshotNodes: MindMapNode[], snapshotEdges: MindMapEdge[]) => {
    setHistoryState((prev) => {
      const trimmed = prev.entries.slice(0, prev.index + 1);
      const entry = {
        nodes: deepCloneNodes(snapshotNodes),
        edges: deepCloneEdges(snapshotEdges),
      };
      const updated = [...trimmed, entry].slice(-HISTORY_LIMIT);
      return {
        entries: updated,
        index: updated.length - 1,
      };
    });
  }, []);

  useEffect(() => {
    if (initializedHistoryRef.current) return;
    pushHistoryEntry(nodes, edges);
    initializedHistoryRef.current = true;
  }, [edges, nodes, pushHistoryEntry]);

  type CommitOptions = {
    pushHistory?: boolean;
    skipNormalization?: boolean;
    edgeConfig?: EdgeStyleConfig;
  };

  const commitGraph = useCallback(
    (nextNodes: MindMapNode[], nextEdges: MindMapEdge[], options: CommitOptions = {}) => {
      const preparedNodes = options.skipNormalization
        ? nextNodes.map((node) => ({
            ...node,
            data: { ...node.data },
          }))
        : normalizeNodes(nextNodes, activePalette);
      const preparedEdges = nextEdges.map((edge) => ({
        ...edge,
        hidden: edge.hidden ?? false,
      }));
      const { nodes: enhancedNodes, nodeBranchColors } = applyBranchMetadata(preparedNodes, preparedEdges, {
        coloredBranches,
      });
      const styledEdges = restyleEdges(
        preparedEdges,
        options.edgeConfig ?? edgeStyleConfig,
        nodeBranchColors,
        coloredBranches,
      );
      branchColorMapRef.current = nodeBranchColors;
      setNodes(enhancedNodes);
      setEdges(styledEdges);
      if (options.pushHistory !== false) {
        pushHistoryEntry(enhancedNodes, styledEdges);
      }
    },
    [activePalette, coloredBranches, edgeStyleConfig, pushHistoryEntry, restyleEdges],
  );

  useEffect(() => {
    commitGraph(nodesRef.current, edgesRef.current, { pushHistory: false });
  }, [activePalette, commitGraph]);

  useEffect(() => {
    commitGraph(nodesRef.current, edgesRef.current, {
      pushHistory: false,
      skipNormalization: coloredBranches,
    });
  }, [coloredBranches, commitGraph]);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );

  const focusedNode = useMemo(
    () => (branchFocusId ? nodes.find((node) => node.id === branchFocusId) ?? null : null),
    [branchFocusId, nodes],
  );

  const branchFocusSet = useMemo(() => {
    if (!branchFocusId) return null;
    return collectSubtreeIds(branchFocusId, edges);
  }, [branchFocusId, edges]);

  const visibleNodes = useMemo(
    () => nodes.filter((node) => !node.hidden && (!branchFocusSet || branchFocusSet.has(node.id))),
    [branchFocusSet, nodes],
  );

  const visibleEdges = useMemo(
    () =>
      edges.filter(
        (edge) =>
          !edge.hidden &&
          (!branchFocusSet || (branchFocusSet.has(edge.source) && branchFocusSet.has(edge.target))),
      ),
    [branchFocusSet, edges],
  );

  const floatingNodes = useMemo(
    () => visibleNodes.filter((node) => node.data?.isFloating),
    [visibleNodes],
  );

  const stats = useMemo(
    () => ({
      nodes: visibleNodes.length,
      edges: visibleEdges.length,
      floating: floatingNodes.length,
      flashcards: visibleNodes.filter((node) => node.data?.flashcardMode).length,
    }),
    [floatingNodes.length, visibleEdges.length, visibleNodes],
  );

  const flashcardScopeTargets = useMemo(
    () => pickNodesByScope(nodes, edges, flashcardScope, selectedNodeId, selectedNodeIds),
    [edges, flashcardScope, nodes, selectedNodeId, selectedNodeIds],
  );

  const flashcardActiveTargets = useMemo(
    () => flashcardScopeTargets.filter((node) => node.data?.flashcardMode),
    [flashcardScopeTargets],
  );

  const flashcardNeedsSelection =
    flashcardScope === 'selection'
      ? selectedNodeIds.length === 0
      : (flashcardScope === 'selected' || flashcardScope === 'branch') && !selectedNodeId;

  const getScopedNodeIds = useCallback(
    (scope: StyleScope) => {
      const currentNodes = nodesRef.current;
      if (scope === 'selected') {
        return selectedNodeId ? [selectedNodeId] : [];
      }
      if (scope === 'level1') {
        return currentNodes
          .filter((node) => (node.data?.level ?? 1) === 1)
          .map((node) => node.id);
      }
      return currentNodes
        .filter((node) => (node.data?.level ?? 1) > 1)
        .map((node) => node.id);
    },
    [selectedNodeId],
  );

  const updateNodesByScope = useCallback(
    (scope: StyleScope, updater: (data: NodeData, node: MindMapNode) => NodeData) => {
      const scopedIds = getScopedNodeIds(scope);
      if (!scopedIds.length) return;
      const nextNodes = nodesRef.current.map((node) =>
        scopedIds.includes(node.id)
          ? {
              ...node,
              data: updater({ ...(node.data ?? {}) }, node),
            }
          : node,
      );
      commitGraph(nextNodes, edgesRef.current);
    },
    [commitGraph, getScopedNodeIds],
  );

  const scopedReferenceNode = useMemo(() => {
    const scopedIds = getScopedNodeIds(styleScope);
    if (!scopedIds.length) return null;
    const map = new Map(nodes.map((node) => [node.id, node]));
    for (const id of scopedIds) {
      const candidate = map.get(id);
      if (candidate) return candidate;
    }
    return null;
  }, [getScopedNodeIds, nodes, styleScope]);

  const defaultEdgeOptions = useMemo(
    () => ({
      type: edgeStyleConfig.type,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: edgeStyleConfig.stroke,
      },
      style: {
        stroke: edgeStyleConfig.stroke,
        strokeWidth: edgeStyleConfig.strokeWidth,
      },
    }),
    [edgeStyleConfig],
  );

  const updateEdgeConfig = useCallback(
    (partial: Partial<EdgeStyleConfig>) => {
      setEdgeStyleConfig((prev) => {
        const next = { ...prev, ...partial };
        commitGraph(nodesRef.current, edgesRef.current, {
          pushHistory: false,
          skipNormalization: true,
          edgeConfig: next,
        });
        return next;
      });
    },
    [commitGraph],
  );

  const createEdgeDraft = useCallback(
    (edge: Partial<MindMapEdge> & { id: string; source: string; target: string }): MindMapEdge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: edgeStyleConfig.type,
      data: edge.data,
      hidden: false,
    }),
    [edgeStyleConfig.type],
  );

  const scopeHasSelection = useMemo(() => {
    if (styleScope === 'selected') {
      return Boolean(selectedNodeId);
    }
    return nodes.some((node) =>
      styleScope === 'level1' ? (node.data?.level ?? 1) === 1 : (node.data?.level ?? 1) > 1,
    );
  }, [nodes, selectedNodeId, styleScope]);

  const handleScopeChange = useCallback((value: StyleScope) => {
    setStyleScope(value);
  }, [commitGraph]);

  const handleFillColorChange = useCallback(
    (color: string) => {
      updateNodesByScope(styleScope, (data) => ({
        ...data,
        fillColor: color,
      }));
    },
    [styleScope, updateNodesByScope],
  );

  const handleBorderColorChange = useCallback(
    (color: string) => {
      updateNodesByScope(styleScope, (data) => ({
        ...data,
        borderColor: color,
        customColor: true,
      }));
    },
    [styleScope, updateNodesByScope],
  );

  const handleBodyWidthChange = useCallback(
    (value: number) => {
      updateNodesByScope(styleScope, (data) => ({
        ...data,
        bodyWidth: value,
      }));
    },
    [styleScope, updateNodesByScope],
  );

  const handleBorderWidthChange = useCallback(
    (value: number) => {
      updateNodesByScope(styleScope, (data) => ({
        ...data,
        borderWidth: value,
      }));
    },
    [styleScope, updateNodesByScope],
  );

  const handleFontFamilyChange = useCallback(
    (value: string) => {
      updateNodesByScope(styleScope, (data) => ({
        ...data,
        fontFamily: value,
      }));
    },
    [styleScope, updateNodesByScope],
  );

  const handleFontSizeChange = useCallback(
    (value: number) => {
      updateNodesByScope(styleScope, (data) => ({
        ...data,
        fontSize: value,
      }));
    },
    [styleScope, updateNodesByScope],
  );

  const handleTextColorChange = useCallback(
    (color: string) => {
      updateNodesByScope(styleScope, (data) => ({
        ...data,
        textColor: color,
      }));
    },
    [styleScope, updateNodesByScope],
  );

  const handleHighlightColorChange = useCallback(
    (color: string) => {
      updateNodesByScope(styleScope, (data) => ({
        ...data,
        highlightColor: color,
      }));
    },
    [styleScope, updateNodesByScope],
  );

  const handleFlashcardModeChange = useCallback(
    (enable: boolean) => {
      const scopeNodes = pickNodesByScope(
        nodesRef.current,
        edgesRef.current,
        flashcardScope,
        selectedNodeId,
        selectedNodeIds,
      );
      if (!scopeNodes.length) return;
      const targetIds = new Set(scopeNodes.map((node) => node.id));
      const nextNodes = nodesRef.current.map((node) =>
        targetIds.has(node.id)
          ? {
              ...node,
              data: {
                ...node.data,
                flashcardMode: enable,
                isRevealed: enable ? false : true,
              },
            }
          : node,
      );
      commitGraph(nextNodes, edgesRef.current, { skipNormalization: true });
      setStatus({ text: enable ? 'Flashcards activadas' : 'Flashcards desactivadas', loading: false });
    },
    [commitGraph, flashcardScope, selectedNodeId, selectedNodeIds, setStatus],
  );

  const handleFlashcardReveal = useCallback(
    (reveal: boolean) => {
      const scopeNodes = pickNodesByScope(
        nodesRef.current,
        edgesRef.current,
        flashcardScope,
        selectedNodeId,
        selectedNodeIds,
      ).filter((node) => node.data?.flashcardMode);
      if (!scopeNodes.length) return;
      const targetIds = new Set(scopeNodes.map((node) => node.id));
      const nextNodes = nodesRef.current.map((node) =>
        targetIds.has(node.id)
          ? {
              ...node,
              data: { ...node.data, isRevealed: reveal },
            }
          : node,
      );
      commitGraph(nextNodes, edgesRef.current, { skipNormalization: true, pushHistory: false });
      setStatus({ text: reveal ? 'Flashcards reveladas' : 'Flashcards ocultas', loading: false });
    },
    [commitGraph, flashcardScope, selectedNodeId, selectedNodeIds, setStatus],
  );

  const toggleFontWeight = useCallback(() => {
    const isBold = scopedReferenceNode?.data?.fontWeight === 'bold';
    updateNodesByScope(styleScope, (data) => ({
      ...data,
      fontWeight: isBold ? 'normal' : 'bold',
    }));
  }, [scopedReferenceNode?.data?.fontWeight, styleScope, updateNodesByScope]);

  const toggleFontStyle = useCallback(() => {
    const isItalic = scopedReferenceNode?.data?.fontStyle === 'italic';
    updateNodesByScope(styleScope, (data) => ({
      ...data,
      fontStyle: isItalic ? 'normal' : 'italic',
    }));
  }, [scopedReferenceNode?.data?.fontStyle, styleScope, updateNodesByScope]);

  const toggleUnderline = useCallback(() => {
    const isUnderline = scopedReferenceNode?.data?.textDecoration === 'underline';
    updateNodesByScope(styleScope, (data) => ({
      ...data,
      textDecoration: isUnderline ? 'none' : 'underline',
    }));
  }, [scopedReferenceNode?.data?.textDecoration, styleScope, updateNodesByScope]);

  const handleEdgeColorChange = useCallback(
    (color: string) => {
      updateEdgeConfig({ stroke: color });
    },
    [updateEdgeConfig],
  );

  const handleEdgeThicknessChange = useCallback(
    (width: number) => {
      updateEdgeConfig({ strokeWidth: width });
    },
    [updateEdgeConfig],
  );

  const handleEdgeTypeChange = useCallback(
    (type: EdgeStyleConfig['type']) => {
      updateEdgeConfig({ type });
    },
    [updateEdgeConfig],
  );

  const toggleFormatSection = useCallback((section: 'style' | 'presentation' | 'map') => {
    setFormatSectionsOpen((prev) => ({ ...prev, [section]: !prev[section] }));
  }, []);

  const handleFitView = useCallback(() => {
    reactFlowInstance?.fitView({ padding: 0.2, duration: 400 });
  }, [reactFlowInstance]);

  const outlineNodes = useMemo(() => {
    const normalizedFilter = outlineFilter.trim().toLowerCase();
    return visibleNodes
      .filter((node) =>
        normalizedFilter ? (node.data?.label ?? '').toLowerCase().includes(normalizedFilter) : true,
      )
      .sort((a, b) => (a.data?.level ?? 0) - (b.data?.level ?? 0));
  }, [outlineFilter, visibleNodes]);

  const createNode = useCallback(
    (payload: NewNodeInput = {}) =>
      normalizeNodes(
        [
          {
            id: nanoid(8),
            type: 'mindNode',
            position: payload.position ?? { x: 0, y: 0 },
            data: {
              label: payload.data?.label ?? 'Nuevo concepto',
              description: payload.data?.description ?? '',
              isEditing: payload.data?.isEditing ?? true,
              level: payload.data?.level ?? 1,
              isFloating: payload.data?.isFloating ?? false,
              ...payload.data,
            },
          } as MindMapNode,
        ],
        activePalette,
      )[0],
    [activePalette],
  );

  const addChildNode = useCallback(
    (referenceId?: string | null) => {
      const currentNodes = nodesRef.current;
      const currentEdges = edgesRef.current;
      const parent = referenceId
        ? currentNodes.find((node) => node.id === referenceId)
        : selectedNodeId
          ? currentNodes.find((node) => node.id === selectedNodeId)
          : null;
      const level = parent ? (parent.data?.level ?? 1) + 1 : 1;
      const basePosition = parent
        ? {
            x: parent.position.x + LAYOUT_SPACING_X,
            y: parent.position.y + LAYOUT_SPACING_Y / 2,
          }
        : { x: 0, y: 0 };
      const newNode = createNode({
        position: basePosition,
        data: { level },
      });
      const nextNodes = [...currentNodes, newNode];
      const nextEdges = parent
        ? [
            ...currentEdges,
            createEdgeDraft({
              id: `e-${parent.id}-${newNode.id}`,
              source: parent.id,
              target: newNode.id,
            }),
          ]
        : currentEdges;
      commitGraph(nextNodes, nextEdges);
      setSelectedNodeId(newNode.id);
      setStatus({ text: 'Nodo agregado', loading: false });
    },
    [commitGraph, createNode, createEdgeDraft, selectedNodeId],
  );

  const addSiblingNode = useCallback(
    (referenceId?: string | null) => {
      const currentNodes = nodesRef.current;
      const currentEdges = edgesRef.current;
      const referenceNode = referenceId
        ? currentNodes.find((node) => node.id === referenceId)
        : selectedNodeId
          ? currentNodes.find((node) => node.id === selectedNodeId)
          : null;
      if (!referenceNode) {
        addChildNode();
        return;
      }
      const parentEdge = currentEdges.find((edge) => edge.target === referenceNode.id);
      const parentNode = parentEdge
        ? currentNodes.find((node) => node.id === parentEdge.source)
        : null;
      const level = referenceNode.data?.level ?? 1;
      const basePosition = {
        x: referenceNode.position.x + SNAP_DISTANCE,
        y: referenceNode.position.y + SNAP_DISTANCE * 0.3,
      };
      const newNode = createNode({
        position: basePosition,
        data: { level },
      });
      const nextNodes = [...currentNodes, newNode];
      const nextEdges = parentNode
        ? [
            ...currentEdges,
            createEdgeDraft({
              id: `e-${parentNode.id}-${newNode.id}`,
              source: parentNode.id,
              target: newNode.id,
            }),
          ]
        : currentEdges;
      commitGraph(nextNodes, nextEdges);
      setSelectedNodeId(newNode.id);
      setStatus({ text: 'Nodo hermano agregado', loading: false });
    },
    [addChildNode, commitGraph, createNode, createEdgeDraft, selectedNodeId],
  );

  const addFloatingNode = useCallback(
    (referenceId?: string | null) => {
      const currentNodes = nodesRef.current;
      const referenceNode = referenceId
        ? currentNodes.find((node) => node.id === referenceId)
        : selectedNodeId
          ? currentNodes.find((node) => node.id === selectedNodeId)
          : null;
      const baseX = referenceNode?.position.x ?? 0;
      const baseY = referenceNode?.position.y ?? 0;
      const level = referenceNode ? (referenceNode.data?.level ?? 1) + 1 : 1;
      const newNode = createNode({
        position: { x: baseX + 120, y: baseY + 120 },
        data: { isFloating: true, level },
      });
      const nextNodes = [...currentNodes, newNode];
      commitGraph(nextNodes, edgesRef.current);
      setSelectedNodeId(newNode.id);
      setStatus({ text: 'Nodo flotante agregado', loading: false });
    },
    [commitGraph, createNode, selectedNodeId],
  );

  const duplicateNode = useCallback(
    (nodeId: string) => {
      const currentNodes = nodesRef.current;
      const currentEdges = edgesRef.current;
      const source = currentNodes.find((node) => node.id === nodeId);
      if (!source) return;
      const duplicate = normalizeNodes(
        [
          {
            ...source,
            id: nanoid(8),
            position: {
              x: source.position.x + 80,
              y: source.position.y + 80,
            },
            data: {
              ...source.data,
              label: `${source.data?.label ?? 'Nodo'} (copia)`,
              isEditing: true,
            },
          },
        ],
        activePalette,
      )[0];
      const parentEdge = currentEdges.find((edge) => edge.target === nodeId);
      const nextEdges = parentEdge
        ? [
            ...currentEdges,
            createEdgeDraft({
              id: `e-${parentEdge.source}-${duplicate.id}`,
              source: parentEdge.source,
              target: duplicate.id,
            }),
          ]
        : currentEdges;
      const nextNodes = [...currentNodes, duplicate];
      commitGraph(nextNodes, nextEdges);
      setSelectedNodeId(duplicate.id);
      setStatus({ text: 'Nodo duplicado', loading: false });
    },
    [activePalette, commitGraph, createEdgeDraft],
  );

  const deleteNode = useCallback((nodeId: string) => {
    const currentNodes = nodesRef.current;
    const currentEdges = edgesRef.current;
    const subtree = collectSubtreeIds(nodeId, currentEdges);
    const nextNodes = currentNodes.filter((node) => !subtree.has(node.id));
    const nextEdges = currentEdges.filter(
      (edge) => !subtree.has(edge.source) && !subtree.has(edge.target),
    );
    commitGraph(nextNodes, nextEdges);
    setSelectedNodeId(null);
    setStatus({ text: 'Nodo eliminado', loading: false });
  }, [commitGraph]);

  const quickConnect = useCallback(
    (sourceId: string, targetId: string) => {
      if (sourceId === targetId) return;
      const currentEdges = edgesRef.current;
      if (currentEdges.some((edge) => edge.source === sourceId && edge.target === targetId)) {
        return;
      }
      const nextEdges = [
        ...currentEdges,
        createEdgeDraft({
          id: `e-${sourceId}-${targetId}-${nanoid(6)}`,
          source: sourceId,
          target: targetId,
        }),
      ];
      commitGraph(nodesRef.current, nextEdges, { skipNormalization: true });
    },
    [commitGraph, createEdgeDraft],
  );

  const updateNodeData = useCallback(
    (nodeId: string, data: Partial<NodeData>) => {
      const currentNodes = nodesRef.current;
      const currentEdges = edgesRef.current;
      const nextNodes = currentNodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: { ...node.data, ...data },
            }
          : node,
      );
      commitGraph(nextNodes, currentEdges, { pushHistory: false });
    },
    [commitGraph],
  );

  const handleNodeDoubleClick = useCallback(
    (_event: ReactMouseEvent, node: MindMapNode) => {
      setSelectedNodeId(node.id);
      updateNodeData(node.id, { isEditing: true });
    },
    [updateNodeData],
  );

  const toggleFloating = useCallback(
    (nodeId: string, isFloating: boolean) => {
      const currentNodes = nodesRef.current;
      const currentEdges = edgesRef.current;
      const subtree = collectSubtreeIds(nodeId, currentEdges);
      let nextNodes = setFloatingStateForSubtree(currentNodes, subtree, isFloating);
      if (!isFloating) {
        const parentEdge = currentEdges.find((edge) => edge.target === nodeId);
        if (parentEdge) {
          nextNodes = positionSubtreeNearParent(nextNodes, nodeId, parentEdge.source, currentEdges);
        }
      }
      commitGraph(nextNodes, currentEdges);
    },
    [commitGraph],
  );

  const foldBranch = useCallback(
    (nodeId: string) => {
      const result = toggleBranchCollapse(nodeId, true, nodesRef.current, edgesRef.current);
      if (result.nodes === nodesRef.current) return;
      commitGraph(result.nodes, result.edges, { skipNormalization: true });
      setStatus({ text: 'Rama plegada', loading: false });
    },
    [commitGraph],
  );

  const unfoldBranch = useCallback(
    (nodeId: string) => {
      const result = toggleBranchCollapse(nodeId, false, nodesRef.current, edgesRef.current);
      if (result.nodes === nodesRef.current) return;
      commitGraph(result.nodes, result.edges, { skipNormalization: true });
      setStatus({ text: 'Rama expandida', loading: false });
    },
    [commitGraph],
  );

  const foldAllBranches = useCallback(() => {
    const currentNodes = nodesRef.current;
    const currentEdges = edgesRef.current;
    const { parentMap, childMap } = buildGraphMaps(currentNodes, currentEdges);
    const targetIds = selectedNodeId
      ? [selectedNodeId]
      : currentNodes
          .filter((node) => !parentMap.has(node.id) && (childMap.get(node.id)?.length ?? 0) > 0)
          .map((node) => node.id);
    if (!targetIds.length) return;
    let nextNodes = currentNodes;
    let nextEdges = currentEdges;
    targetIds.forEach((targetId) => {
      const result = toggleBranchCollapse(targetId, true, nextNodes, nextEdges);
      nextNodes = result.nodes;
      nextEdges = result.edges;
    });
    commitGraph(nextNodes, nextEdges, { skipNormalization: true });
    setStatus({ text: 'Subramas plegadas', loading: false });
  }, [commitGraph, selectedNodeId]);

  const unfoldAllBranches = useCallback(() => {
    const currentNodes = nodesRef.current;
    const currentEdges = edgesRef.current;
    const collapsedNodes = currentNodes.filter((node) => node.data?.isCollapsed);
    const targetIds = selectedNodeId
      ? [selectedNodeId]
      : collapsedNodes.length
        ? collapsedNodes.map((node) => node.id)
        : currentNodes
            .filter((node) => (node.data?.childCount ?? 0) > 0)
            .map((node) => node.id);
    if (!targetIds.length) return;
    let nextNodes = currentNodes;
    let nextEdges = currentEdges;
    targetIds.forEach((targetId) => {
      const result = toggleBranchCollapse(targetId, false, nextNodes, nextEdges);
      nextNodes = result.nodes;
      nextEdges = result.edges;
    });
    commitGraph(nextNodes, nextEdges, { skipNormalization: true });
    setStatus({ text: 'Subramas desplegadas', loading: false });
  }, [commitGraph, selectedNodeId]);

  const showBranchOnly = useCallback((nodeId: string) => {
    setBranchFocusId(nodeId);
    setStatus({ text: 'Mostrando rama seleccionada', loading: false });
  }, []);

  const exitBranchFocus = useCallback(() => {
    setBranchFocusId(null);
    setStatus({ text: 'Mostrando contenido completo', loading: false });
  }, []);

  const exportBranch = useCallback(
    async (nodeId: string) => {
      setStatus({ text: 'Exportando rama…', loading: true });
      try {
        const subtree = collectSubtreeIds(nodeId, edgesRef.current);
        const branchNodes = nodesRef.current.filter((node) => subtree.has(node.id));
        const branchEdges = edgesRef.current.filter(
          (edge) => subtree.has(edge.source) && subtree.has(edge.target),
        );
        const { data } = await axios.post(`${API_URL}/api/export`, {
          nodes: branchNodes,
          edges: branchEdges,
        });
        await navigator.clipboard.writeText(data?.markdown ?? '');
        setStatus({ text: 'Markdown de la rama copiado', loading: false });
      } catch (error) {
        console.error(error);
        setStatus({ text: 'No se pudo exportar la rama', loading: false });
      }
    },
    [],
  );

  const applyLayout = useCallback(
    (mode: LayoutMode) => {
      const currentNodes = nodesRef.current;
      const currentEdges = edgesRef.current;
      let nextNodes: MindMapNode[] = currentNodes;
      if (!currentNodes.length) return;
      switch (mode) {
        case 'mindmap':
          nextNodes = applyMindmapLayout(currentNodes, currentEdges);
          break;
        case 'logic':
          nextNodes = applyTreeLayout(currentNodes, currentEdges, {
            orientation: 'LR',
            spacingX: LAYOUT_SPACING_X,
            spacingY: LAYOUT_SPACING_Y * 0.8,
          });
          break;
        case 'org':
          nextNodes = applyTreeLayout(currentNodes, currentEdges, {
            orientation: 'TB',
            spacingX: LAYOUT_SPACING_X * 0.8,
            spacingY: LAYOUT_SPACING_Y,
          });
          break;
        case 'tree':
          nextNodes = applyTreeLayout(currentNodes, currentEdges, {
            orientation: 'LR',
            spacingX: LAYOUT_SPACING_X * 0.9,
            spacingY: LAYOUT_SPACING_Y,
          });
          break;
        case 'timeline':
          nextNodes = applyTimelineLayout(currentNodes);
          break;
        default:
          nextNodes = currentNodes;
      }
      nextNodes = mergeNodeState(currentNodes, nextNodes);
      commitGraph(nextNodes, currentEdges);
      setLayoutMode(mode);
      setTimeout(() => {
        reactFlowInstance?.fitView({ padding: 0.2, duration: 500 });
      }, 50);
    },
    [commitGraph, reactFlowInstance],
  );

  const undo = useCallback(() => {
    setHistoryState((prev) => {
      if (prev.index <= 0) return prev;
      const target = prev.entries[prev.index - 1];
      commitGraph(deepCloneNodes(target.nodes), deepCloneEdges(target.edges), {
        pushHistory: false,
        skipNormalization: true,
      });
      setSelectedNodeId(null);
      return {
        ...prev,
        index: prev.index - 1,
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistoryState((prev) => {
      if (prev.index >= prev.entries.length - 1) return prev;
      const target = prev.entries[prev.index + 1];
      commitGraph(deepCloneNodes(target.nodes), deepCloneEdges(target.edges), {
        pushHistory: false,
        skipNormalization: true,
      });
      setSelectedNodeId(null);
      return {
        ...prev,
        index: prev.index + 1,
      };
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedNodeId) {
        event.preventDefault();
        deleteNode(selectedNodeId);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteNode, redo, selectedNodeId, undo]);

  const nodeTypes = useMemo(() => ({ mindNode: MindNode }), []);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const currentEdges = edgesRef.current;
      if (currentEdges.some((edge) => edge.source === connection.source && edge.target === connection.target)) {
        return;
      }
      const nextEdges = [
        ...currentEdges,
        createEdgeDraft({
          id: nanoid(8),
          source: connection.source,
          target: connection.target,
        }),
      ];
      commitGraph(nodesRef.current, nextEdges, { skipNormalization: true });
    },
    [commitGraph, createEdgeDraft],
  );

  const onNodeMouseEnter = useCallback(() => {
    setContextMenu(null);
  }, []);

  const onNodeContextMenu = useCallback(
    (event: ReactMouseEvent, node: MindMapNode) => {
      event.preventDefault();
      setSelectedNodeId(node.id);
      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      setContextMenu({
        x: bounds ? event.clientX - bounds.left : event.clientX,
        y: bounds ? event.clientY - bounds.top : event.clientY,
        nodeId: node.id,
      });
    },
    [reactFlowWrapper],
  );

  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setContextMenu(null);
  }, []);

  const handleViewportZoom = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      if (event.ctrlKey) {
        event.preventDefault();
        if (!reactFlowInstance) return;
        const currentZoom = reactFlowInstance.getZoom();
        const delta = event.deltaY > 0 ? -0.15 : 0.15;
        const nextZoom = Math.min(3, Math.max(0.2, currentZoom + delta));
        reactFlowInstance.zoomTo(nextZoom);
      }
    },
    [reactFlowInstance],
  );

  const handleContextAction = useCallback(
    (action: string) => {
      const targetId = contextMenu?.nodeId ?? selectedNodeId;
      if (!targetId) return;
      switch (action) {
        case 'add-child':
          addChildNode(targetId);
          break;
        case 'add-sibling':
          addSiblingNode(targetId);
          break;
        case 'add-floating':
          addFloatingNode(targetId);
          break;
        case 'duplicate':
          duplicateNode(targetId);
          break;
        case 'delete':
          deleteNode(targetId);
          break;
        case 'fold-branch':
          foldBranch(targetId);
          break;
        case 'unfold-branch':
          unfoldBranch(targetId);
          break;
        case 'show-branch':
          showBranchOnly(targetId);
          break;
        case 'export-branch':
          exportBranch(targetId);
          break;
        default:
          break;
      }
      setContextMenu(null);
    },
    [
      addChildNode,
      addFloatingNode,
      addSiblingNode,
      contextMenu,
      deleteNode,
      duplicateNode,
      exportBranch,
      foldBranch,
      selectedNodeId,
      showBranchOnly,
      unfoldBranch,
    ],
  );

  const handleMarkdownSubmit = useCallback(async () => {
    if (!markdownInput.trim()) return;
    setStatus({ text: 'Importando Markdown…', loading: true });
    try {
      const { data } = await axios.post(`${API_URL}/api/import`, { markdown: markdownInput });
      const nextNodes = (data?.nodes ?? []) as MindMapNode[];
      const rawEdges: MindMapEdge[] = (data?.edges ?? []).map((edge: MindMapEdge) => ({
        ...edge,
        id: edge.id ?? `e-${edge.source}-${edge.target}-${nanoid(5)}`,
        hidden: false,
      }));
      commitGraph(nextNodes, rawEdges);
      setSelectedNodeId(nextNodes[0]?.id ?? null);
      setStatus({ text: `Importados ${nextNodes.length} nodos`, loading: false });
    } catch (error) {
      console.error(error);
      setStatus({ text: 'No se pudo importar el markdown', loading: false });
    }
  }, [commitGraph, markdownInput]);

  const handleExport = useCallback(async () => {
    setStatus({ text: 'Generando Markdown…', loading: true });
    try {
      const { data } = await axios.post(`${API_URL}/api/export`, {
        nodes,
        edges,
      });
      await navigator.clipboard.writeText(data?.markdown ?? '');
      setStatus({ text: 'Markdown copiado al portapapeles', loading: false });
    } catch (error) {
      console.error(error);
      setStatus({ text: 'No se pudo exportar', loading: false });
    }
  }, [edges, nodes]);

  const handleFileUpload = useCallback(
    async (file: File | null) => {
      if (!file) return;
      setStatus({ text: 'Procesando archivo…', loading: true });
      try {
        const formData = new FormData();
        formData.append('file', file);
        const { data } = await axios.post(`${API_URL}/api/import`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const nextNodes = (data?.nodes ?? []) as MindMapNode[];
        const rawEdges: MindMapEdge[] = (data?.edges ?? []).map((edge: MindMapEdge) => ({
          ...edge,
          id: edge.id ?? `e-${edge.source}-${edge.target}-${nanoid(5)}`,
          hidden: false,
        }));
        commitGraph(nextNodes, rawEdges);
        setSelectedNodeId(nextNodes[0]?.id ?? null);
        setStatus({ text: 'Archivo importado', loading: false });
      } catch (error) {
        console.error(error);
        setStatus({ text: 'No se pudo procesar el archivo', loading: false });
      }
    },
    [commitGraph],
  );

  const handleDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDropActive(false);
      const file = event.dataTransfer?.files?.[0];
      await handleFileUpload(file ?? null);
    },
    [handleFileUpload],
  );

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex >= 0 && historyIndex < historyEntries.length - 1;

  const inspectorChange = (field: keyof NodeData) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!selectedNodeId) return;
    const value = event.target.type === 'number' ? Number(event.target.value) : event.target.value;
    updateNodeData(selectedNodeId, { [field]: value } as Partial<NodeData>);
  };

  const shapeFillColor = scopedReferenceNode?.data?.fillColor ?? DEFAULT_FILL_COLOR;
  const shapeBorderColor =
    scopedReferenceNode?.data?.borderColor ??
    scopedReferenceNode?.data?.color ??
    edgeStyleConfig.stroke;
  const shapeBorderWidth = scopedReferenceNode?.data?.borderWidth ?? DEFAULT_BORDER_WIDTH;
  const shapeBodyWidth = scopedReferenceNode?.data?.bodyWidth ?? DEFAULT_BODY_WIDTH;
  const fontFamilyValue = scopedReferenceNode?.data?.fontFamily ?? FONT_FAMILIES[0].value;
  const fontSizeValue = scopedReferenceNode?.data?.fontSize ?? DEFAULT_FONT_SIZE;
  const textColorValue = scopedReferenceNode?.data?.textColor ?? '#0f172a';
  const highlightColorValue =
    scopedReferenceNode?.data?.highlightColor && scopedReferenceNode.data.highlightColor !== '#00000000'
      ? scopedReferenceNode.data.highlightColor
      : '#ffffff';
  const isBold = scopedReferenceNode?.data?.fontWeight === 'bold';
  const isItalic = scopedReferenceNode?.data?.fontStyle === 'italic';
  const isUnderline = scopedReferenceNode?.data?.textDecoration === 'underline';

  const styleScopeOptions: Array<{ value: StyleScope; label: string }> = [
    { value: 'selected', label: 'Seleccionado' },
    { value: 'level1', label: 'Nivel 1 (Tema principal)' },
    { value: 'level2', label: 'Nivel 2+ (Subtemas)' },
  ];

  const backgroundGridColor = appTheme === 'dark' ? '#1e293b' : '#cfd9f4';

  const graphActions = useMemo(
    () => ({ quickConnect, foldBranch, unfoldBranch }),
    [foldBranch, quickConnect, unfoldBranch],
  );

  return (
    <GraphActionsProvider value={graphActions}>
      <div className={`app-root ${APP_THEMES[appTheme].className}`}>
        <header className="top-bar">
          <div className="brand-mark">
            <strong>MindMap Clínico</strong>
            <span>Plantillas rápidas para residentado</span>
          </div>
          <div className="top-bar__ticker">
            <span className="plan-pill">Brote Exantemático</span>
            <span>Mapa: {stats.nodes} nodos / {stats.edges} enlaces</span>
          </div>
          <div className="top-actions">
            <button
              className="ghost-btn"
              type="button"
              onClick={() => setSidePanelOpen((prev) => !prev)}
            >
              {sidePanelOpen ? 'Ocultar panel' : 'Mostrar panel'}
            </button>
            <button className="ghost-btn" type="button" onClick={() => setAppTheme(appTheme === 'dark' ? 'light' : 'dark')}>
              Modo {appTheme === 'dark' ? 'claro' : 'oscuro'}
            </button>
            <button className="primary-btn" type="button" onClick={handleExport}>
              Exportar Markdown
            </button>
          </div>
        </header>
        <div className={`app-shell ${APP_THEMES[appTheme].className} ${sidePanelOpen ? '' : 'is-side-collapsed'}`}>
          {sidePanelOpen ? (
            <aside className="side-panel">
              <div className="side-panel__header">
                <h1>Dataset clínico</h1>
                <button
                  type="button"
                  className="side-panel__collapse ghost-btn"
                  onClick={() => setSidePanelOpen(false)}
                >
                  ×
                </button>
              </div>
              <p>Importa outline en Markdown o arrastra tus notas.</p>
              <div className="insight-grid">
                <div className="insight-card">
                  <span>Nodos</span>
                  <strong>{stats.nodes}</strong>
                </div>
                <div className="insight-card">
                  <span>Conexiones</span>
                  <strong>{stats.edges}</strong>
                </div>
                <div className="insight-card">
                  <span>Flotantes</span>
                  <strong>{stats.floating}</strong>
                </div>
              </div>
              <div
                className={`import-panel drop-zone ${dropActive ? 'active' : ''}`}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setDropActive(true);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setDropActive(false);
                }}
                onDrop={handleDrop}
              >
                <label htmlFor="markdown-input">Pega Markdown o suelta un archivo .md</label>
                <textarea
                  id="markdown-input"
                  value={markdownInput}
                  onChange={(event) => setMarkdownInput(event.target.value)}
                  placeholder="# Sarampión\n## Clínica\n- Fiebre"
                />
                <div className="button-row">
                  <button type="button" onClick={handleMarkdownSubmit} disabled={!markdownInput.trim()}>
                    Importar Markdown
                  </button>
                  <button type="button" onClick={() => fileInputRef.current?.click()}>
                    Subir archivo
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".md,.txt"
                    style={{ display: 'none' }}
                    onChange={(event) => handleFileUpload(event.target.files?.[0] ?? null)}
                  />
                </div>
              </div>
              <div className="outline-panel">
                <div className="outline-header">
                  <strong>Outline</strong>
                  <input
                    type="search"
                    placeholder="Filtrar..."
                    value={outlineFilter}
                    onChange={(event) => setOutlineFilter(event.target.value)}
                    style={{ width: '100%', marginTop: '0.5rem' }}
                  />
                </div>
                <ul>
                  {outlineNodes.map((node) => (
                    <li
                      key={node.id}
                      className={node.id === selectedNodeId ? 'active' : ''}
                      onClick={() => {
                        setSelectedNodeId(node.id);
                        reactFlowInstance?.setCenter(node.position.x, node.position.y, {
                          duration: 400,
                          zoom: 1.2,
                        });
                      }}
                    >
                      {getOutlineLabel(node)}
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          ) : (
            <div className="side-panel-placeholder">
              <button type="button" className="ghost-btn" onClick={() => setSidePanelOpen(true)}>
                Mostrar panel
              </button>
            </div>
          )}
          <main className="canvas-area">
              <div className="toolbar">
                <div className="button-row">
                  <button type="button" onClick={() => addChildNode(selectedNodeId ?? undefined)}>
                    + Subtema
                  </button>
                <button type="button" onClick={() => addSiblingNode(selectedNodeId ?? undefined)}>
                  + Hermano
                </button>
                <button type="button" onClick={() => addFloatingNode()}>
                  + Flotante
                </button>
                <button type="button" onClick={() => layoutMode !== 'mindmap' && applyLayout('mindmap')}>
                  Mindmap
                </button>
                <button type="button" onClick={() => applyLayout('tree')}>
                  Árbol
                </button>
                <button type="button" onClick={() => applyLayout('timeline')}>
                  Timeline
                </button>
                <button type="button" onClick={foldAllBranches}>
                  {selectedNodeId ? 'Plegar rama seleccionada' : 'Plegar subramas'}
                </button>
                <button type="button" onClick={unfoldAllBranches}>
                  {selectedNodeId ? 'Desplegar rama seleccionada' : 'Desplegar subramas'}
                </button>
                <button type="button" onClick={undo} disabled={!canUndo}>
                  Deshacer
                </button>
                <button type="button" onClick={redo} disabled={!canRedo}>
                  Rehacer
                </button>
              </div>
              <div className={`status-banner ${status.loading ? 'is-loading' : ''}`}>
                <span className="status-indicator" />
                  <span>{status.text}</span>
                </div>
              </div>
              {branchFocusId ? (
                <div className="branch-focus-banner">
                  <span>
                    Mostrando solo la rama: <strong>{focusedNode?.data?.label ?? 'Rama'}</strong>
                  </span>
                  <button type="button" onClick={exitBranchFocus}>
                    Mostrar contenido completo
                  </button>
                </div>
              ) : null}
              <div
                className="flow-stage"
                ref={reactFlowWrapper}
                style={{ flex: 1, position: 'relative' }}
                onWheel={handleViewportZoom}
            >
              <ReactFlow
                nodes={visibleNodes}
                edges={visibleEdges}
                nodeTypes={nodeTypes}
                defaultEdgeOptions={defaultEdgeOptions}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={(_, node) => setSelectedNodeId(node.id)}
                onNodeDoubleClick={handleNodeDoubleClick}
                onNodeContextMenu={onNodeContextMenu}
                onPaneClick={handlePaneClick}
                onNodeMouseEnter={onNodeMouseEnter}
                selectionKeyCode={null}
                multiSelectionKeyCode={null}
                selectionOnDrag
                panOnDrag={[2]}
                fitView
                snapToGrid={showSnapLines}
                snapGrid={[20, 20]}
                onInit={(instance) => setReactFlowInstance(instance)}
              >
                {showMiniMap ? <MiniMap zoomable pannable /> : null}
                {showControls ? <Controls position="bottom-right" /> : null}
                {showBackgroundGrid ? <Background gap={20} color={backgroundGridColor} /> : null}
              </ReactFlow>
              {contextMenu ? (
                <ContextMenu
                  x={contextMenu.x}
                  y={contextMenu.y}
                  onAction={handleContextAction}
                  onClose={() => setContextMenu(null)}
                  items={contextMenuItems}
                />
              ) : null}
            </div>
          </main>
          <aside className={`format-panel ${formatPanelOpen ? 'is-open' : 'is-collapsed'}`}>
            <header className="format-panel__header">
              <div className="format-panel__title">
                <div className="format-panel__title-main">
                  <strong>Formato</strong>
                  <span>{scopedReferenceNode?.data?.label ?? 'Mapa completo'}</span>
                </div>
                <div className="format-panel__meta">
                  <span>
                    {styleScope === 'selected'
                      ? selectedNode
                        ? `Tema seleccionado (nivel ${selectedNode.data?.level ?? 1})`
                        : 'Sin selección'
                      : styleScope === 'level1'
                        ? 'Tema principal (Nivel 1)'
                        : 'Subtemas (Nivel 2+)'}
                  </span>
                  {layoutMode ? <span>Estructura: {layoutMode}</span> : null}
                </div>
              </div>
              <button
                type="button"
                className="format-panel__collapse ghost-btn"
                onClick={() => setFormatPanelOpen((prev) => !prev)}
              >
                {formatPanelOpen ? 'Ocultar' : 'Mostrar'}
              </button>
            </header>
            {formatPanelOpen ? (
              <div className="format-panel__groups">
                <section className={`format-group ${formatSectionsOpen.style ? 'is-open' : ''}`}>
                  <button
                    type="button"
                    className="format-group__toggle"
                    onClick={() => toggleFormatSection('style')}
                  >
                    <span>Estilo</span>
                    <span className="format-group__chevron" />
                  </button>
                  {formatSectionsOpen.style ? (
                    <div className="format-group__body">
                      <nav className="style-tabs">
                        <button
                          type="button"
                          className={styleTab === 'shape' ? 'active' : ''}
                          onClick={() => setStyleTab('shape')}
                        >
                          Forma
                        </button>
                        <button
                          type="button"
                          className={styleTab === 'text' ? 'active' : ''}
                          onClick={() => setStyleTab('text')}
                        >
                          Texto
                        </button>
                        <button
                          type="button"
                          className={styleTab === 'structure' ? 'active' : ''}
                          onClick={() => setStyleTab('structure')}
                        >
                          Estructura
                        </button>
                        <button
                          type="button"
                          className={styleTab === 'branching' ? 'active' : ''}
                          onClick={() => setStyleTab('branching')}
                        >
                          Ramificación
                        </button>
                      </nav>
                      {styleTab === 'shape' ? (
                        <div className="style-pane">
                          <div className="field">
                            <label htmlFor="style-scope">Aplicar a</label>
                            <select
                              id="style-scope"
                              value={styleScope}
                              onChange={(event) => handleScopeChange(event.target.value as StyleScope)}
                            >
                              {styleScopeOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          {!scopeHasSelection ? (
                            <p className="empty-hint">Selecciona un tema para aplicar cambios.</p>
                          ) : null}
                          <div className="field">
                            <label>Color de relleno</label>
                            <input
                              type="color"
                              value={shapeFillColor}
                              disabled={!scopeHasSelection}
                              onChange={(event) => handleFillColorChange(event.target.value)}
                            />
                          </div>
                          <div className="field">
                            <label>Color del borde</label>
                            <input
                              type="color"
                              value={shapeBorderColor}
                              disabled={!scopeHasSelection}
                              onChange={(event) => handleBorderColorChange(event.target.value)}
                            />
                          </div>
                          <div className="field">
                            <label>Grosor del borde ({shapeBorderWidth}px)</label>
                            <input
                              type="range"
                              min={1}
                              max={12}
                              step={1}
                              value={shapeBorderWidth}
                              disabled={!scopeHasSelection}
                              onChange={(event) => handleBorderWidthChange(Number(event.target.value))}
                            />
                          </div>
                          <div className="field">
                            <label>Longitud del tema ({Math.round(shapeBodyWidth)}px)</label>
                            <input
                              type="range"
                              min={160}
                              max={420}
                              step={10}
                              value={shapeBodyWidth}
                              disabled={!scopeHasSelection}
                              onChange={(event) => handleBodyWidthChange(Number(event.target.value))}
                            />
                          </div>
                        </div>
                      ) : null}
                      {styleTab === 'text' ? (
                        <div className="style-pane">
                          {styleScope === 'selected' && selectedNode ? (
                            <>
                              <div className="field">
                                <label htmlFor="node-label">Título</label>
                                <input
                                  id="node-label"
                                  value={selectedNode.data?.label ?? ''}
                                  onChange={inspectorChange('label')}
                                />
                              </div>
                              <div className="field">
                                <label htmlFor="node-desc">Descripción</label>
                                <textarea
                                  id="node-desc"
                                  rows={3}
                                  value={selectedNode.data?.description ?? ''}
                                  onChange={inspectorChange('description')}
                                />
                              </div>
                            </>
                          ) : null}
                          <div className="field">
                            <label>Fuente</label>
                            <select
                              value={fontFamilyValue}
                              disabled={!scopeHasSelection}
                              onChange={(event) => handleFontFamilyChange(event.target.value)}
                            >
                              {FONT_FAMILIES.map((font) => (
                                <option key={font.value} value={font.value}>
                                  {font.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="field">
                            <label>Tamaño ({fontSizeValue}px)</label>
                            <input
                              type="range"
                              min={10}
                              max={42}
                              step={1}
                              value={fontSizeValue}
                              disabled={!scopeHasSelection}
                              onChange={(event) => handleFontSizeChange(Number(event.target.value))}
                            />
                          </div>
                          <div className="format-inline-buttons">
                            <button
                              type="button"
                              className={isBold ? 'active' : ''}
                              disabled={!scopeHasSelection}
                              onClick={toggleFontWeight}
                            >
                              B
                            </button>
                            <button
                              type="button"
                              className={isItalic ? 'active' : ''}
                              disabled={!scopeHasSelection}
                              onClick={toggleFontStyle}
                            >
                              I
                            </button>
                            <button
                              type="button"
                              className={isUnderline ? 'active' : ''}
                              disabled={!scopeHasSelection}
                              onClick={toggleUnderline}
                            >
                              U
                            </button>
                          </div>
                          <div className="field">
                            <label>Color del texto</label>
                            <input
                              type="color"
                              value={textColorValue}
                              disabled={!scopeHasSelection}
                              onChange={(event) => handleTextColorChange(event.target.value)}
                            />
                          </div>
                          <div className="field">
                            <label>Resaltado</label>
                            <input
                              type="color"
                              value={highlightColorValue}
                              disabled={!scopeHasSelection}
                              onChange={(event) => handleHighlightColorChange(event.target.value)}
                            />
                          </div>
                        </div>
                      ) : null}
                      {styleTab === 'structure' ? (
                        <div className="style-pane">
                          <div className="layout-grid">
                            <button
                              type="button"
                              className={layoutMode === 'mindmap' ? 'active' : ''}
                              onClick={() => applyLayout('mindmap')}
                            >
                              Mapa central
                            </button>
                            <button
                              type="button"
                              className={layoutMode === 'tree' ? 'active' : ''}
                              onClick={() => applyLayout('tree')}
                            >
                              Árbol horizontal
                            </button>
                            <button
                              type="button"
                              className={layoutMode === 'logic' ? 'active' : ''}
                              onClick={() => applyLayout('logic')}
                            >
                              Lógico
                            </button>
                            <button
                              type="button"
                              className={layoutMode === 'org' ? 'active' : ''}
                              onClick={() => applyLayout('org')}
                            >
                              Organigrama
                            </button>
                            <button
                              type="button"
                              className={layoutMode === 'timeline' ? 'active' : ''}
                              onClick={() => applyLayout('timeline')}
                            >
                              Línea de tiempo
                            </button>
                          </div>
                        </div>
                      ) : null}
                      {styleTab === 'branching' ? (
                        <div className="style-pane">
                          <div className="field">
                            <label>Tipo de ramificación</label>
                            <div className="branch-options">
                              <button
                                type="button"
                                className={edgeStyleConfig.type === 'smoothstep' ? 'active' : ''}
                                onClick={() => handleEdgeTypeChange('smoothstep')}
                              >
                                Curvas
                              </button>
                              <button
                                type="button"
                                className={edgeStyleConfig.type === 'straight' ? 'active' : ''}
                                onClick={() => handleEdgeTypeChange('straight')}
                              >
                                Línea
                              </button>
                              <button
                                type="button"
                                className={edgeStyleConfig.type === 'step' ? 'active' : ''}
                                onClick={() => handleEdgeTypeChange('step')}
                              >
                                Ortogonal
                              </button>
                            </div>
                          </div>
                          <div className="field">
                            <label>Grosor</label>
                            <div className="branch-weight">
                              {[
                                { label: 'Thin', value: 1.5 },
                                { label: 'Medium', value: 2.4 },
                                { label: 'Bold', value: 3.2 },
                              ].map((option) => (
                                <button
                                  key={option.value}
                                  type="button"
                                  className={edgeStyleConfig.strokeWidth === option.value ? 'active' : ''}
                                  onClick={() => handleEdgeThicknessChange(option.value)}
                                >
                                  {option.label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="field">
                            <label>Color</label>
                            <input
                              type="color"
                              value={edgeStyleConfig.stroke}
                              onChange={(event) => handleEdgeColorChange(event.target.value)}
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </section>
                <section className={`format-group ${formatSectionsOpen.presentation ? 'is-open' : ''}`}>
                  <button
                    type="button"
                    className="format-group__toggle"
                    onClick={() => toggleFormatSection('presentation')}
                  >
                    <span>Presentación</span>
                    <span className="format-group__chevron" />
                  </button>
                  {formatSectionsOpen.presentation ? (
                    <div className="format-group__body">
                      <label className="toggle-row">
                        <input
                          type="checkbox"
                          checked={showMiniMap}
                          onChange={(event) => setShowMiniMap(event.target.checked)}
                        />
                        <span>Mostrar minimapa</span>
                      </label>
                      <label className="toggle-row">
                        <input
                          type="checkbox"
                          checked={showControls}
                          onChange={(event) => setShowControls(event.target.checked)}
                        />
                        <span>Controles de zoom</span>
                      </label>
                      <label className="toggle-row">
                        <input
                          type="checkbox"
                          checked={showBackgroundGrid}
                          onChange={(event) => setShowBackgroundGrid(event.target.checked)}
                        />
                        <span>Fondo cuadriculado</span>
                      </label>
                      <label className="toggle-row">
                        <input
                          type="checkbox"
                          checked={showSnapLines}
                          onChange={(event) => setShowSnapLines(event.target.checked)}
                        />
                        <span>Ajuste magnético</span>
                      </label>
                      <button type="button" className="ghost-btn" onClick={handleFitView}>
                        Ajustar vista
                      </button>
                    </div>
                  ) : null}
                </section>
                <section className={`format-group ${formatSectionsOpen.map ? 'is-open' : ''}`}>
                  <button
                    type="button"
                    className="format-group__toggle"
                    onClick={() => toggleFormatSection('map')}
                  >
                    <span>Mapa</span>
                    <span className="format-group__chevron" />
                  </button>
                  {formatSectionsOpen.map ? (
                    <div className="format-group__body">
                      <div className="theme-grid">
                        {MAP_THEMES.map((theme) => (
                          <button
                            key={theme.id}
                            type="button"
                            className={`theme-card ${theme.id === paletteId ? 'active' : ''}`}
                            onClick={() => setPaletteId(theme.id)}
                          >
                            <span className="theme-thumb" style={{ background: theme.swatches[0] }} />
                            <span className="theme-copy">
                              {theme.name}
                              <small>{theme.swatches.join(' / ')}</small>
                            </span>
                          </button>
                        ))}
                      </div>
                      <label className="toggle-row">
                        <input
                          type="checkbox"
                          checked={coloredBranches}
                          onChange={(event) => setColoredBranches(event.target.checked)}
                        />
                        <span>Ramas coloreadas (estilo Xmind)</span>
                      </label>
                      {branchFocusId ? (
                        <button type="button" className="ghost-btn" onClick={exitBranchFocus}>
                          Mostrar contenido completo
                        </button>
                      ) : null}
                      <div className="floating-block">
                        <div className="floating-panel__header">
                          <strong>Nodos flotantes</strong>
                        </div>
                        <ul className="floating-list">
                          {floatingNodes.length ? (
                            floatingNodes.map((node) => (
                              <li key={node.id} className="floating-card">
                                <strong>{node.data?.label}</strong>
                                <small>Nivel {node.data?.level}</small>
                                <div className="floating-actions">
                                  <button type="button" onClick={() => toggleFloating(node.id, false)}>
                                    Re-ancorar
                                  </button>
                                  <button type="button" onClick={() => setSelectedNodeId(node.id)}>
                                    Enfocar
                                  </button>
                                </div>
                              </li>
                            ))
                          ) : (
                            <li className="empty-hint">No hay nodos flotantes.</li>
                          )}
                        </ul>
                      </div>
                      <div className="flashcard-panel">
                        <div className="flashcard-header">
                          <div>
                            <strong>Modo Flashcards</strong>
                            <small>Oculta títulos para repasos activos.</small>
                          </div>
                          <select
                            value={flashcardScope}
                            onChange={(event) => setFlashcardScope(event.target.value as FlashcardScope)}
                          >
                            {FLASHCARD_SCOPE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flashcard-stats">
                          <span>{flashcardScopeTargets.length} nodos en alcance</span>
                          <span>{flashcardActiveTargets.length} con flashcard</span>
                        </div>
                        {flashcardScope === 'selection' ? (
                          <p className="flashcard-note">
                            {selectedNodeIds.length
                              ? `${selectedNodeIds.length} ${selectedNodeIds.length === 1 ? 'nodo seleccionado' : 'nodos seleccionados'}`
                              : 'Selecciona varios nodos con Shift + click o caja de selección.'}
                          </p>
                        ) : null}
                        {flashcardNeedsSelection ? (
                          <p className="empty-hint">
                            {flashcardScope === 'selection'
                              ? 'Selecciona varios nodos en el canvas (Shift + click o arrastre).'
                              : 'Selecciona un tema para controlar esta rama.'}
                          </p>
                        ) : null}
                        <div className="flashcard-actions">
                          <button
                            type="button"
                            onClick={() => handleFlashcardModeChange(true)}
                            disabled={!flashcardScopeTargets.length}
                          >
                            Activar modo
                          </button>
                          <button
                            type="button"
                            onClick={() => handleFlashcardModeChange(false)}
                            disabled={!flashcardActiveTargets.length}
                          >
                            Quitar modo
                          </button>
                        </div>
                        <div className="flashcard-actions secondary">
                          <button
                            type="button"
                            onClick={() => handleFlashcardReveal(false)}
                            disabled={!flashcardActiveTargets.length}
                          >
                            Ocultar tarjetas
                          </button>
                          <button
                            type="button"
                            onClick={() => handleFlashcardReveal(true)}
                            disabled={!flashcardActiveTargets.length}
                          >
                            Mostrar tarjetas
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </section>
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </GraphActionsProvider>
  );
};

export default App;
