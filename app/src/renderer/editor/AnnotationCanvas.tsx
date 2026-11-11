import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useI18n } from '../shared/i18n';
import { useWorkbench } from '../workbench/store';
import {
  bbox,
  commit,
  counts,
  hitTest,
  MAX_LABEL_CHARS,
  move,
  newId,
  TEXT_SIZE,
  textOn,
  type Shape,
} from './model';
import { drawScene } from './render';
import { TrashIcon } from './toolIcons';
import styles from './Editor.module.css';

interface Props {
  base: ImageBitmap;
}

type Drag =
  | { kind: 'create'; startX: number; startY: number }
  | { kind: 'move'; id: string; lastX: number; lastY: number; moved: boolean };

/** Where the canvas is drawn inside its box, in CSS pixels. */
interface View {
  left: number;
  top: number;
  width: number;
}

/** Commits the label being typed, if any. Reads the store fresh: it runs from blur events. */
function commitTextDraft(): void {
  const s = useWorkbench.getState();
  const d = s.textDraft;
  if (d === null) return;
  const text = d.text.trim();
  const others = s.history.present.filter((x) => x.id !== d.id);
  if (text === '') {
    // Emptying an existing label deletes it; an empty new label is just dropped.
    if (d.id !== null) s.set({ history: commit(s.history, others), textDraft: null });
    else s.set({ textDraft: null });
    return;
  }
  const existing = s.history.present.find((x) => x.id === d.id);
  const color = existing?.color ?? s.colors.text;
  const shape: Shape = { id: d.id ?? newId(), kind: 'text', x: d.x, y: d.y, text, color };
  const next =
    d.id === null
      ? [...s.history.present, shape]
      : s.history.present.map((x) => (x.id === d.id ? shape : x));
  if (existing?.kind === 'text' && existing.text === text) {
    s.set({ textDraft: null, selectedId: shape.id });
    return;
  }
  s.set({ history: commit(s.history, next), textDraft: null, selectedId: shape.id });
}

/** Spec section 5: the editor canvas with base, redaction and annotation layers. */
export default function AnnotationCanvas({ base }: Props) {
  const { t, f } = useI18n();
  const history = useWorkbench((s) => s.history);
  const tool = useWorkbench((s) => s.tool);
  const mode = useWorkbench((s) => s.redactionMode);
  const colors = useWorkbench((s) => s.colors);
  const textDraft = useWorkbench((s) => s.textDraft);
  const selectedId = useWorkbench((s) => s.selectedId);
  const set = useWorkbench((s) => s.set);
  const canvas = useRef<HTMLCanvasElement>(null);
  const textInput = useRef<HTMLInputElement>(null);
  const drag = useRef<Drag | null>(null);
  const [preview, setPreview] = useState<Shape | null>(null);
  const [liveShapes, setLiveShapes] = useState<Shape[] | null>(null);
  const [view, setView] = useState<View | null>(null);

  // The label being edited is hidden on the canvas; the input stands in for it.
  const shapes = (liveShapes ?? history.present).filter(
    (s) => textDraft === null || s.id !== textDraft.id,
  );
  const scale = Math.max(1, base.width / 1200);

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const all = preview ? [...shapes, preview] : shapes;
    drawScene(ctx, base, base.width, base.height, all, scale);
    const selected = shapes.find((s) => s.id === selectedId);
    if (selected) {
      const b = bbox(selected, scale);
      ctx.save();
      ctx.setLineDash([8 * scale, 6 * scale]);
      ctx.lineWidth = 2 * scale;
      ctx.strokeStyle = '#2F5BEA';
      ctx.strokeRect(b.x - 6 * scale, b.y - 6 * scale, b.w + 12 * scale, b.h + 12 * scale);
      ctx.restore();
    }
  }, [base, shapes, preview, selectedId, scale]);

  // Track where the canvas sits, so the label editor and the delete button line up with it.
  useLayoutEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const measure = () =>
      setView({ left: el.offsetLeft, top: el.offsetTop, width: el.clientWidth });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Focus when an editor opens, not on every keystroke.
  const draftKey =
    textDraft === null
      ? null
      : `${textDraft.id ?? 'new'}:${String(textDraft.x)}:${String(textDraft.y)}`;
  useEffect(() => {
    if (draftKey !== null) textInput.current?.focus();
  }, [draftKey]);

  const toImage = (event: React.PointerEvent | React.MouseEvent) => {
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
    const wasTyping = useWorkbench.getState().textDraft !== null;
    // Focusing the canvas blurs an open label editor, which commits it first.
    event.currentTarget.focus();
    commitTextDraft();
    const p = toImage(event);
    const present = useWorkbench.getState().history.present;
    if (tool === 'select') {
      const hit = hitTest(present, p.x, p.y, 8 * scale, scale);
      set({ selectedId: hit?.id ?? null });
      if (hit) drag.current = { kind: 'move', id: hit.id, lastX: p.x, lastY: p.y, moved: false };
      return;
    }
    if (tool === 'text') {
      // The label editor opens and takes focus during this event; without this, the
      // mousedown that follows moves focus back to the canvas, whose blur commits the
      // still-empty label and removes it before anything can be typed.
      event.preventDefault();
      // A click away from an open label only finishes it.
      if (wasTyping) return;
      // Click where the label goes, then type on the image.
      const hit = hitTest(present, p.x, p.y, 4 * scale, scale);
      if (hit?.kind === 'text') {
        set({ textDraft: { id: hit.id, x: hit.x, y: hit.y, text: hit.text }, selectedId: null });
      } else {
        set({ textDraft: { id: null, x: p.x, y: p.y, text: '' }, selectedId: null });
      }
      return;
    }
    drag.current = { kind: 'create', startX: p.x, startY: p.y };
  };

  const onDoubleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const p = toImage(event);
    const hit = hitTest(history.present, p.x, p.y, 8 * scale, scale);
    if (hit?.kind === 'text') {
      set({ textDraft: { id: hit.id, x: hit.x, y: hit.y, text: hit.text }, selectedId: null });
    }
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
    if (tool === 'box') setPreview({ id: 'preview', kind: 'box', x, y, w, h, color: colors.box });
    if (tool === 'redact')
      setPreview({ id: 'preview', kind: 'redact', x, y, w, h, mode, color: colors.redact });
    if (tool === 'arrow')
      setPreview({
        id: 'preview',
        kind: 'arrow',
        x1: d.startX,
        y1: d.startY,
        x2: p.x,
        y2: p.y,
        color: colors.arrow,
      });
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

  const removeSelected = () => {
    if (selectedId === null) return;
    set({
      history: commit(
        history,
        history.present.filter((x) => x.id !== selectedId),
      ),
      selectedId: null,
    });
    canvas.current?.focus();
  };

  // Image pixels to CSS pixels inside the canvas box.
  const k = view ? view.width / base.width : 0;
  const selected =
    textDraft === null && liveShapes === null && preview === null
      ? history.present.find((s) => s.id === selectedId)
      : undefined;
  let deleteAt: { left: number; top: number } | null = null;
  if (view && selected) {
    const b = bbox(selected, scale);
    const pad = 6 * scale;
    deleteAt = {
      left: view.left + (b.x + b.w + pad) * k,
      top: Math.max(view.top + (b.y - pad) * k, 0),
    };
  }
  const draftColor =
    textDraft === null
      ? colors.text
      : (history.present.find((s) => s.id === textDraft.id)?.color ?? colors.text);

  const c = counts(history.present);
  return (
    <div className={styles.canvasBox}>
      <canvas
        ref={canvas}
        className={`${styles.canvas} ${tool === 'select' ? styles.selectCursor : ''} ${
          tool === 'text' ? styles.textCursor : ''
        }`}
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
        onDoubleClick={onDoubleClick}
      />
      {view && textDraft !== null && (
        <input
          ref={textInput}
          className={styles.textEditor}
          aria-label={t('editor.textPrompt')}
          placeholder={t('editor.textPlaceholder')}
          dir="auto"
          maxLength={MAX_LABEL_CHARS}
          value={textDraft.text}
          style={{
            left: view.left + textDraft.x * k,
            top: view.top + textDraft.y * k,
            fontSize: Math.max(11, TEXT_SIZE * scale * k),
            padding: `${String(6 * scale * k)}px ${String(8 * scale * k)}px`,
            background: draftColor,
            color: textOn(draftColor),
          }}
          onChange={(e) => set({ textDraft: { ...textDraft, text: e.target.value } })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitTextDraft();
              canvas.current?.focus();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              set({ textDraft: null });
              canvas.current?.focus();
            }
          }}
          onBlur={commitTextDraft}
        />
      )}
      {deleteAt !== null && (
        <button
          type="button"
          className={styles.shapeDelete}
          style={{ left: deleteAt.left, top: deleteAt.top }}
          aria-label={t('editor.deleteShape')}
          title={`${t('editor.deleteShape')} (Delete)`}
          aria-keyshortcuts="Delete"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={removeSelected}
        >
          <TrashIcon />
        </button>
      )}
    </div>
  );
}
