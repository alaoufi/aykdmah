import { useTranslation } from 'react-i18next';
import BackButton from '../common/BackButton';

export default function AdminPageHeader({ title, subtitle, children, count }) {
  const { t } = useTranslation();
  return (
    <div className="mb-6">
      <div className="mb-3"><BackButton /></div>
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-[12px] font-bold text-brand-600 mb-1">{t('admin.panel')}</div>
          <h1 className="text-ink text-2xl md:text-3xl font-extrabold tracking-tight">
            {title}
          </h1>
          {(subtitle || count != null) && (
            <p className="text-slate-500 text-sm mt-1">
              {subtitle}
              {count != null && (
                <span className="inline-block ms-2 px-2 py-0.5 rounded-pill bg-slate-100 text-slate-700 text-[11.5px] font-bold">
                  {count}
                </span>
              )}
            </p>
          )}
        </div>
        {children && <div className="flex gap-2 flex-wrap">{children}</div>}
      </div>
    </div>
  );
}
