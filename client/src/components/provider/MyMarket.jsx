import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getMyMarket, listCategories } from '../../services/serviceService';
import { localizedName } from '../../utils/localize';

// A provider's market in the neighbourhoods they cover (AYK-036): requesters living
// there, open requests waiting now, demand in the last 30 days and the competition.
export default function MyMarket() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const [data, setData] = useState(null);
  const [names, setNames] = useState(new Map());
  const [note, setNote] = useState(false);
  useEffect(() => {
    getMyMarket().then(setData).catch(() => setData({ categories: [] }));
    listCategories().then(rows => setNames(new Map(rows.map(row => [Number(row.id), row])))).catch(() => {});
  }, []);
  if (!data) return null;
  if (!data.categories.length) {
    return (
      <div className="card text-[14px] text-fg-muted" data-testid="my-market">
        📊 {t('market.setup_hint')} <Link to="/profile" className="font-semibold text-primary">{t('nav.profile')}</Link>
      </div>
    );
  }
  const total = key => data.categories.reduce((sum, row) => sum + (row[key] || 0), 0);
  // Every number opens what it counts (AYK-044): the requests board, the providers
  // map, or, for registered requesters (never listed, for their privacy), a short note.
  const box = 'block rounded-card bg-surface border border-border p-3 text-center no-underline text-inherit hover:border-primary transition';
  const inner = (icon, value, label) => (<>
    <div className="text-xl md:text-2xl font-extrabold text-fg">{icon} {value}</div>
    <div className="text-[11.5px] md:text-[12.5px] text-fg-muted mt-0.5 leading-snug">{label} ‹</div>
  </>);
  const tile = (icon, value, label, to) => <Link to={to} className={box} data-testid="market-tile">{inner(icon, value, label)}</Link>;
  return (
    <section data-testid="my-market" aria-labelledby="my-market-title">
      <h2 id="my-market-title" className="text-xl md:text-2xl font-extrabold text-fg m-0">📊 {t('market.title')}</h2>
      <p className="text-[13px] text-fg-muted mt-1 mb-3">{t('market.hint', { count: data.areas })}</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <button type="button" className={`${box} w-full font-[inherit] cursor-pointer`} aria-expanded={note} onClick={() => setNote(v => !v)} data-testid="market-tile">
          {inner('🙋', data.requesters_in_area, t('market.requesters_in_area'))}</button>
        {tile('📨', total('open_now'), t('market.open_now'), '/opportunities')}
        {tile('📈', total('requesters_30d'), t('market.requesters_30d'), '/opportunities')}
        {tile('👷', Math.max(...data.categories.map(row => row.competitors)), t('market.competitors'), '/providers/map')}
      </div>
      {note && <p className="text-[12.5px] text-fg-muted mt-2 mb-0 card" role="status">🙋 {t('market.requesters_note')}</p>}
      {data.categories.length > 1 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-[13px] text-fg">
            <thead><tr className="text-fg-muted text-[12px]">
              <th className="text-start font-semibold py-1.5">{t('for_you.profession')}</th>
              <th className="font-semibold">{t('market.open_now_short')}</th>
              <th className="font-semibold">{t('market.requests_30d_short')}</th>
              <th className="font-semibold">{t('market.competitors_short')}</th>
            </tr></thead>
            <tbody>
              {data.categories.map(row => (
                <tr key={row.category_id} className="border-t border-border">
                  <td className="py-1.5">{names.get(row.category_id)?.icon} {names.get(row.category_id) ? localizedName(names.get(row.category_id), lang) : '—'}</td>
                  <td className="text-center">{row.open_now}</td>
                  <td className="text-center">{row.requests_30d}</td>
                  <td className="text-center">{row.competitors}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
