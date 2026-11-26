import ScrollStrip from '../../components/common/ScrollStrip';
import { useAdminConfirmation } from '../../components/admin/confirmAdminChange';
import { localizedJoinedName } from '../../utils/localizeJoined';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  listUsers, blockUser, unblockUser, deleteUser, createUser, updateUser, setUserHidden,
} from '../../services/adminService';
import { apiError } from '../../services/api';
import Avatar from '../../components/common/Avatar';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/admin/AdminConfirmDialog';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import AdminButton from '../../components/admin/AdminButton';
import RowMenu from '../../components/admin/RowMenu';
import EmptyState from '../../components/admin/EmptyState';
import AdminFab from '../../components/admin/AdminFab';
import AdminPermissionsEditor from '../../components/admin/AdminPermissionsEditor';
import SpecialNumberPicker from '../../components/admin/SpecialNumberPicker';
import { useAuth } from '../../hooks/useAuth';
import { formatRelativeTime } from '../../utils/formatters';
import { IconSearch } from '../../components/common/Icons';
import { InfoButton, InfoPanel } from '../../components/common/InfoTip';

// AYK-415: a field's name with (i) beside it, a short line under it, and the full explanation in
// place. `label` may hold the field itself (a checkbox) when there is no `htmlFor`.
function HelpLabel({ htmlFor, label, short, info, className = 'block text-[12px] font-bold text-ink' }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    // AYK-462 (the owner: «أسطر متقاربة»): the short line joins the (i) panel instead of a line under the label.
    <div className="mb-0.5">
      <span className="flex items-center gap-1.5">
        <label htmlFor={htmlFor} className={className}>{label}</label>
        {(info || short) && <InfoButton open={open} onToggle={() => setOpen(v => !v)} controls={panelId} label={typeof label === 'string' ? label : ''} />}
      </span>
      <InfoPanel id={panelId} open={open}>{[short, info].filter(Boolean).join('\n')}</InfoPanel>
    </div>
  );
}

const ROLE_BADGE = {
  admin: 'bg-rose-50 text-rose-600',
  provider: 'bg-emerald-50 text-emerald-600',
  client: 'bg-brand-50 text-brand-700',
};

function NoSections() {
  return <span className="px-2 py-0.5 rounded-pill bg-amber-100 text-amber-900 text-[10.5px] font-bold" data-testid="no-sections">⚠️ بلا أقسام، لا يدخل الإدارة</span>;
}

// AYK-383: role is what the person is on the site; is_admin is the administration's rights, apart.
const EMPTY_FORM = { full_name: '', username: '', email: '', phone: '', facebook_id: '', password: '', role: 'client', is_admin: false, is_active: true };

// AYK-460 (the owner: «الرقم الذي بجوار المستخدم من أربعة أرقام، ماذا يعني؟ إذا داخلي لا داعي لعرضه»):
// «مستخدم 8872» is the name the site gives someone who signed up without one (the last four digits of
// his phone). Here it reads «بلا اسم», muted; the phone shows in full under it. The site keeps the name.
const AUTO_NAME = /^(مستخدم \d{4}|عضو( \d+)?)$/; // AYK-461: now «عضو» and the account number
function UserName({ u }) {
  const name = String(u.full_name || '').trim();
  if (!name || AUTO_NAME.test(name)) return <span className="text-slate-400 font-semibold" data-testid="user-no-name">بلا اسم</span>;
  return <>{name}</>;
}

export default function AdminUsersPage() {
  const { t, i18n } = useTranslation();
  const confirmAdminChange = useAdminConfirmation();
  const ROLE_TABS = [
    { value: '', label: t('common.all') },
    { value: 'client', label: t('auth.role_client') },
    { value: 'provider', label: t('auth.role_provider') },
    { value: 'admin', label: t('nav.admin') },
  ];
  const ROLE_LABEL = {
    admin: t('nav.admin'),
    provider: t('auth.role_provider'),
    client: t('auth.role_client'),
  };

  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState('');
  const [hiddenOnly, setHiddenOnly] = useState(false); // AYK-504
  const [search, setSearch] = useState('');
  const [searchValue, setSearchValue] = useState('');
  const [page, setPage] = useState(1);

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [formError, setFormError] = useState('');
  // Errors under the field they belong to (AYK-237), and the values the form opened with, so only
  // what was changed is sent and a stale or autofilled field elsewhere cannot block the save.
  const [fieldErrors, setFieldErrors] = useState({});
  const original = useRef(null);
  const [confirm, setConfirm] = useState({ open: false });
  const [permsTarget, setPermsTarget] = useState(null);
  const [error, setError] = useState('');
  const loadVersion = useRef(0);
  const editVersion = useRef(0);
  const saveInFlight = useRef(false);
  const { hasPermission } = useAuth();
  const canEditPerms = hasPermission('admins.manage');

  const load = () => {
    const version = ++loadVersion.current;
    setLoading(true); setError('');
    listUsers({ role, search, page, limit: 20, ...(hiddenOnly ? { visibility: 'hidden' } : {}) })
      .then((res) => { if (version === loadVersion.current) { setItems(res.data || []); setMeta(res.meta); } })
      .catch((e) => { if (version === loadVersion.current) { setItems([]); setMeta(null); setError(apiError(e)); } })
      .finally(() => { if (version === loadVersion.current) setLoading(false); });
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [role, page, search, hiddenOnly]);
  // AYK-452: the search runs as you type (a short pause), not only on Enter, which the phone keyboard
  // often does not send.
  useEffect(() => {
    if (searchValue.trim() === search) return undefined;
    const timer = setTimeout(() => { setPage(1); setSearch(searchValue.trim()); }, 350);
    return () => clearTimeout(timer);
  }, [searchValue]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSearch = (e) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchValue);
  };

  const openCreate = () => {
    ++editVersion.current;
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowPw(false);
    setFormError('');
    setEditOpen(true);
  };

  const openEdit = (u) => {
    if (u.is_admin && !canEditPerms) { setError(t('errors.forbidden')); return; }
    ++editVersion.current;
    setEditing(u);
    const opened = {
      full_name: u.full_name || '',
      username: u.username || '',
      email: u.email || '',
      phone: u.phone || '',
      facebook_id: u.facebook_id || '',
      password: '',
      role: u.role === 'admin' ? 'client' : u.role,
      is_admin: !!u.is_admin,
      is_active: !!u.is_active,
    };
    original.current = opened;
    setForm(opened);
    setFieldErrors({});
    setFormError('');
    setShowPw(false);
    setEditOpen(true);
  };

  const closeEdit = () => {
    ++editVersion.current;
    setEditOpen(false); setForm(EMPTY_FORM); setEditing(null); setShowPw(false); setFormError(''); setFieldErrors({});
    original.current = null;
  };

  const onSave = async (e) => {
    e.preventDefault();
    if (editing && !(await confirmAdminChange(t, editing.name_ar || editing.full_name || editing.title || editing.provider || ''))) return;
    if (saveInFlight.current) return;
    if (form.is_admin && !(editing?.is_admin) && !canEditPerms) { setFormError(t('errors.forbidden')); return; }
    const version = editVersion.current;
    saveInFlight.current = true;
    setSaving(true);
    setFormError('');
    setFieldErrors({});
    try {
      // AYK-356 (the owner: a member made «إدارة» could not get in): an administration account
      // enters only the sections ticked for it, and ticking them was a second step that was easy to
      // miss. Once an account becomes administration, its sections open at once.
      let newAdmin = null;
      if (editing) {
        // Only what changed (AYK-237); nothing changed closes the form.
        const before = original.current || {};
        const payload = Object.fromEntries(Object.entries(form).filter(([key, value]) => key !== 'password' && value !== before[key]));
        if (form.password) payload.password = form.password;
        if (Object.keys(payload).length) await updateUser(editing.id, payload);
        // Also when it was already administration but has no section yet (AYK-358).
        if (payload.is_admin === true || (form.is_admin && editing.admin_sections === 0)) newAdmin = { id: editing.id, name: editing.full_name };
      } else {
        const made = await createUser(form);
        if (form.is_admin && made?.id) newAdmin = { id: made.id, name: form.full_name };
      }
      if (version !== editVersion.current) return;
      closeEdit();
      load();
      if (newAdmin && canEditPerms) setPermsTarget(newAdmin);
    } catch (err) {
      if (version === editVersion.current) {
        const body = err?.response?.data || {};
        const list = Array.isArray(body.errors) ? body.errors : body.errors?.field ? [{ field: body.errors.field, message: body.message }] : [];
        const byField = {};
        for (const item of list) if (item?.field && !byField[item.field]) byField[item.field] = item.message && !/^invalid value$/i.test(item.message) ? item.message : t('admin.user_field_invalid');
        setFieldErrors(byField);
        setFormError(Object.keys(byField).length ? t('admin.user_fix_marked') : apiError(err) || t('errors.generic'));
      }
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  };

  const fieldClass = key => `w-full px-3 !py-1 !h-10 !min-h-0 rounded-card border ${fieldErrors[key] ? 'border-rose-400 bg-rose-50' : 'border-slate-200 bg-slate-50'} focus:bg-white focus:border-brand-500 outline-none text-[14px]`;
  const fieldError = key => fieldErrors[key] ? <p className="text-[12px] text-rose-700 mt-1 mb-0" data-testid={`field-error-${key}`}>⚠️ {fieldErrors[key]}</p> : null;

  const askBlock = async (u) => {
    if (u.is_admin && !canEditPerms) { setError(t('errors.forbidden')); return; }
    if (u.is_blocked) {
      if (!(await confirmAdminChange(t, u.full_name))) return;
      unblockUser(u.id).then(load).catch((e) => setError(apiError(e)));
      return;
    }
    setConfirm({
      open: true,
      title: t('admin.confirm_block_title'),
      body: t('admin.confirm_block_body', { name: u.full_name }),
      tone: 'danger',
      onConfirm: async () => {
        await blockUser(u.id);
        setConfirm({ open: false });
        load();
      },
    });
  };

  // AYK-504 (the owner): «إخفاء» takes the account off everything other people see, even their chats.
  const askHide = async (u) => {
    if (u.is_admin && !canEditPerms) { setError(t('errors.forbidden')); return; }
    if (u.hidden_at) {
      if (!(await confirmAdminChange(t, u.full_name))) return;
      setUserHidden(u.id, false).then(load).catch((e) => setError(apiError(e)));
      return;
    }
    setConfirm({
      open: true,
      title: 'إخفاء العضو',
      body: `سيختفي «${u.full_name}» من الموقع كله: قوائم مقدمي الخدمة والخريطة وصفحته العامة وطلباته وعروضه وتقييماته، ومن محادثات من تحدّثوا معه. يبقى حسابه يعمل عنده، ويمكنك إظهاره متى شئت.`,
      tone: 'danger',
      onConfirm: async () => {
        await setUserHidden(u.id, true);
        setConfirm({ open: false });
        load();
      },
    });
  };

  const menuItems = (u) => [
    { key: 'edit', label: t('admin.edit'), icon: '✏️', onClick: () => openEdit(u) },
    { key: 'block', label: u.is_blocked ? t('admin.unblock') : t('admin.block'), icon: u.is_blocked ? '✅' : '⛔', tone: u.is_blocked ? 'success' : 'warning', onClick: () => askBlock(u) },
    { key: 'hide', label: u.hidden_at ? 'إظهار' : 'إخفاء', icon: u.hidden_at ? '👁️' : '🙈', tone: u.hidden_at ? 'success' : 'warning', onClick: () => askHide(u) },
    { key: 'delete', label: t('admin.delete'), icon: '🗑️', tone: 'danger', onClick: () => askDelete(u) },
  ];

  const askDelete = (u) => {
    if (u.is_admin && !canEditPerms) { setError(t('errors.forbidden')); return; }
    setConfirm({
      open: true,
      title: t('admin.confirm_delete_title'),
      body: `${t('admin.confirm_delete_body')} (${u.full_name})`,
      tone: 'danger',
      onConfirm: async () => {
        await deleteUser(u.id);
        setConfirm({ open: false });
        load();
      },
    });
  };

  return (
    <div className="space-y-3">
      <AdminPageHeader title={t('admin.users')} count={meta?.pagination?.total}>
        <AdminButton variant="primary" icon="+" onClick={openCreate}>
          {t('admin.create_user')}
        </AdminButton>
      </AdminPageHeader>

      {error && <div role="alert" className="px-4 py-2 rounded-card bg-rose-50 text-rose-700 text-[13px]">{error}</div>}

      <div className="bg-white rounded-card border border-slate-100 p-4 md:p-5 flex flex-wrap items-center gap-3 shadow-soft">
        <ScrollStrip className="flex items-center gap-1.5 -mx-1 px-1">
          {ROLE_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => { setRole(tab.value); setPage(1); }}
              className={`shrink-0 px-4 py-2 rounded-pill text-[13px] font-semibold transition border ${
                role === tab.value
                  ? 'bg-ink text-white border-ink'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300 hover:text-brand-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </ScrollStrip>
        <label className="flex items-center gap-1.5 text-[12.5px] text-slate-600 cursor-pointer" data-testid="hidden-only">
          <input type="checkbox" checked={hiddenOnly} onChange={e => { setHiddenOnly(e.target.checked); setPage(1); }} /> المخفيون فقط
        </label>
        <form onSubmit={onSearch} className="flex-1 min-w-[200px] md:max-w-[320px] md:ms-auto relative">
          <span className="absolute inset-y-0 right-3 grid place-items-center text-slate-400 pointer-events-none">
            <IconSearch size={16} />
          </span>
          <input
            type="text"
            placeholder={t('admin.search_placeholder')}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="w-full pr-9 pl-3 py-2.5 rounded-pill border border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500 outline-none text-[13.5px]"
          />
        </form>
      </div>

      {/* Mobile: card layout (each user is one card with the full name on
          top, badges below, action row at the bottom — same pattern as
          categories/services). The table below is hidden on mobile. */}
      <div className="md:hidden space-y-1.5">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[110px] rounded-card bg-white border border-slate-100 animate-pulse" />
          ))
        ) : items.length === 0 ? (
          <div className="bg-white rounded-card border border-slate-100"><EmptyState icon="👥" title={t('admin.no_results')} /></div>
        ) : (
          items.map((u) => (
            // AYK-504 (the owner: «رتبها بشكل أفضل وقارب الأسطر»): one tight row, the ⋮ at its end.
            <div key={u.id} className={`rounded-card border px-2.5 py-2 shadow-soft ${u.hidden_at ? 'bg-slate-50 border-slate-200' : 'bg-white border-slate-100'}`} data-testid="user-row">
              <div className="flex items-center gap-2.5">
                <Avatar src={u.avatar} name={u.full_name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="cat-name-track">
                    <div className="cat-name-inner font-bold text-ink text-[14px]">{u.referral_code && <><b dir="ltr" className="inline-block font-extrabold text-[14.5px] text-fg bg-slate-100 border border-slate-300 rounded-md px-1.5 me-1.5 align-middle leading-tight">{u.referral_code}</b></>}{AUTO_NAME.test(String(u.full_name || '').trim()) ? 'بلا اسم' : u.full_name}</div>
                  </div>
                  <div className="text-[11.5px] text-slate-500 truncate" dir="auto">{[u.phone, u.email].filter(Boolean).join(' · ')}</div>
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    <span className={`px-1.5 py-px rounded-pill text-[10.5px] font-bold ${ROLE_BADGE[u.role] || 'bg-slate-100 text-slate-600'}`}>{ROLE_LABEL[u.role] || u.role}</span>
                    {!!u.is_admin && <span className="px-1.5 py-px rounded-pill bg-indigo-50 text-indigo-700 text-[10.5px] font-bold" data-testid="admin-mark">🛡️ إداري</span>}
                    {!!u.is_admin && u.admin_sections === 0 && <NoSections />}
                    {u.is_blocked ? (
                      <span className="px-1.5 py-px rounded-pill bg-rose-50 text-rose-600 text-[10.5px] font-bold">{t('admin.is_blocked')}</span>
                    ) : u.is_active ? (
                      <span className="px-1.5 py-px rounded-pill bg-emerald-50 text-emerald-600 text-[10.5px] font-bold">{t('admin.is_active')}</span>
                    ) : (
                      <span className="px-1.5 py-px rounded-pill bg-slate-100 text-slate-500 text-[10.5px] font-bold">{t('admin.is_inactive')}</span>
                    )}
                    {!!u.hidden_at && <span className="px-1.5 py-px rounded-pill bg-slate-200 text-slate-700 text-[10.5px] font-bold" data-testid="hidden-mark">🙈 مخفي</span>}
                    {u.city_name && <span className="px-1.5 py-px rounded-pill bg-slate-100 text-slate-600 text-[10.5px] font-bold">📍 {localizedJoinedName(u, 'city', i18n.resolvedLanguage)}</span>}
                  </div>
                </div>
                <RowMenu items={menuItems(u)} label={`خيارات ${u.full_name || ''}`} testId="user-menu" />
              </div>
            </div>
          ))
        )}
      </div>

      <div className="hidden md:block bg-white rounded-card border border-slate-100 shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="text-right text-[11.5px] font-bold text-slate-500 uppercase border-b border-slate-100 bg-slate-50/50">
                <th className="px-3 py-2">{t('admin.users')}</th>
                <th className="py-2">{t('admin.field_role')}</th>
                <th className="py-2">{t('location.city')}</th>
                <th className="py-2">{t('admin.status')}</th>
                <th className="py-2">{t('admin.created_at')}</th>
                <th className="py-2 px-5 text-end">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    <td colSpan="6" className="py-4 px-5">
                      <div className="h-12 bg-slate-100 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr><td colSpan="6"><EmptyState icon="👥" title={t('admin.no_results')} /></td></tr>
              ) : (
                items.map((u) => (
                  <tr key={u.id} className={`border-b border-slate-50 hover:bg-slate-50/50 transition ${u.hidden_at ? 'bg-slate-50' : ''}`} data-testid="user-row">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-3">
                        <Avatar src={u.avatar} name={u.full_name} size="sm" />
                        <div className="min-w-0">
                          <div className="text-[13.5px] font-bold text-ink truncate">{u.referral_code && <><b dir="ltr" className="inline-block font-extrabold text-[15px] text-fg bg-slate-100 border border-slate-300 rounded-md px-1.5 leading-6 me-2 align-middle" data-testid="user-number">{u.referral_code}</b>{'\u00a0\u00a0'}</>}<UserName u={u} /></div>
                          <div className="text-[11.5px] text-slate-500 truncate" dir="auto">{[u.phone, u.email].filter(Boolean).join(' · ')}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-pill text-[11px] font-bold ${ROLE_BADGE[u.role] || 'bg-slate-100 text-slate-600'}`}>
                        {ROLE_LABEL[u.role] || u.role}
                      </span>
                      {!!u.is_admin && <span className="ms-1 inline-flex px-2 py-0.5 rounded-pill bg-indigo-50 text-indigo-700 text-[11px] font-bold" data-testid="admin-mark">🛡️ إداري</span>}
                      {!!u.is_admin && u.admin_sections === 0 && <div className="mt-1"><NoSections /></div>}
                    </td>
                    <td className="py-2 text-[12.5px] text-slate-600">{localizedJoinedName(u, 'city', i18n.resolvedLanguage) || '—'}</td>
                    <td className="py-2">
                      {u.is_blocked ? (
                        <span className="inline-flex px-2.5 py-0.5 rounded-pill bg-rose-50 text-rose-600 text-[11px] font-bold">{t('admin.is_blocked')}</span>
                      ) : u.is_active ? (
                        <span className="inline-flex px-2.5 py-0.5 rounded-pill bg-emerald-50 text-emerald-600 text-[11px] font-bold">{t('admin.is_active')}</span>
                      ) : (
                        <span className="inline-flex px-2.5 py-0.5 rounded-pill bg-slate-100 text-slate-500 text-[11px] font-bold">{t('admin.is_inactive')}</span>
                      )}
                      {!!u.hidden_at && <span className="ms-1 inline-flex px-2 py-0.5 rounded-pill bg-slate-200 text-slate-700 text-[11px] font-bold" data-testid="hidden-mark">🙈 مخفي</span>}
                    </td>
                    <td className="py-2 text-[11.5px] text-slate-400">{formatRelativeTime(u.created_at)}</td>
                    <td className="py-2 px-5 text-end">
                      <div className="flex justify-end"><RowMenu items={menuItems(u)} label={`خيارات ${u.full_name || ''}`} testId="user-menu" /></div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {meta?.pagination && meta.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-slate-100">
            <span className="text-[12.5px] text-slate-500">
              {meta.pagination.page} / {meta.pagination.totalPages} — {meta.pagination.total}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={!meta.pagination.hasPrev}
                className="px-4 py-2 rounded-pill text-[12px] font-semibold bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {t('common.previous')}
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!meta.pagination.hasNext}
                className="px-4 py-2 rounded-pill text-[12px] font-semibold text-white shadow-soft disabled:opacity-40 disabled:cursor-not-allowed transition"
                style={{ background: 'linear-gradient(135deg, rgb(var(--color-primary-from)), rgb(var(--color-primary-to)))' }}
              >
                {t('common.next')}
              </button>
            </div>
          </div>
        )}
      </div>

      <Modal
        open={editOpen}
        onClose={closeEdit}
        title={editing ? `${t('admin.edit_user')}${editing.referral_code ? ` — ${editing.referral_code}` : ''}` : t('admin.create_user')}
        footer={
          <>
            <button onClick={closeEdit} className="px-4 py-2 rounded-pill bg-white hover:bg-slate-100 text-slate-700 text-[13px] font-semibold border border-slate-200 transition">
              {t('admin.cancel_btn')}
            </button>
            <button type="submit" form="AdminUsersPage-form" disabled={saving} className="px-4 py-2 rounded-pill text-white text-[13px] font-semibold shadow-soft hover:shadow-lift disabled:opacity-60 transition" style={{ background: 'linear-gradient(135deg, rgb(var(--color-primary-from)), rgb(var(--color-primary-to)))' }}>
              {saving ? t('admin.saving') : t('admin.save')}
            </button>
          </>
        }
      >
        <form id="AdminUsersPage-form" onSubmit={onSave} className="space-y-2" autoComplete="off">
          {/* AYK-462: the account number first, large, with the name and phone; the special number beside it. */}
          {editing && (
            <div className="rounded-card border-2 border-slate-300 bg-slate-50 p-2.5 space-y-2" data-testid="edit-user-number">
              <div className="flex items-center gap-3">
                <div className="shrink-0 text-center">
                  <div className="text-[10.5px] text-slate-500 font-bold">رقم الحساب</div>
                  <div dir="ltr" className="text-[28px] leading-none font-extrabold text-fg">{editing.referral_code || '—'}</div>
                </div>
                <div className="min-w-0 border-s border-slate-300 ps-3">
                  <div className="font-bold text-[14px] text-ink truncate">{AUTO_NAME.test(String(editing.full_name || '').trim()) ? 'بلا اسم' : editing.full_name}</div>
                  {editing.phone && <div dir="ltr" className="text-[12.5px] text-slate-500 text-end">{editing.phone}</div>}
                </div>
              </div>
              <SpecialNumberPicker user={editing} compact
                onChanged={done => { if (done?.referral_code) setEditing(e => ({ ...e, referral_code: done.referral_code })); load(); }} />
            </div>
          )}
          {formError && (
            <div className="px-3 py-2 rounded bg-rose-50 border border-rose-200 text-rose-700 text-[13px]">{formError}</div>
          )}
          <div>
            <HelpLabel htmlFor="user-full-name" label={t('admin.field_full_name')}
              short="الاسم الذي يظهر للناس في الموقع والتطبيق والمحادثات."
              info={'مطلوب، من حرفين إلى 150 حرفًا.\nيظهر في ملفه وفي المحادثات والطلبات والعروض، وفي قوائم الإدارة.\nمثال: «أحمد محمد العتيبي».'} />
            <input id="user-full-name" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} autoComplete="off"
              className={fieldClass('full_name')} />
            {fieldError('full_name')}
          </div>
          <p className="text-[11.5px] text-slate-500 m-0">💡 {t('auth.identifiers_hint')}</p>
          <div className="grid grid-cols-2 gap-x-2 gap-y-2">
            <div>
              <HelpLabel htmlFor="user-username" label={t('auth.username')}
                short="اسم قصير يدخل به بدل الجوال أو البريد. اختياري."
                info={'حروف وأرقام فقط، ويُسمح بالنقطة والشرطة والشرطة السفلية، دون مسافات، حتى 60 حرفًا.\nلا يتكرر: إن كان لحساب آخر يُرفض الحفظ.\nيكتبه في خانة الدخول مع كلمة المرور. مثال: ahmad95.\nيلزم واحد على الأقل من: اسم المستخدم أو البريد أو الجوال أو معرّف فيسبوك.'} />
              <input id="user-username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="ahmad95" autoComplete="off" name="ayk-admin-username"
                className={fieldClass('username')} />
              {fieldError('username')}
            </div>
            <div>
              <HelpLabel htmlFor="user-email" label={t('admin.field_email')}
                short="بريده الإلكتروني، ويمكنه الدخول به. اختياري."
                info={'يجب أن يكون بريدًا صحيحًا مثل name@example.com، ولا يتكرر بين الحسابات.\nيكتبه في خانة الدخول مع كلمة المرور.\nتغييره يُخرجه من الاتصال المفتوح فيعيد الدخول.\nإن تركته فارغًا فلا بد من طريقة دخول أخرى.'} />
              <input id="user-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="off" name="ayk-admin-email"
                className={fieldClass('email')} />
              {fieldError('email')}
            </div>
            <div>
              <HelpLabel htmlFor="user-phone" label={t('admin.field_phone')}
                short="رقم جواله بالصيغة الدولية، ويمكنه الدخول به. اختياري."
                info={'أرقام فقط مع علامة + في أوله، حتى 30 خانة، وتُحذف المسافات والأقواس تلقائيًا.\nلا يتكرر بين الحسابات.\nيدخل به مع كلمة المرور أو برمز يصله برسالة نصية.\nمثال: +966500000000.'} />
              <input id="user-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+9665XXXXXXXX" autoComplete="off" name="ayk-admin-phone"
                className={fieldClass('phone')} />
              {fieldError('phone')}
            </div>
            <div>
              <HelpLabel htmlFor="user-facebook" label={t('auth.facebook_id')}
                short="معرّف حسابه في فيسبوك، ويمكنه كتابته في خانة الدخول. اختياري."
                info={'نص حتى 120 حرفًا، ولا يتكرر بين الحسابات.\nهو طريقة دخول مثل اسم المستخدم: يكتبه في خانة الدخول مع كلمة المرور.\nلا يربط الحساب بفيسبوك ولا ينشر فيه شيئًا.\nاتركه فارغًا إن لم تحتجه.'} />
              <input id="user-facebook" value={form.facebook_id} onChange={(e) => setForm({ ...form, facebook_id: e.target.value })} autoComplete="off" name="ayk-admin-facebook"
                className={fieldClass('facebook_id')} />
              {fieldError('facebook_id')}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-2">
            <div>
              <HelpLabel htmlFor="user-password" label={editing ? 'كلمة مرور جديدة' : t('admin.field_password')}
                short={editing ? 'اكتب كلمة جديدة لتغييرها، أو اتركها فارغة لتبقى كما هي.' : 'كلمة المرور التي يدخل بها صاحب الحساب. أربعة أحرف على الأقل.'}
                info={'من 4 إلى 100 حرف. تُحفظ مشفّرة ولا يراها أحد بعد الحفظ، حتى الإدارة.\nزر العين يُظهر ما كتبته للتأكد منه.\nعند التعديل: الفراغ يُبقي كلمته الحالية، وكتابة كلمة جديدة تستبدلها وتُخرجه من الاتصال المفتوح ليدخل بها.\nأبلغ صاحب الحساب بها بطريقة آمنة.'} />
              <div className="relative">
                <input
                  id="user-password"
                  type={showPw ? 'text' : 'password'}
                  required={!editing}
                  autoComplete="new-password"
                  name="ayk-admin-new-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className={fieldClass('password')}
                  style={{ paddingInlineEnd: '40px' }}
                />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  aria-label={showPw ? t('auth.hide_password') : t('auth.show_password')}
                  className="absolute top-1/2 -translate-y-1/2 w-8 h-8 grid place-items-center text-slate-500 hover:text-slate-700"
                  style={{ insetInlineEnd: '4px' }}>
                  {showPw ? '🙈' : '👁️'}
                </button>
              </div>
              {fieldError('password')}
            </div>
            <div>
              <HelpLabel htmlFor="user-role" label="نوع الحساب في الموقع"
                short="نوعه في الموقع والتطبيق، منفصل عن الإدارة."
                info={'طالب خدمة: ينشر طلبات ويستقبل عروضًا.\nمقدم خدمة: يظهر في قوائم مقدمي الخدمة ويقدّم عروضًا على الطلبات.\nهذا لا يمنح أي دخول إلى لوحة الإدارة؛ ذلك في خانة «صلاحية إدارية».\nتغييره يُخرجه من الاتصال المفتوح فيعيد التحميل.'} />
              <select id="user-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full px-3 !py-1 !h-10 !min-h-0 rounded-card border border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500 outline-none text-[14px]">
                <option value="client">{t('auth.role_client')}</option>
                <option value="provider">{t('auth.role_provider')}</option>
              </select>
            </div>
          </div>
          {/* AYK-383 (the owner: «ممكن أكون مقدم خدمة ومسؤولًا إداريًا»): the administration's rights are
              apart from the site role; in the administration the account is the administration only. */}
          {canEditPerms && (
            <div className="rounded-card border border-indigo-200 bg-indigo-50 p-3" data-testid="admin-flag">
              <HelpLabel className="flex items-start gap-2 cursor-pointer"
                label={<><input type="checkbox" className="mt-1 w-4 h-4" checked={!!form.is_admin} onChange={e => setForm({ ...form, is_admin: e.target.checked })} />
                  <span className="text-[13px] text-indigo-900"><b>🛡️ صلاحية إدارية</b> — يدخل «لوحة الإدارة» بالأقسام التي تحددها له، ويبقى في الموقع {form.role === 'provider' ? 'مقدم خدمة' : 'طالب خدمة'} كما هو.</span></>}
                short="يفتح له لوحة الإدارة، بعد أن تحدد له الأقسام التي يدخلها."
                info={'التأشير وحده لا يفتح شيئًا: بعد الحفظ تظهر نافذة لتحديد الأقسام أو التبويبات التي يدخلها.\nيبقى نوع حسابه في الموقع كما هو، ويستخدم الموقع كالمعتاد.\nإزالة التأشير تمنعه من دخول لوحة الإدارة.\nتظهر هذه الخانة لمن يملك صلاحية إدارة حسابات الإدارة فقط.'} />
            </div>
          )}
          {form.is_admin && canEditPerms && (
            // AYK-358 (the owner: «هذا حسابه في صلاحية الإدارة» and still no «لوحة الإدارة»): the role
            // alone opens nothing; the sections ticked for the account do. Said here, beside the role.
            <div className="rounded-card bg-amber-50 border-2 border-amber-300 p-3 space-y-2" data-testid="admin-sections-box">
              <p className="text-[13px] font-bold text-amber-900">
                {editing && editing.admin_sections === -1 ? '✅ إدارة كاملة: يدخل كل الأقسام.'
                  : editing && editing.admin_sections > 0 ? `✅ يدخل ${editing.admin_sections} من أقسام الإدارة.`
                    : '⚠️ لن تظهر له «لوحة الإدارة» حتى تحدد له الأقسام التي يدخلها.'}
              </p>
              {editing ? (
                <button type="button"
                  onClick={() => { setPermsTarget({ id: editing.id, name: editing.full_name }); closeEdit(); }}
                  className="w-full px-4 py-2.5 rounded-card bg-white border-2 border-amber-300 text-amber-900 text-[13px] font-bold hover:bg-amber-100 transition">
                  🔑 تحديد الأقسام الآن
                </button>
              ) : <p className="text-[12px] text-amber-800">بعد الحفظ تفتح لك نافذة الأقسام مباشرة.</p>}
            </div>
          )}
          {editing && (
            <HelpLabel className="inline-flex items-center gap-2 text-[13px] cursor-pointer"
              label={<><input type="checkbox" checked={!!form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                <span>{t('admin.is_active')}</span></>}
              short="إزالة التأشير توقف الحساب: لا يستطيع الدخول ولا الاستخدام."
              info={'مؤشَّر: الحساب يعمل عاديًا.\nغير مؤشَّر: يُرفض دخوله وتظهر له رسالة أن حسابه غير مفعّل، ويُقطع اتصاله المفتوح. بياناته تبقى كما هي.\nيختلف عن «حظر» في القائمة، وعن الحذف الذي يزيل الحساب.\nأعد التأشير لإرجاعه.'} />
          )}
        </form>
      </Modal>

      <AdminPermissionsEditor
        open={!!permsTarget}
        userId={permsTarget?.id}
        userName={permsTarget?.name}
        onClose={() => setPermsTarget(null)}
        onSaved={() => { setPermsTarget(null); load(); }}
      />

      <ConfirmDialog {...confirm} onCancel={() => setConfirm({ open: false })} />
      <AdminFab onClick={openCreate} ariaLabel={t('admin.new')} />
    </div>
  );
}
