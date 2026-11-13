import type { CSSProperties, ReactElement } from 'react';
import type { StringKey } from '../../shared/strings';
import { useI18n } from '../shared/i18n';
import { useWorkbench } from '../workbench/store';
import { ANNOTATION_COLORS, commit, counts, redo, undo, type ShapeKind, type Tool } from './model';
import styles from './Editor.module.css';
import {
  ArrowIcon,
  BlurIcon,
  BoxIcon,
  RedoIcon,
  SelectIcon,
  TextIcon,
  UndoIcon,
} from './toolIcons';

const COLOR_NAMES: Record<(typeof ANNOTATION_COLORS)[number], StringKey> = {
  '#D6362B': 'editor.colorRed',
  '#F08C00': 'editor.colorOrange',
  '#F5C400': 'editor.colorYellow',
  '#1F9D55': 'editor.colorGreen',
  '#2F5BEA': 'editor.colorBlue',
  '#8B3FD9': 'editor.colorPurple',
  '#14171F': 'editor.colorBlack',
  '#FFFFFF': 'editor.colorWhite',
};

/**
 * Board 2 toolbar, one row (T-082): Select, Box, Arrow, Text, Blur (n), Undo, Redo, then only
 * the options for what is about to be drawn or is selected: the colour, and for Blur its
 * style. Deleting a shape is on the shape itself.
 */
export default function Toolbar() {
  const { t, f } = useI18n();
  const s = useWorkbench();
  const blurCount = counts(s.history.present).blurs;
  const tools: { id: Tool; label: string; key: string; icon: () => ReactElement }[] = [
    { id: 'select', label: t('editor.toolSelect'), key: 'V', icon: SelectIcon },
    { id: 'box', label: t('editor.toolBox'), key: 'B', icon: BoxIcon },
    { id: 'arrow', label: t('editor.toolArrow'), key: 'A', icon: ArrowIcon },
    { id: 'text', label: t('editor.toolText'), key: 'T', icon: TextIcon },
    {
      id: 'redact',
      label: blurCount > 0 ? f('editor.toolBlur', { count: blurCount }) : t('editor.toolBlurPlain'),
      key: 'R',
      icon: BlurIcon,
    },
  ];

  // The colour row follows the selected shape, otherwise the tool that is about to draw.
  const selected = s.history.present.find((x) => x.id === s.selectedId);
  const colorKind: ShapeKind | null = selected?.kind ?? (s.tool === 'select' ? null : s.tool);
  const pixelated =
    selected?.kind === 'redact'
      ? selected.mode === 'pixelate'
      : colorKind === 'redact' && s.redactionMode === 'pixelate';
  const currentColor =
    colorKind === null ? null : (selected?.color ?? s.colors[colorKind]).toUpperCase();
  const colorsDisabled = colorKind === null || pixelated;

  const pickColor = (color: string) => {
    if (colorKind === null) return;
    const colors = { ...s.colors, [colorKind]: color };
    if (selected) {
      s.set({
        colors,
        history: commit(
          s.history,
          s.history.present.map((x) => (x.id === selected.id ? { ...x, color } : x)),
        ),
      });
    } else {
      s.set({ colors });
    }
  };

  return (
    <div className={styles.toolbarWrap}>
      <div role="toolbar" aria-label={t('editor.tools')} className={styles.toolbar}>
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.id}
              type="button"
              className={`${styles.tool} ${tool.id === 'redact' ? styles.toolBlur : ''}`}
              aria-pressed={s.tool === tool.id}
              aria-keyshortcuts={tool.key}
              title={`${tool.label} (${tool.key})`}
              onClick={() => s.set({ tool: tool.id })}
            >
              <Icon />
              <span>{tool.label}</span>
            </button>
          );
        })}
        <span className={styles.divider} aria-hidden="true" />
        <button
          type="button"
          className={styles.iconTool}
          onClick={() => s.set({ history: undo(s.history), selectedId: null })}
          disabled={s.history.past.length === 0}
          aria-label={t('editor.undo')}
          title={t('editor.undo')}
          aria-keyshortcuts="Control+Z Meta+Z"
        >
          <UndoIcon />
        </button>
        <button
          type="button"
          className={styles.iconTool}
          onClick={() => s.set({ history: redo(s.history), selectedId: null })}
          disabled={s.history.future.length === 0}
          aria-label={t('editor.redo')}
          title={t('editor.redo')}
          aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z"
        >
          <RedoIcon />
        </button>
        {colorKind !== null && (
          <>
            <span className={styles.divider} aria-hidden="true" />
            <div
              role="radiogroup"
              aria-label={t('editor.color')}
              aria-disabled={colorsDisabled}
              className={styles.swatches}
              title={pixelated ? t('editor.colorPixelate') : t('editor.color')}
            >
              {ANNOTATION_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  role="radio"
                  aria-checked={currentColor === color}
                  aria-label={t(COLOR_NAMES[color])}
                  title={t(COLOR_NAMES[color])}
                  className={styles.swatch}
                  style={{ '--swatch': color } as CSSProperties}
                  disabled={colorsDisabled}
                  onClick={() => pickColor(color)}
                />
              ))}
            </div>
          </>
        )}
        {s.tool === 'redact' && (
          <>
            <span className={styles.divider} aria-hidden="true" />
            <div
              className={`${styles.segmented} ${styles.toolSegmented}`}
              role="radiogroup"
              aria-label={t('editor.blurMode')}
            >
              {(['fill', 'pixelate'] as const).map((mode) => (
                <span key={mode} className={styles.segment}>
                  <input
                    id={`blur-mode-${mode}`}
                    type="radio"
                    name="blur-mode"
                    checked={s.redactionMode === mode}
                    onChange={() => s.set({ redactionMode: mode })}
                  />
                  <label htmlFor={`blur-mode-${mode}`}>
                    {mode === 'fill' ? t('editor.blurFill') : t('editor.blurPixelate')}
                  </label>
                </span>
              ))}
            </div>
          </>
        )}
      </div>
      {s.tool === 'text' && <p className={styles.toolHint}>{t('editor.textHint')}</p>}
      <p id="editor-shortcuts" className="visually-hidden">
        {t('editor.shortcuts')}
      </p>
    </div>
  );
}
