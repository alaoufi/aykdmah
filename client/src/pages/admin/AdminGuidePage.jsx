import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import GuideBook from '../../components/common/GuideBook';

const CHAPTERS = [
  ['users', 'admin.users', '/admin/users', 'users.manage'],
  ['locations', 'admin.locations', '/admin/locations', 'locations.manage'],
  ['categories', 'admin.categories', '/admin/categories', 'categories.manage'],
  ['conversations', 'admin.conversations_monitor', '/admin/conversations', 'conversations.read'],
  ['requests', 'admin.requests', '/admin/requests', 'requests.manage'],
  ['ads', 'admin.ads', '/admin/ads', 'ads.manage'],
  ['wallets', 'wallet.admin.title', '/admin/wallets', 'wallets.manage'],
  ['settings', 'admin.settings', '/admin/settings', 'settings.manage'],
  ['texts', 'admin.texts.title', '/admin/texts', 'texts.manage'],
];

export default function AdminGuidePage() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const chapters = CHAPTERS.filter(c => hasPermission(c[3]));
  return <article className="max-w-6xl mx-auto min-w-0">
    <h1 className="text-2xl font-extrabold mb-3">{t('help.admin_book_title')}</h1>
    <p className="text-fg-muted leading-loose">{t('help.admin_book_intro')}</p>
    {chapters.length > 0 && <GuideBook title={t('help.admin_book_title')} titles={chapters.map(c => t(c[1]))} ids={chapters.map(c => 'admin-guide-' + c[0])} images={chapters.map(c => '/guide/admin-' + c[0] + '.svg')}>
      {chapters.map(([id, key, url]) => <section key={id} id={'admin-guide-' + id} className="space-y-4">
        <p className="leading-loose">{t('help.admin_book_' + id)}</p>
        <Link to={url} className="inline-flex items-center min-h-11 px-4 py-2 rounded-lg bg-primary text-primary-fg font-bold no-underline">{t('common.view')} · {t(key)}</Link>
      </section>)}
    </GuideBook>}
    <Link to="/guide" className="text-primary underline">{t('help.title')}</Link>
  </article>;
}
