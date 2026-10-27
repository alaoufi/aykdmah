import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon, IconPlus, IconArrow } from '../common/Icons';

const STEP_ICONS = [
  (p) => <Icon {...p}><path d="M9 5h6a2 2 0 0 1 2 2v12l-5-3-5 3V7a2 2 0 0 1 2-2Z" /><path d="M9 11h6M9 8h6" /></Icon>,
  (p) => <Icon {...p}><path d="M3 7h18l-2 11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L3 7Z" /><path d="M8 7V5a4 4 0 1 1 8 0v2" /></Icon>,
  (p) => <Icon {...p}><path d="m5 12 4 4L19 6" /></Icon>,
];

const TINTS = [
  { bg: '#e0f2fe', fg: '#0ea5e9' },
  { bg: '#ede9fe', fg: '#6366f1' },
  { bg: '#d1fae5', fg: '#10b981' },
];

export default function HowItWorks() {
  const { t } = useTranslation();
  const STEPS = [
    { num: '1', title: t('home.step_1_title'), desc: t('home.step_1_body') },
    { num: '2', title: t('home.step_2_title'), desc: t('home.step_2_body') },
    { num: '3', title: t('home.step_3_title'), desc: t('home.step_3_body') },
  ];
  return (
    <section className="py-14 md:py-20 bg-white border-y border-slate-100">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-10 md:mb-14">
          <div className="text-[12px] font-bold text-brand-600 mb-2">{t('home.how_it_works')}</div>
          <h2 className="text-ink text-2xl md:text-3xl lg:text-4xl font-extrabold tracking-tight">
            {t('home.how_it_works')}
          </h2>
        </div>

        <div className="relative grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
          <div className="hidden md:block absolute top-12 right-[16.66%] left-[16.66%] h-px border-t-2 border-dashed border-slate-200 z-0" />

          {STEPS.map((s, i) => {
            const I = STEP_ICONS[i];
            const tint = TINTS[i];
            return (
              <div
                key={i}
                className="relative bg-paper rounded-card p-6 md:p-7 text-center border border-slate-100 hover:border-brand-200 hover:shadow-card transition z-10"
              >
                <div className="relative w-24 h-24 mx-auto mb-5">
                  <span
                    className="absolute inset-0 rounded-full"
                    style={{ background: tint.bg, opacity: 0.6 }}
                  />
                  <span
                    className="absolute inset-3 rounded-full grid place-items-center"
                    style={{ background: '#fff', color: tint.fg, boxShadow: `0 8px 20px -8px ${tint.fg}55` }}
                  >
                    <I size={30} stroke={2.2} />
                  </span>
                  <span
                    className="absolute -top-1 -right-1 w-8 h-8 rounded-full grid place-items-center text-white font-extrabold text-[15px] shadow-soft"
                    style={{ background: 'linear-gradient(135deg, rgb(var(--color-primary-from)), rgb(var(--color-primary-to)))' }}
                  >
                    {s.num}
                  </span>
                </div>
                <h3 className="text-ink text-lg md:text-xl font-extrabold mb-2">{s.title}</h3>
                <p className="text-slate-500 text-[13.5px] leading-relaxed">{s.desc}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-10 md:mt-14 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/requests/new"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-pill text-white font-bold shadow-soft hover:shadow-lift transition no-underline"
            style={{ background: 'linear-gradient(135deg, rgb(var(--color-primary-from)), rgb(var(--color-primary-to)))' }}
          >
            <IconPlus size={18} />
            {t('home.new_request')}
          </Link>
          <Link
            to="/register?role=provider"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-pill bg-slate-100 hover:bg-slate-200 text-ink font-bold transition no-underline"
          >
            {t('auth.role_provider')}
            <IconArrow size={16} className="rotate-180" />
          </Link>
        </div>
      </div>
    </section>
  );
}
