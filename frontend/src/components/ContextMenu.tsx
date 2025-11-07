import { memo } from 'react';
import './ContextMenu.css';

type MenuItem = {
  action: string;
  label: string;
};

type Props = {
  x: number;
  y: number;
  onAction: (action: string) => void;
  onClose: () => void;
  items?: MenuItem[];
};

const defaultItems: MenuItem[] = [
  { action: 'add-child', label: 'Agregar subtema' },
  { action: 'add-sibling', label: 'Agregar tema hermano' },
  { action: 'add-floating', label: 'Agregar tema flotante' },
  { action: 'duplicate', label: 'Duplicar' },
  { action: 'delete', label: 'Eliminar' },
  { action: 'fold-branch', label: 'Plegar rama' },
  { action: 'unfold-branch', label: 'Desplegar rama' },
  { action: 'show-branch', label: 'Mostrar solo esta rama' },
  { action: 'export-branch', label: 'Exportar rama (Markdown)' },
];

const ContextMenu = memo(({ x, y, onAction, onClose, items = defaultItems }: Props) => {
  return (
    <div className="context-menu" style={{ top: y, left: x }}>
      {items.map((item) => (
        <button
          key={item.action}
          onClick={() => {
            onAction(item.action);
            onClose();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
});

export default ContextMenu;
