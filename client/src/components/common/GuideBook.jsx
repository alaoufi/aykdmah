import { Children, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { guidePageForHash, guidePageIndex } from '../../utils/guideBook';
import './GuideBook.css';

// HTML remains selectable, zoomable and accessible. No canvas/WebGL or remote assets.
export default function GuideBook({ children, titles, ids, title, images = [] }) {
  const { t, i18n } = useTranslation();
  const chapters = Children.toArray(children);
  const [selectedPage, setPage] = useState(() => guidePageForHash(window.location.hash, ids) ?? 0);
  const page = guidePageIndex(selectedPage, chapters.length);
  const heading = useRef(null);
  const go = (index, focus = true) => {
    const next = guidePageIndex(index, chapters.length);
    setPage(next);
    if (ids[next]) window.history.replaceState(window.history.state, '', '#' + ids[next]);
    if (focus) requestAnimationFrame(() => heading.current?.focus());
  };
  useEffect(() => {
    const onHash = () => { const next = guidePageForHash(window.location.hash, ids); if (next !== null) {
      setPage(next);
      requestAnimationFrame(() => {
        const destination = document.getElementById(window.location.hash.slice(1));
        (destination || heading.current)?.scrollIntoView({ block: 'start', behavior: 'auto' });
      });
    } };
    window.addEventListener('hashchange', onHash);
    onHash();
    return () => window.removeEventListener('hashchange', onHash);
  }, [ids.join('|')]);
  const number = new Intl.NumberFormat(i18n.resolvedLanguage || 'ar');
  return <section className="guide-book" aria-label={title} data-testid="guide-book">
    <div className="guide-book-cover"><span aria-hidden="true">📖</span><strong>{title}</strong></div>
    <div className="guide-book-controls">
      <label className="guide-book-index">{t('help.book_contents')}
        <select aria-label={t('help.book_contents')} value={page} onChange={e => go(Number(e.target.value), false)}>
          {titles.map((label, i) => <option key={ids[i]} value={i}>{number.format(i + 1)}. {label}</option>)}
        </select>
      </label>
      <span aria-live="polite">{number.format(page + 1)} / {number.format(chapters.length)}</span>
    </div>
    <div className="guide-book-spread" key={page}>
      <aside className="guide-book-picture" aria-label={t('help.book_illustration')}>
        {images[page] && <img src={images[page]} alt={titles[page]} loading="lazy" width="720" height="1000" />}
        <div className="guide-book-picture-title"><span aria-hidden="true">{number.format(page + 1)}</span><strong>{titles[page]}</strong></div>
        <p>{t('help.book_illustration_note')}</p>
      </aside>
      <div className="guide-book-page">
        <h2 ref={heading} tabIndex={-1} className="guide-book-chapter">{titles[page]}</h2>
        {chapters[page]}
      </div>
    </div>
    <nav className="guide-book-controls" aria-label={t('help.book_navigation')}>
      <button type="button" disabled={page === 0} onClick={() => go(page - 1)}>{t('common.previous')}</button>
      <button type="button" disabled={page === chapters.length - 1} onClick={() => go(page + 1)}>{t('common.next')}</button>
    </nav>
  </section>;
}
