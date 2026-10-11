"use client";

import { useRef, useState, type ReactNode } from "react";
import { EmptyState } from "./ui";

export interface Column<T> {
  key: string;
  label: string;
  /** CSS grid track, e.g. "1fr" or "56px". Defaults to auto. */
  width?: string;
  align?: "right";
  render: (row: T) => ReactNode;
}

const OPEN = -88;

/** Row that reveals a Delete action on left swipe. */
function SwipeRow({
  children, onClick, onDelete, cols,
}: {
  children: ReactNode;
  onClick?: () => void;
  onDelete?: () => void;
  cols: string;
}) {
  const [x, setX] = useState(0);
  const [drag, setDrag] = useState(false);
  const start = useRef<{ x: number; y: number; base: number; moved: boolean; axis?: "x" | "y" } | null>(null);
  const suppressClick = useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!onDelete) return;
    start.current = { x: e.clientX, y: e.clientY, base: x, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.axis && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) s.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    if (s.axis !== "x") return;
    s.moved = true;
    setDrag(true);
    setX(Math.max(OPEN - 24, Math.min(0, s.base + dx)));
  };
  const onPointerUp = () => {
    const s = start.current;
    start.current = null;
    setDrag(false);
    if (s?.moved) {
      suppressClick.current = true;
      setX((v) => (v < OPEN / 2 ? OPEN : 0));
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (x !== 0) {
      e.preventDefault();
      setX(0);
      return;
    }
    onClick?.();
  };

  return (
    <div className="swipe">
      {onDelete && (
        <button type="button" className="swipe-action" onClick={onDelete} tabIndex={x === OPEN ? 0 : -1} aria-label="Delete">
          Delete
        </button>
      )}
      <div
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        className={`tr${drag ? " dragging" : ""}${onClick ? " clickable" : ""}`}
        style={{ gridTemplateColumns: cols, transform: `translateX(${x}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={handleClick}
        onKeyDown={(e) => e.key === "Enter" && onClick?.()}
      >
        {children}
      </div>
    </div>
  );
}

export function DataTable<T extends { id: string }>({
  columns, rows, onRowClick, onDelete, empty = "Nothing logged yet.", onAdd, head = true,
}: {
  columns: Column<T>[];
  rows: T[];
  onRowClick?: (row: T) => void;
  onDelete?: (row: T) => void;
  empty?: string;
  onAdd?: () => void;
  head?: boolean;
}) {
  const cols = columns.map((c) => c.width ?? "auto").join(" ");
  if (!rows.length) {
    return (
      <div className="card">
        <EmptyState text={empty} onAdd={onAdd} />
      </div>
    );
  }
  return (
    <div className="card table">
      {head && (
        <div className="tr thead" style={{ gridTemplateColumns: cols }}>
          {columns.map((c) => (
            <div key={c.key} className={c.align === "right" ? "right" : undefined}>
              {c.label}
            </div>
          ))}
        </div>
      )}
      {rows.map((row) => (
        <SwipeRow
          key={row.id}
          cols={cols}
          onClick={onRowClick && (() => onRowClick(row))}
          onDelete={onDelete && (() => onDelete(row))}
        >
          {columns.map((c) => (
            <div key={c.key} className={c.align === "right" ? "right num" : "num"}>
              {c.render(row)}
            </div>
          ))}
        </SwipeRow>
      ))}
    </div>
  );
}

export { SwipeRow };
