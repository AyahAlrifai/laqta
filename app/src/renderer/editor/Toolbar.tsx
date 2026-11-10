import type { ReactElement } from 'react';
import { useI18n } from '../shared/i18n';
import { useWorkbench } from '../workbench/store';
import { commit, counts, redo, undo, type Tool } from './model';
import styles from './Editor.module.css';
import {
  ArrowIcon,
  BlurIcon,
  BoxIcon,
  RedoIcon,
  SelectIcon,
  TextIcon,
  TrashIcon,
  UndoIcon,
} from './toolIcons';

/** Board 2 toolbar: Select, Box, Arrow, Text, Blur (n), Undo, Redo, Delete. */
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
  const removeSelected = () => {
    if (s.selectedId === null) return;
    s.set({
      history: commit(
        s.history,
        s.history.present.filter((x) => x.id !== s.selectedId),
      ),
      selectedId: null,
    });
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
        <button
          type="button"
          className={styles.iconTool}
          onClick={removeSelected}
          disabled={s.selectedId === null}
          aria-label={t('editor.delete')}
          title={t('editor.delete')}
          aria-keyshortcuts="Delete"
        >
          <TrashIcon />
        </button>
      </div>
      {s.tool === 'redact' && (
        <div className={styles.subtools}>
          <span className={styles.subLabel} id="blur-mode-label">
            {t('editor.blurMode')}
          </span>
          <div className={styles.segmented} role="radiogroup" aria-labelledby="blur-mode-label">
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
        </div>
      )}
      {s.tool === 'text' && (
        <div className={styles.subtools}>
          <label className={styles.subLabel} htmlFor="text-label-input">
            {t('editor.textPrompt')}
          </label>
          <input
            id="text-label-input"
            className={`input ${styles.subInput}`}
            dir="auto"
            maxLength={80}
            placeholder={t('editor.textPlaceholder')}
            value={s.textLabel}
            onChange={(e) => s.set({ textLabel: e.target.value })}
          />
        </div>
      )}
      <p id="editor-shortcuts" className="visually-hidden">
        {t('editor.shortcuts')}
      </p>
    </div>
  );
}
