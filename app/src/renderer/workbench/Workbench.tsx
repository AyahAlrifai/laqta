import { useCallback, useEffect, useState } from 'react';
import EditorStep from '../editor/EditorStep';
import ReviewStep from '../review/ReviewStep';
import { laqta } from '../shared/api';
import Dialog from '../shared/Dialog';
import { useI18n } from '../shared/i18n';
import { useWorkbench } from './store';
import styles from './Workbench.module.css';

async function toBitmap(png: Uint8Array): Promise<ImageBitmap> {
  return createImageBitmap(new Blob([new Uint8Array(png)], { type: 'image/png' }));
}

/**
 * The workbench window (spec section 3): Annotate and ask, then Review, in one window so
 * the draft stays in memory. The step follows the flow state owned by main.
 */
export default function Workbench() {
  const { t } = useI18n();
  const s = useWorkbench();
  const [base, setBase] = useState<ImageBitmap | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const setImage = useCallback(async (png: Uint8Array) => {
    const bitmap = await toBitmap(png);
    setBase((old) => {
      old?.close();
      return bitmap;
    });
    setImageUrl((old) => {
      if (old !== null) URL.revokeObjectURL(old);
      return URL.createObjectURL(new Blob([new Uint8Array(png)], { type: 'image/png' }));
    });
  }, []);

  useEffect(() => {
    const off = laqta.onSessionChanged((session) => useWorkbench.getState().set({ session }));
    void (async () => {
      const [session, view] = await Promise.all([laqta.sessionGet(), laqta.settingsGet()]);
      s.set({
        session,
        settingsView: view,
        projectKey: view.settings.defaultProjectKey,
        bugLanguage: view.settings.bugLanguage,
        voiceLanguage: view.settings.voiceLanguage,
      });
      const image = await laqta.sessionGetImage();
      await setImage(image.png);
      const review = await laqta.sessionGetReview();
      if (review !== null) {
        // A draft saved for later (T-050): restore the Review step as it was.
        s.set({
          projectKey: review.projectKey,
          bugLanguage: review.bugLanguage,
          prompt: review.prompt,
          aiDraft: review.draft,
          // Saved drafts hold the reviewer's edited text, already in display form.
          draft: review.draft,
          assignee: review.assignee,
          assigneeConfirmed: true,
          extraValues: Object.fromEntries(
            Object.entries(review.extraFields).map(([k, v]) => [k, typeof v === 'string' ? v : '']),
          ),
        });
      }
      laqta
        .jiraListProjects()
        .then((projects) => useWorkbench.getState().set({ projects }))
        .catch(() => undefined);
    })();
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- boot once
  }, []);

  const state = s.session?.state;
  const discard = () => setConfirmDiscard(true);

  if (base === null || state === undefined) return <p className={styles.loading}>…</p>;

  const reviewing = state === 'reviewing' || state === 'submitting' || state === 'verifying';

  return (
    <>
      {reviewing && s.draft !== null ? (
        <ReviewStep imageUrl={imageUrl} onDiscard={discard} />
      ) : (
        <EditorStep base={base} onImageReplaced={setImage} onDiscard={discard} />
      )}
      {confirmDiscard && (
        <Dialog
          role="alertdialog"
          title={t('confirm.discardTitle')}
          onCancel={() => setConfirmDiscard(false)}
          actions={
            <>
              <button type="button" className="btn" onClick={() => setConfirmDiscard(false)}>
                {t('confirm.keepEditing')}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => void laqta.sessionDiscard()}
              >
                {t('confirm.discard')}
              </button>
            </>
          }
        >
          <p>{t('confirm.discardBody')}</p>
        </Dialog>
      )}
    </>
  );
}
