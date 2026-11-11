import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import type { CaptureMode, OverlayFrame, Rect } from '../../shared/types';
import { laqta } from '../shared/api';
import { useI18n } from '../shared/i18n';
import styles from './Overlay.module.css';
import {
  AreaIcon,
  CancelIcon,
  ContinueIcon,
  GripIcon,
  ScreenIcon,
  WindowIcon,
} from './overlayIcons';
import {
  clampBar,
  defaultSelection,
  HANDLES,
  handlePoint,
  modeBarPlacement,
  normalize,
  nudge,
  resizeByHandle,
  resizeByKey,
  toPixels,
  type Handle,
} from './selection';

type Drag =
  | { kind: 'new'; x: number; y: number }
  | { kind: 'move'; dx: number; dy: number }
  | { kind: 'handle'; handle: Handle };

const BAR_HEIGHT = 50;
const BAR_STEP = 10;

/** Board 1: frozen frame, selection box with eight handles, size pill, mode bar, status pill. */
export default function Overlay() {
  const { t, f } = useI18n();
  const [frame, setFrame] = useState<OverlayFrame | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<CaptureMode>('area');
  const [rect, setRect] = useState<Rect | null>(null);
  const drag = useRef<Drag | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  const bar = useRef<HTMLDivElement>(null);
  // Where the user dragged the mode bar to; null keeps it next to the selection.
  const [barPos, setBarPos] = useState<{ x: number; y: number } | null>(null);
  const [barSize, setBarSize] = useState({ width: 420, height: BAR_HEIGHT });
  const barDrag = useRef<{ dx: number; dy: number } | null>(null);

  const ready = frame !== null && imageUrl !== null;
  useLayoutEffect(() => {
    const el = bar.current;
    if (!el) return;
    const measure = () =>
      setBarSize((old) =>
        old.width === el.offsetWidth && old.height === el.offsetHeight
          ? old
          : { width: el.offsetWidth, height: el.offsetHeight },
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ready]);

  useEffect(() => {
    let url: string | null = null;
    void laqta.overlayGetFrame().then((fr) => {
      url = URL.createObjectURL(new Blob([new Uint8Array(fr.jpeg)], { type: 'image/jpeg' }));
      setImageUrl(url);
      setFrame(fr);
      applyMode(fr, fr.initialMode);
      root.current?.focus();
    });
    return () => {
      if (url !== null) URL.revokeObjectURL(url);
    };
  }, []);

  const bounds = frame
    ? { width: frame.widthDip, height: frame.heightDip }
    : { width: 1, height: 1 };

  function applyMode(fr: OverlayFrame, next: CaptureMode) {
    setMode(next);
    if (next === 'screen') setRect({ x: 0, y: 0, width: fr.widthDip, height: fr.heightDip });
    else if (next === 'window' && fr.windowRect) setRect(fr.windowRect);
    else setRect(null);
  }

  const finish = useCallback(() => {
    if (!frame || !rect || done.current || rect.width < 1 || rect.height < 1) return;
    done.current = true;
    void laqta.captureComplete({ displayId: frame.displayId, rect, mode });
  }, [frame, rect, mode]);

  const cancel = useCallback(() => {
    if (done.current) return;
    done.current = true;
    void laqta.captureCancel();
  }, []);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
      return;
    }
    if (event.key === 'Enter' && event.target === root.current) {
      event.preventDefault();
      finish();
      return;
    }
    if (!event.key.startsWith('Arrow') || event.target !== root.current) return;
    event.preventDefault();
    const step = event.altKey ? 10 : 1;
    if (rect === null) {
      setMode('area');
      setRect(defaultSelection(bounds));
      return;
    }
    if (mode !== 'area') setMode('area');
    if (event.shiftKey) {
      setRect(resizeByKey(rect, event.key, step, bounds));
    } else {
      const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
      const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
      setRect(nudge(rect, dx, dy, bounds));
    }
  };

  const point = (event: React.PointerEvent) => {
    const box = root.current?.getBoundingClientRect();
    return { x: event.clientX - (box?.left ?? 0), y: event.clientY - (box?.top ?? 0) };
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    const p = point(event);
    const target = event.target as HTMLElement;
    const handle = target.dataset.handle as Handle | undefined;
    root.current?.setPointerCapture(event.pointerId);
    if (handle !== undefined && rect) {
      drag.current = { kind: 'handle', handle };
    } else if (target.dataset.selection === 'true' && rect) {
      drag.current = { kind: 'move', dx: p.x - rect.x, dy: p.y - rect.y };
    } else {
      drag.current = { kind: 'new', x: p.x, y: p.y };
      setMode('area');
      setRect(null);
    }
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = point(event);
    if (d.kind === 'new') setRect(normalize(d.x, d.y, p.x, p.y, bounds));
    else if (d.kind === 'move' && rect)
      setRect(nudge(rect, p.x - d.dx - rect.x, p.y - d.dy - rect.y, bounds));
    else if (d.kind === 'handle' && rect) {
      setMode('area');
      setRect(resizeByHandle(rect, d.handle, p.x, p.y, bounds));
    }
  };

  const onPointerUp = (event: React.PointerEvent) => {
    root.current?.releasePointerCapture(event.pointerId);
    if (drag.current?.kind === 'new' && rect && (rect.width < 4 || rect.height < 4)) setRect(null);
    drag.current = null;
  };

  if (!frame || imageUrl === null) return null;

  const px = rect ? toPixels(rect, frame.scaleFactor) : null;
  const placement = rect ? modeBarPlacement(rect, bounds, BAR_HEIGHT) : 'below';
  const barTop = rect
    ? placement === 'below'
      ? rect.y + rect.height + 16
      : placement === 'above'
        ? rect.y - 16 - BAR_HEIGHT
        : rect.y + rect.height - BAR_HEIGHT - 16
    : bounds.height - BAR_HEIGHT - 32;
  const barLeft = rect
    ? Math.min(Math.max(rect.x, 16), Math.max(bounds.width - barSize.width - 16, 16))
    : 16;
  const barAt = barPos ?? { x: barLeft, y: barTop };
  const modes: { id: CaptureMode; label: string; icon: () => ReactElement }[] = [
    { id: 'area', label: t('capture.modeArea'), icon: AreaIcon },
    ...(frame.windowModeAvailable
      ? [{ id: 'window' as const, label: t('capture.modeWindow'), icon: WindowIcon }]
      : []),
    { id: 'screen', label: t('capture.modeScreen'), icon: ScreenIcon },
  ];

  // The bar can be dragged anywhere by its grip (or by any spot that is not a button).
  const onBarPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    const onButton = target.closest('button');
    if (onButton !== null && onButton.dataset.grip !== 'true') return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const box = root.current?.getBoundingClientRect();
    barDrag.current = {
      dx: event.clientX - (box?.left ?? 0) - barAt.x,
      dy: event.clientY - (box?.top ?? 0) - barAt.y,
    };
  };
  const onBarPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const d = barDrag.current;
    if (!d) return;
    const box = root.current?.getBoundingClientRect();
    setBarPos(
      clampBar(
        {
          x: event.clientX - (box?.left ?? 0) - d.dx,
          y: event.clientY - (box?.top ?? 0) - d.dy,
        },
        barSize,
        bounds,
      ),
    );
  };
  const onBarPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (barDrag.current === null) return;
    barDrag.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };
  /** Keyboard moving: arrow keys on the grip (Shift for bigger steps). */
  const onGripKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!event.key.startsWith('Arrow')) return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? BAR_STEP * 5 : BAR_STEP;
    const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
    const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
    setBarPos(clampBar({ x: barAt.x + dx, y: barAt.y + dy }, barSize, bounds));
  };

  return (
    <div
      ref={root}
      className={styles.root}
      tabIndex={0}
      role="application"
      aria-label={t('capture.overlayLabel')}
      aria-describedby="capture-status"
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <img className={styles.frame} src={imageUrl} alt="" draggable={false} />
      {rect ? (
        <>
          <div
            className={styles.shade}
            style={{ left: 0, top: 0, width: '100%', height: rect.y }}
          />
          <div
            className={styles.shade}
            style={{ left: 0, top: rect.y + rect.height, width: '100%', bottom: 0 }}
          />
          <div
            className={styles.shade}
            style={{ left: 0, top: rect.y, width: rect.x, height: rect.height }}
          />
          <div
            className={styles.shade}
            style={{ left: rect.x + rect.width, top: rect.y, right: 0, height: rect.height }}
          />
          <div
            className={styles.selection}
            data-selection="true"
            style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
          />
          {HANDLES.map((h) => {
            const hp = handlePoint(rect, h);
            return (
              <div
                key={h}
                className={styles.handle}
                data-handle={h}
                style={{ left: hp.x - 6, top: hp.y - 6 }}
              />
            );
          })}
          {px && (
            <div
              className={styles.sizePill}
              style={{ left: rect.x, top: Math.max(rect.y - 44, 8) }}
              aria-hidden="true"
            >
              {f('capture.size', { width: px.width, height: px.height })}
            </div>
          )}
        </>
      ) : (
        <div className={styles.shade} style={{ inset: 0 }} />
      )}

      <div id="capture-status" className={styles.statusPill} role="status">
        <span className={styles.dot} aria-hidden="true" />
        {rect ? t('capture.status') : t('capture.noSelection')}
      </div>
      <p className="visually-hidden" aria-live="polite">
        {px ? f('capture.selection', { width: px.width, height: px.height }) : ''}
      </p>

      <div
        ref={bar}
        className={`${styles.modeBar} ${barPos !== null ? styles.modeBarMoved : ''}`}
        style={{ top: barAt.y, left: barAt.x }}
        onPointerDown={onBarPointerDown}
        onPointerMove={onBarPointerMove}
        onPointerUp={onBarPointerUp}
      >
        <button
          type="button"
          className={styles.grip}
          data-grip="true"
          aria-label={t('capture.moveBar')}
          title={t('capture.moveBarHint')}
          onKeyDown={onGripKeyDown}
          onDoubleClick={() => setBarPos(null)}
        >
          <GripIcon />
        </button>
        <div role="group" aria-label={t('capture.modes')} className={styles.modes}>
          {modes.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                type="button"
                className={`${styles.barBtn} ${mode === m.id ? styles.modeActive : ''}`}
                aria-pressed={mode === m.id}
                onClick={() => applyMode(frame, m.id)}
              >
                <Icon />
                {m.label}
              </button>
            );
          })}
        </div>
        <span className={styles.divider} aria-hidden="true" />
        <button type="button" className={`${styles.barBtn} ${styles.muted}`} onClick={cancel}>
          <CancelIcon />
          {t('capture.escToCancel')}
        </button>
        <button
          type="button"
          className={`${styles.barBtn} ${styles.primary}`}
          onClick={finish}
          disabled={!rect}
        >
          <ContinueIcon />
          {t('capture.continue')}
        </button>
      </div>
    </div>
  );
}
