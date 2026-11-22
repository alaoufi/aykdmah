import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listDirectory, saveToDirectory, contactDirect, contactDirectFresh, directoryChat } from '../../services/requestService';
import { apiError } from '../../services/api';
import { localizedJoinedName } from '../../utils/localizeJoined';
import { localizedName } from '../../utils/localize';
import TrustSummary from '../../components/reviews/TrustSummary';
import Avatar from '../../components/common/Avatar';
import { LoadingState } from '../../components/common/Spinner';
import { getConversation } from '../../services/chatService';
import { useCall } from '../../context/CallContext';
import BlockedNotice from '../../components/common/BlockedNotice';
import ProblemNotice from '../../components/common/ProblemNotice';
import DirectoryContacts from '../../components/directory/DirectoryContacts';
import ContactButtons from '../../components/providers/ContactButtons';
import useContactIntro from '../../hooks/useContactIntro';
import { ProviderStatus } from '../../components/common/AvailabilityBadge';
import ExpandableText from '../../components/common/ExpandableText';
import RowMenu from '../../components/admin/RowMenu';

// "My directory" (AYK-041): providers the requester kept, to contact again directly
// without posting a request. Each contact is still recorded as a request.
export default function DirectoryPage({ compact = false }) {
  const { t, i18n } = useTranslation();
  const intro = useContactIntro();
  const lang = i18n.resolvedLanguage || 'ar';
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(0);
  const [problem, setProblem] = useState('');

  useEffect(() => { listDirectory().then(setItems).catch(() => setItems([])); }, []);
  const { start: startCall } = useCall();

  const [problemWith, setProblemWith] = useState(null);
  // The raw error, for the message card with its reason and way out (AYK-219/221).
  const [problemError, setProblemError] = useState(null);
  const run = async (id, action) => {
    setBusy(id); setProblem(''); setProblemError(null); setProblemWith(id);
    try { await action(); } catch (err) { if (!err?.cancelled) { setProblem(apiError(err)); setProblemError(err); } } finally { setBusy(0); }
  };
  // Message: the existing chat, or (a provider) a direct request; call: through that chat (AYK-109).
  const chatWith = async p => {
    // Not a service provider (a requester kept from a chat): the open chat between us, or a plain
    // new one. Whoever is in the directory can always be written to (the owner's decision, AYK-260).
    if (p.is_provider === false) return (await directoryChat(p.id)).conversation_id;
    if (p.conversation_id) {
      const previous = await getConversation(p.conversation_id);
      // A conversation whose contact time ended is read-only: start a new one instead (AYK-221).
      if (previous.can_send === false) return (await contactDirectFresh(p.id, p.category_id)).conversation_id;
      // Writable: straight into it, no second request (AYK-231).
      return previous.id || p.conversation_id;
    }
    const res = await contactDirect(p.id, p.category_id);
    return res.conversation_id;
  };
  const contact = p => run(p.id, async () => navigate(`/chat/${await chatWith(p)}`));
  const call = p => run(p.id, async () => { const id = await chatWith(p); navigate(`/chat/${id}`); startCall(Number(id), 'audio'); });
  const remove = p => run(p.id, async () => { await saveToDirectory(p.id, false); setItems(rows => rows.filter(row => row.id !== p.id)); });

  if (items === null) return compact ? null : <LoadingState />;
  const shown = compact ? items.slice(0, 4) : items;
  return (
    <section data-testid="my-directory" className={compact ? '' : 'container page'}>
      <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
        <div>
          <h2 className="text-xl md:text-2xl font-extrabold text-fg m-0">📒 {t('requester.directory_title')}</h2>
          <p className="text-[13px] text-fg-muted mt-1 mb-0">{t('requester.directory_hint')}</p>
        </div>
        {compact && items.length > 0 && <Link to="/directory" className="text-[13px] font-semibold text-primary">{t('for_you.view_all')}</Link>}
      </div>
      {problem === t('errors.blocked_by_you')
        ? <BlockedNotice message={problem} otherId={problemWith} onUnblocked={() => setProblem('')} className="form-error" />
        : problemError && <ProblemNotice error={problemError} onClose={() => { setProblem(''); setProblemError(null); }}
          handlers={{ start_new: () => run(problemWith, async () => { const kept = items.find(row => row.id === problemWith); navigate(`/chat/${(kept?.is_provider === false ? await directoryChat(problemWith) : await contactDirectFresh(problemWith)).conversation_id}`); }) }} />}
      {items.length === 0
        ? <p className="card text-fg-muted text-[14px] m-0">{t('requester.directory_empty')}</p>
        : <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 list-none p-0 m-0">
          {shown.map(p => (
            <li key={p.id} className={`card ${p.is_provider === false ? 'tone-request' : 'tone-provider'} p-3 flex gap-3 items-start`} data-testid="directory-item">
              <Avatar src={p.avatar} name={p.nickname || p.business_name || p.full_name} />
              <div className="flex-1 min-w-0">
                {p.is_provider === false
                  ? <span className="font-bold text-fg truncate block">{p.nickname || p.full_name}</span>
                  : <Link to={`/providers/${p.id}`} className="font-bold text-fg truncate block">{p.nickname || p.business_name || p.full_name}</Link>}
                <div className="text-[12px] text-fg-muted">{p.nickname ? `${p.full_name} · ` : ''}<span dir="ltr">{p.referral_code}</span></div>
                <div className="text-[13px] text-fg-muted mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  {p.category_name && <span>🛠️ {localizedJoinedName(p, 'category', lang)}</span>}
                  {p.district_name_ar && <span>📍 {localizedName({ name_ar: p.district_name_ar, name_en: p.district_name_en }, lang)}</span>}
                  <TrustSummary userId={p.id} type={p.is_provider === false ? 'on_requester' : 'on_provider'} average={p.rating_avg} count={p.rating_count} opinion={p.opinion} />
                </div>
                {p.availability && <ProviderStatus availability={p.availability} coverage={p.coverage} name={p.nickname || p.business_name || p.full_name} className="mt-1.5" />}
                <ExpandableText text={p.bio} translated={p.bio_translated} lines={2} className="mt-2" testId="provider-bio" />
                {/* AYK-435: the same clear contact icons as every panel, with the introduction. The call
                    inside the app stays for people whose number is not shown. */}
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <ContactButtons size="sm" phone={p.public_phone} whatsapp={p.public_whatsapp} busy={busy === p.id} onChat={() => contact(p)}
                    testId="directory-contact" intro={intro({ service: p.is_provider === false ? null : (localizedJoinedName(p, 'category', lang) || null) })}
                    link={p.is_provider === false ? '/' : `/providers/${p.id}`} onCall={() => call(p)} />
                  {/* AYK-438 (the owner: «إزالة من دليلي ليس مكانها؛ داخل الدليل ثلاث نقط وفيها إزالة»):
                      «إزالة من دليلي» lives in the card's ⋮ menu, away from contact. */}
                  <span className="ms-auto">
                    <RowMenu label={t('common.more')} testId="directory-menu"
                      items={[{ label: t('requester.remove_directory'), icon: '✕', danger: true, onClick: () => remove(p) }]} />
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ol>}
      <DirectoryContacts compact={compact} />
    </section>
  );
}
