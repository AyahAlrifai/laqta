import type { StringKey } from '../../shared/strings';
import Dialog from '../shared/Dialog';
import { useI18n } from '../shared/i18n';
import styles from './Workbench.module.css';

interface Props {
  onClose: () => void;
}

const isMac = navigator.userAgent.includes('Mac');
const MOD = isMac ? '⌘' : 'Ctrl';

/** Each row: what it does, and the keys. Key names stay as printed on the key, except
 * entries that start with "shortcuts.", which are string keys (such as "scroll"). */
const ROWS: { label: StringKey; keys: string[][] }[] = [
  { label: 'shortcuts.tools', keys: [['V'], ['B'], ['A'], ['T'], ['R']] },
  { label: 'shortcuts.undo', keys: [[MOD, 'Z']] },
  { label: 'shortcuts.redo', keys: [[MOD, 'Shift', 'Z']] },
  { label: 'shortcuts.delete', keys: [[isMac ? '⌫' : 'Delete']] },
  { label: 'shortcuts.move', keys: [['←', '↑', '→', '↓']] },
  { label: 'shortcuts.generate', keys: [[MOD, '↵']] },
  { label: 'shortcuts.zoom', keys: [[MOD, 'shortcuts.scroll']] },
  { label: 'shortcuts.help', keys: [['?']] },
];

/** X-04 (T-089): every Workbench shortcut in one list, opened with ? or the header button. */
export default function ShortcutsDialog({ onClose }: Props) {
  const { t } = useI18n();
  const keyText = (k: string) => (k.startsWith('shortcuts.') ? t(k as StringKey) : k);
  return (
    <Dialog
      title={t('shortcuts.title')}
      onCancel={onClose}
      actions={
        <button type="button" className="btn" onClick={onClose}>
          {t('result.close')}
        </button>
      }
    >
      <dl className={styles.shortcuts}>
        {ROWS.map((row) => (
          <div key={row.label} className={styles.shortcutRow}>
            <dt>{t(row.label)}</dt>
            <dd dir="ltr">
              {row.keys.map((combo) => (
                <span key={combo.join('+')} className={styles.combo}>
                  {combo.map((k) => (
                    <kbd key={k}>{keyText(k)}</kbd>
                  ))}
                </span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
