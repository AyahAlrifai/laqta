import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../shared/i18n';
import { useWorkbench } from '../workbench/store';
import { bbox, commit, counts, hitTest, move, newId, type Shape } from './model';
import { drawScene } from './render';
import styles from './Editor.module.css';

interface Props {
  base: ImageBitmap;
}

type Drag =
  | { kind: 'create'; startX: number; startY: number }
  | { kind: 'move'; id: string; lastX: number; lastY: number; moved: boolean };

/** Spec section 5: the editor canvas with base, redaction and annotation layers. */
export default function AnnotationCanvas({ base }: Props) {
  const { f } = useI18n();
  const history = useWorkbench((s) => s.history);
  const tool = useWorkbench((s) => s.tool);
  const mode = useWorkbench((s) => s.redactionMode);
  const textLabel = useWorkbench((s) => s.textLabel);
  const selectedId = useWorkbench((s) => s.selectedId);
  const set = useWorkbench((s) => s.set);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Drag | null>(null);
  const [preview, setPreview] = useState<Shape | null>(null);
  const [liveShapes, setLiveShapes] = useState<Shape[] | null>(null);

  const shapes = liveShapes ?? history.present;
  const scale = Math.max(1, base.width / 1200);

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const all = preview ? [...shapes, preview] : shapes;
    drawScene(ctx, base, base.width, base.height, all, scale);
    const selected = shapes.find((s) => s.id === selectedId);
    if (selected) {
      const b = bbox(selected);
      ctx.save();
      ctx.setLineDash([8 * scale, 6 * scale]);
      ctx.lineWidth = 2 * scale;
      ctx.strokeStyle = '#2F5BEA';
      ctx.strokeRect(b.x - 6 * scale, b.y - 6 * scale, b.w + 12 * scale, b.h + 12 * scale);
      ctx.restore();
    }
  }, [base, shapes, preview, selectedId, scale]);

  const toImage = (event: React.PointerEvent) => {
    const el = canvas.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(((event.clientX - r.left) / r.width) * base.width),
      y: Math.round(((event.clientY - r.top) / r.height) * base.height),
    };
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus();
    const p = toImage(event);
    if (tool === 'select') {
      const hit = hitTest(history.present, p.x, p.y, 8 * scale);
      set({ selectedId: hit?.id ?? null });
      if (hit) drag.current = { kind: 'move', id: hit.id, lastX: p.x, lastY: p.y, moved: false };
      return;
    }
    if (tool === 'text') {
      if (textLabel.trim() === '') {
        document.getElementById('text-label-input')?.focus();
        return;
      }
      const shape: Shape = { id: newId(), kind: 'text', x: p.x, y: p.y, text: textLabel.trim() };
      set({ history: commit(history, [...history.present, shape]), selectedId: shape.id });
      return;
    }
    drag.current = { kind: 'create', startX: p.x, startY: p.y };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = toImage(event);
    if (d.kind === 'move') {
      const dx = p.x - d.lastX;
      const dy = p.y - d.lastY;
      d.lastX = p.x;
      d.lastY = p.y;
      d.moved = true;
      setLiveShapes((current) =>
        (current ?? history.present).map((s) => (s.id === d.id ? move(s, dx, dy) : s)),
      );
      return;
    }
    const x = Math.min(d.startX, p.x);
    const y = Math.min(d.startY, p.y);
    const w = Math.abs(p.x - d.startX);
    const h = Math.abs(p.y - d.startY);
    if (tool === 'box') setPreview({ id: 'preview', kind: 'box', x, y, w, h });
    if (tool === 'redact') setPreview({ id: 'preview', kind: 'redact', x, y, w, h, mode });
    if (tool === 'arrow')
      setPreview({ id: 'preview', kind: 'arrow', x1: d.startX, y1: d.startY, x2: p.x, y2: p.y });
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.releasePointerCapture(event.pointerId);
    const d = drag.current;
    drag.current = null;
    if (d?.kind === 'move') {
      if (d.moved && liveShapes) set({ history: commit(history, liveShapes) });
      setLiveShapes(null);
      return;
    }
    if (preview) {
      const b = bbox(preview);
      if (b.w >= 4 || b.h >= 4) {
        const shape = { ...preview, id: newId() };
        set({ history: commit(history, [...history.present, shape]), selectedId: shape.id });
      }
      setPreview(null);
    }
  };

  const c = counts(history.present);
  return (
    <canvas
      ref={canvas}
      className={`${styles.canvas} ${tool === 'select' ? styles.selectCursor : ''}`}
      width={base.width}
      height={base.height}
      role="img"
      tabIndex={0}
      aria-label={f('editor.canvasLabel', {
        width: base.width,
        height: base.height,
        boxes: c.boxes,
        arrows: c.arrows,
        texts: c.texts,
        blurs: c.blurs,
      })}
      aria-describedby="editor-shortcuts"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  );
}
