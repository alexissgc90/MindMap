import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, useReactFlow, useStore } from 'reactflow';
import type { Node, NodeProps, ReactFlowState } from 'reactflow';
import type { NodeData } from '../types';
import { useGraphActions } from '../contexts/GraphActionsContext';
import './MindNode.css';

const palette = ['#2563eb', '#0ea5e9', '#22c55e', '#f97316', '#a855f7', '#ec4899'];

function getColor(level = 1, custom?: string) {
  if (custom) return custom;
  return palette[(level - 1) % palette.length];
}

type NearbyIndicator = {
  id: string;
  distance: number;
  node: Node<NodeData>;
};

const NEARBY_THRESHOLD = 160;

const MindNode = memo<NodeProps<NodeData>>(({ id, data, selected }) => {
  const nodes = useStore((state: ReactFlowState) => state.getNodes?.() ?? []);
  const accentColor = getColor(data?.level, data?.color);
  const fillColor = data?.fillColor ?? '#ffffff';
  const borderColor = data?.borderColor ?? accentColor;
  const borderWidth = data?.borderWidth ?? 2;
  const fontSize = data?.fontSize ?? 16;
  const fontFamily = data?.fontFamily ?? 'Inter, system-ui';
  const fontWeight = data?.fontWeight ?? 'bold';
  const fontStyle = data?.fontStyle ?? 'normal';
  const textDecoration = data?.textDecoration ?? 'none';
  const highlightColor = data?.highlightColor && data.highlightColor !== '#00000000'
    ? data.highlightColor
    : 'transparent';
  const bodyWidth = data?.bodyWidth ?? 220;
  const [draft, setDraft] = useState(data?.label ?? '');
  const [hovered, setHovered] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { setNodes } = useReactFlow();
  const { quickConnect, foldBranch, unfoldBranch } = useGraphActions();

  useEffect(() => {
    setDraft(data?.label ?? '');
  }, [data?.label]);

  useEffect(() => {
    if (data?.isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [data?.isEditing]);

  const setRevealState = (value: boolean) => {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? {
              ...node,
              data: { ...node.data, isRevealed: value },
            }
          : node,
      ),
    );
  };

  const flashcardHidden = Boolean(data?.flashcardMode && !data?.isRevealed);
  const childCount = data?.childCount ?? 0;
  const collapsedChildrenCount = data?.collapsedChildrenCount ?? 0;
  const isCollapsed = Boolean(data?.isCollapsed);
  const showCollapseToggle = childCount > 0 || isCollapsed;
  const collapseBadge = isCollapsed ? Math.max(collapsedChildrenCount, childCount) : childCount;

  const commit = () => {
    const next = draft.trim() || 'Nodo';
    setDraft(next);
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? {
              ...node,
              data: { ...node.data, label: next, isEditing: false },
            }
          : node,
      ),
    );
  };

  const nearbyNodes = useMemo(() => {
    if (!hovered || !nodes.length) return [] as NearbyIndicator[];
    const current = nodes.find((node) => node.id === id);
    if (!current) return [];
    return nodes
      .filter((node): node is Node<NodeData> => node.id !== id && !node.data?.isFloating)
      .map((node) => {
        const dx = node.position.x - current.position.x;
        const dy = node.position.y - current.position.y;
        const indicator: NearbyIndicator = { id: node.id, distance: Math.hypot(dx, dy), node };
        return indicator;
      })
      .filter((item) => item.distance < NEARBY_THRESHOLD)
      .sort((a, b) => a.distance - b.distance);
  }, [hovered, nodes, id]);

  return (
    <div
      className={`mind-node ${selected ? 'selected' : ''}`}
      style={{ borderColor, borderWidth, background: fillColor, width: bodyWidth }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="mind-node__handle mind-node__handle--top"
        style={{ borderColor: accentColor }}
      />
      <div className="mind-node__accent" style={{ background: borderColor }} />
      <div className="mind-node__content" style={{ fontFamily }}>
        {showCollapseToggle ? (
          <button
            type="button"
            className={`mind-node__collapse ${isCollapsed ? 'is-collapsed' : ''}`}
            onClick={(event) => {
              event.stopPropagation();
              if (isCollapsed) {
                unfoldBranch(id);
              } else {
                foldBranch(id);
              }
            }}
            title={isCollapsed ? 'Desplegar subtemas' : 'Plegar subtemas'}
          >
            {isCollapsed ? `+${collapseBadge}` : collapseBadge}
          </button>
        ) : null}
        {data?.isFloating ? <span className="mind-node__badge">Flotante</span> : null}
        {data?.flashcardMode && !flashcardHidden ? (
          <button
            type="button"
            className="mind-node__flashcard-toggle"
            onClick={(event) => {
              event.stopPropagation();
              setRevealState(false);
            }}
          >
            Ocultar
          </button>
        ) : null}
        {flashcardHidden ? (
          <div className="mind-node__flashcard">
            <span>Haz click para revelar</span>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setRevealState(true);
              }}
            >
              Mostrar
            </button>
          </div>
        ) : data?.isEditing ? (
          <input
            className="mind-node__input"
            value={draft}
            ref={inputRef}
            autoFocus
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                commit();
              }
              if (event.key === 'Escape') {
                setNodes((nodes) =>
                  nodes.map((node) =>
                    node.id === id
                      ? { ...node, data: { ...node.data, isEditing: false } }
                      : node,
                  ),
                );
              }
            }}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
          />
        ) : (
          <div
            className="mind-node__title"
            style={{
              color: data?.textColor ?? accentColor,
              fontSize: `${fontSize}px`,
              fontFamily,
              fontWeight,
              fontStyle,
              textDecoration,
              background: highlightColor,
            }}
          >
            {data?.label || 'Nodo'}
          </div>
        )}
        {!flashcardHidden && data?.description ? (
          <div
            className="mind-node__body"
            style={{
              fontSize: `${fontSize - 2}px`,
              fontFamily,
              fontWeight: fontWeight === 'bold' ? '600' : '400',
              fontStyle,
              color: data?.textColor ?? '#0f172a',
            }}
          >
            {data.description}
          </div>
        ) : null}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="mind-node__handle mind-node__handle--bottom"
        style={{ borderColor: accentColor }}
      />
      {hovered && nearbyNodes.length ? (
        <div className="mind-node__nearby">
          {nearbyNodes.slice(0, 3).map((item: NearbyIndicator) => (
            <button
              key={item.id}
              className="mind-node__nearby-btn"
              onClick={(event) => {
                event.stopPropagation();
                quickConnect(id, item.id);
              }}
            >
              ➜ {item.node.data?.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
});

export default MindNode;
