import { useCallback, useEffect, useRef, useState } from 'react';

// Drag-to-resize for dashboard sidebars. Width is persisted per key so it
// survives reloads; collapsing is handled separately by the caller.
export function useResizableSidebar(storageKey, { min = 200, max = 380, initial = 248 } = {}) {
  const [width, setWidth] = useState(() => {
    const saved = Number(localStorage.getItem(storageKey));
    return saved >= min && saved <= max ? saved : initial;
  });
  const dragging = useRef(false);

  useEffect(() => { localStorage.setItem(storageKey, String(width)); }, [width, storageKey]);

  const onMouseDown = useCallback((e) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const move = (ev) => {
      if (!dragging.current) return;
      setWidth(Math.min(max, Math.max(min, ev.clientX)));
    };
    const up = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }, [min, max]);

  return { width, setWidth, onMouseDown };
}

export function ResizeHandle({ onMouseDown }) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      title="Drag to resize"
      onMouseDown={onMouseDown}
      className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize group/handle"
    >
      <div className="h-full w-px mx-auto bg-transparent group-hover/handle:bg-[#0F8594]/40 transition-colors" />
    </div>
  );
}
