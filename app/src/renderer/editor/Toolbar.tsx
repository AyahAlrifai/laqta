import { useI18n } from '../shared/i18n';
import { useWorkbench } from '../workbench/store';
import { commit, counts, redo, undo, type Tool } from './model';
import styles from './Editor.module.css';

/** Board 2 toolbar: Select, Box, Arrow, Text, Blur (n), Undo, Redo, Delete. */
export default function Toolbar() {
  const { t, f } = useI18n();
  const s = useWorkbench();
  const blurCount = counts(s.history.present).blurs;
  const tools: { id: Tool; label: string; key: string }[] = [
    { id: 'select', label: t('editor.toolSelect'), key: 'V' },
    { id: 'box', label: t('editor.toolBox'), key: 'B' },
    { id: 'arrow', label: t('editor.toolArrow'), key: 'A' },
    { id: 'text', label: t('editor.toolText'), key: 'T' },
    {
      id: 'redact',
      label: blurCount > 0 ? f('editor.toolBlur', { count: blurCount }) : t('editor.toolBlurPlain'),
      key: 'R',
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
        {tools.map((tool) => (
          <button
            key={tool.id}
            type="button"
            className={`btn btn-ghost ${s.tool === tool.id ? styles.toolActive : ''}`}
            aria-pressed={s.tool === tool.id}
            aria-keyshortcuts={tool.key}
            title={`${tool.label} (${tool.key})`}
            onClick={() => s.set({ tool: tool.id })}
          >
            {tool.label}
          </button>
        ))}
        <span className={styles.divider} aria-hidden="true" />
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => s.set({ history: undo(s.history), selectedId: null })}
          disabled={s.history.past.length === 0}
          aria-keyshortcuts="Control+Z Meta+Z"
        >
          {t('editor.undo')}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => s.set({ history: redo(s.history), selectedId: null })}
          disabled={s.history.future.length === 0}
          aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z"
        >
          {t('editor.redo')}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={removeSelected}
          disabled={s.selectedId === null}
          aria-keyshortcuts="Delete"
        >
          {t('editor.delete')}
        </button>
      </div>
      {s.tool === 'redact' && (
        <div className={styles.subtools}>
          <label className="label" htmlFor="blur-mode">
            {t('editor.blurMode')}
          </label>
          <select
            id="blur-mode"
            className="select"
            value={s.redactionMode}
            onChange={(e) =>
              s.set({ redactionMode: e.target.value === 'pixelate' ? 'pixelate' : 'fill' })
            }
          >
            <option value="fill">{t('editor.blurFill')}</option>
            <option value="pixelate">{t('editor.blurPixelate')}</option>
          </select>
        </div>
      )}
      {s.tool === 'text' && (
        <div className={styles.subtools}>
          <label className="label" htmlFor="text-label-input">
            {t('editor.textPrompt')}
          </label>
          <input
            id="text-label-input"
            className="input"
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
