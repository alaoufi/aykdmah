import { useTranslation } from 'react-i18next';

export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  tone = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}) {
  const { t } = useTranslation();
  if (!open) return null;

  const confirmClass = tone === 'danger'
    ? 'bg-rose-600 hover:bg-rose-700 text-white'
    : tone === 'warning'
    ? 'bg-amber-500 hover:bg-amber-600 text-white'
    : tone === 'success'
    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
    : 'bg-brand-600 hover:bg-brand-700 text-white';

  return (
    <div
      className="fixed inset-0 z-[1000] bg-ink/55 backdrop-blur-sm grid place-items-center p-4"
      onClick={onCancel}
    >
      <div
        role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title"
        className="bg-white rounded-card shadow-lift w-full max-w-md overflow-hidden animate-[scaleIn_.15s_ease]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3">
          <h3 id="confirm-dialog-title" className="text-ink text-lg font-extrabold mb-2">
            {title || t('admin.confirm_action')}
          </h3>
          {body && <p className="text-slate-600 text-[14px] leading-relaxed">{body}</p>}
        </div>
        <div className="px-5 py-4 bg-slate-50 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 rounded-pill bg-white hover:bg-slate-100 text-slate-700 text-[13px] font-semibold border border-slate-200 transition disabled:opacity-60"
          >
            {cancelLabel || t('admin.cancel_btn')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 rounded-pill text-[13px] font-semibold transition disabled:opacity-60 ${confirmClass}`}
          >
            {loading ? t('common.loading') : (confirmLabel || t('admin.confirm_action'))}
          </button>
        </div>
      </div>
    </div>
  );
}
