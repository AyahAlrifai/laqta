import { useCallback, useEffect, useRef, useState } from 'react';
import type { CaptureMode, OverlayFrame, Rect } from '../../shared/types';
import { laqta } from '../shared/api';
import { useI18n } from '../shared/i18n';
import styles from './Overlay.module.css';
import {
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

const BAR_HEIGHT = 76;

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
  const barLeft = rect ? Math.min(Math.max(rect.x, 16), Math.max(bounds.width - 560, 16)) : 16;
  const modes: { id: CaptureMode; label: string }[] = [
    { id: 'area', label: t('capture.modeArea') },
    ...(frame.windowModeAvailable
      ? [{ id: 'window' as const, label: t('capture.modeWindow') }]
      : []),
    { id: 'screen', label: t('capture.modeScreen') },
  ];

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
        className={styles.modeBar}
        style={{ top: barTop, left: barLeft }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div role="group" aria-label={t('capture.modes')} className={styles.modes}>
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`btn btn-ghost ${mode === m.id ? styles.modeActive : ''}`}
              aria-pressed={mode === m.id}
              onClick={() => applyMode(frame, m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <span className={styles.divider} aria-hidden="true" />
        <button type="button" className={`btn btn-ghost ${styles.muted}`} onClick={cancel}>
          {t('capture.escToCancel')}
        </button>
        <button type="button" className="btn btn-primary" onClick={finish} disabled={!rect}>
          {t('capture.continue')}
        </button>
      </div>
    </div>
  );
}
