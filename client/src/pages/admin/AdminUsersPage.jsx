import { localizedJoinedName } from '../../utils/localizeJoined';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  listUsers, blockUser, unblockUser, deleteUser, createUser, updateUser,
} from '../../services/adminService';
import { apiError } from '../../services/api';
import Avatar from '../../components/common/Avatar';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import AdminButton from '../../components/admin/AdminButton';
import EmptyState from '../../components/admin/EmptyState';
import AdminFab from '../../components/admin/AdminFab';
import AdminPermissionsEditor from '../../components/admin/AdminPermissionsEditor';
import { useAuth } from '../../hooks/useAuth';
import { formatRelativeTime } from '../../utils/formatters';
import { IconSearch } from '../../components/common/Icons';

const ROLE_BADGE = {
  admin: 'bg-rose-50 text-rose-600',
  provider: 'bg-emerald-50 text-emerald-600',
  client: 'bg-brand-50 text-brand-700',
};

const EMPTY_FORM = { full_name: '', username: '', email: '', phone: '', facebook_id: '', password: '', role: 'client', is_active: true };

export default function AdminUsersPage() {
  const { t, i18n } = useTranslation();
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
  const [search, setSearch] = useState('');
  const [searchValue, setSearchValue] = useState('');
  const [page, setPage] = useState(1);

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [formError, setFormError] = useState('');
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
    listUsers({ role, search, page, limit: 20 })
      .then((res) => { if (version === loadVersion.current) { setItems(res.data || []); setMeta(res.meta); } })
      .catch((e) => { if (version === loadVersion.current) { setItems([]); setMeta(null); setError(apiError(e)); } })
      .finally(() => { if (version === loadVersion.current) setLoading(false); });
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [role, page, search]);

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
    if (u.role === 'admin' && !canEditPerms) { setError(t('errors.forbidden')); return; }
    ++editVersion.current;
    setEditing(u);
    setForm({
      full_name: u.full_name || '',
      username: u.username || '',
      email: u.email || '',
      phone: u.phone || '',
      facebook_id: u.facebook_id || '',
      password: '',
      role: u.role,
      is_active: !!u.is_active,
    });
    setFormError('');
    setShowPw(false);
    setEditOpen(true);
  };

  const closeEdit = () => {
    ++editVersion.current;
    setEditOpen(false); setForm(EMPTY_FORM); setEditing(null); setShowPw(false); setFormError('');
  };

  const onSave = async (e) => {
    e.preventDefault();
    if (saveInFlight.current) return;
    if (form.role === 'admin' && !canEditPerms) { setFormError(t('errors.forbidden')); return; }
    const version = editVersion.current;
    saveInFlight.current = true;
    setSaving(true);
    setFormError('');
    try {
      if (editing) {
        const payload = { ...form };
        if (!payload.password) delete payload.password;
        await updateUser(editing.id, payload);
      } else {
        await createUser(form);
      }
      if (version !== editVersion.current) return;
      closeEdit();
      load();
    } catch (err) {
      if (version === editVersion.current) setFormError(apiError(err) || t('errors.generic'));
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  };

  const askBlock = (u) => {
    if (u.role === 'admin' && !canEditPerms) { setError(t('errors.forbidden')); return; }
    if (u.is_blocked) {
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

  const askDelete = (u) => {
    if (u.role === 'admin' && !canEditPerms) { setError(t('errors.forbidden')); return; }
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
    <div className="space-y-6">
      <AdminPageHeader title={t('admin.users')} count={meta?.pagination?.total}>
        <AdminButton variant="primary" icon="+" onClick={openCreate}>
          {t('admin.create_user')}
        </AdminButton>
      </AdminPageHeader>

      {error && <div role="alert" className="px-4 py-3 rounded-card bg-rose-50 text-rose-700 text-[13px]">{error}</div>}

      <div className="bg-white rounded-card border border-slate-100 p-4 md:p-5 flex flex-wrap items-center gap-3 shadow-soft">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
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
        </div>
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
      <div className="md:hidden space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[110px] rounded-card bg-white border border-slate-100 animate-pulse" />
          ))
        ) : items.length === 0 ? (
          <div className="bg-white rounded-card border border-slate-100"><EmptyState icon="👥" title={t('admin.no_results')} /></div>
        ) : (
          items.map((u) => (
            <div key={u.id} className="bg-white rounded-card border border-slate-100 p-4 shadow-soft">
              <div className="flex items-start gap-3">
                <Avatar src={u.avatar} name={u.full_name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="cat-name-track">
                    <div className="cat-name-inner font-bold text-ink text-[14.5px]">{u.full_name || '—'}</div>
                  </div>
                  <div className="text-[11.5px] text-slate-500 truncate mt-0.5">{u.email}</div>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-pill text-[10.5px] font-bold ${ROLE_BADGE[u.role] || 'bg-slate-100 text-slate-600'}`}>
                      {ROLE_LABEL[u.role] || u.role}
                    </span>
                    {u.is_blocked ? (
                      <span className="px-2 py-0.5 rounded-pill bg-rose-50 text-rose-600 text-[10.5px] font-bold">{t('admin.is_blocked')}</span>
                    ) : u.is_active ? (
                      <span className="px-2 py-0.5 rounded-pill bg-emerald-50 text-emerald-600 text-[10.5px] font-bold">{t('admin.is_active')}</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-pill bg-slate-100 text-slate-500 text-[10.5px] font-bold">{t('admin.is_inactive')}</span>
                    )}
                    {u.city_name && (
                      <span className="px-2 py-0.5 rounded-pill bg-slate-100 text-slate-600 text-[10.5px] font-bold">📍 {localizedJoinedName(u, 'city', i18n.resolvedLanguage)}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-1.5 mt-3 pt-3 border-t border-slate-100">
                <button onClick={() => openEdit(u)} className="flex-1 px-3 py-1.5 rounded-pill text-[11.5px] font-semibold bg-brand-50 text-brand-700 hover:bg-brand-100 transition">{t('admin.edit')}</button>
                <button onClick={() => askBlock(u)} className={`flex-1 px-3 py-1.5 rounded-pill text-[11.5px] font-semibold transition ${
                  u.is_blocked ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                }`}>{u.is_blocked ? t('admin.unblock') : t('admin.block')}</button>
                <button onClick={() => askDelete(u)} className="flex-1 px-3 py-1.5 rounded-pill text-[11.5px] font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 transition">{t('admin.delete')}</button>
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
                <th className="px-5 py-3">{t('admin.users')}</th>
                <th className="py-3">{t('admin.field_role')}</th>
                <th className="py-3">{t('location.city')}</th>
                <th className="py-3">{t('admin.status')}</th>
                <th className="py-3">{t('admin.created_at')}</th>
                <th className="py-3 px-5 text-end">{t('admin.actions')}</th>
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
                  <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar src={u.avatar} name={u.full_name} size="sm" />
                        <div className="min-w-0">
                          <div className="text-[13.5px] font-bold text-ink truncate">{u.full_name}</div>
                          <div className="text-[11.5px] text-slate-500 truncate">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-pill text-[11px] font-bold ${ROLE_BADGE[u.role] || 'bg-slate-100 text-slate-600'}`}>
                        {ROLE_LABEL[u.role] || u.role}
                      </span>
                    </td>
                    <td className="py-3 text-[12.5px] text-slate-600">{localizedJoinedName(u, 'city', i18n.resolvedLanguage) || '—'}</td>
                    <td className="py-3">
                      {u.is_blocked ? (
                        <span className="inline-flex px-2.5 py-0.5 rounded-pill bg-rose-50 text-rose-600 text-[11px] font-bold">{t('admin.is_blocked')}</span>
                      ) : u.is_active ? (
                        <span className="inline-flex px-2.5 py-0.5 rounded-pill bg-emerald-50 text-emerald-600 text-[11px] font-bold">{t('admin.is_active')}</span>
                      ) : (
                        <span className="inline-flex px-2.5 py-0.5 rounded-pill bg-slate-100 text-slate-500 text-[11px] font-bold">{t('admin.is_inactive')}</span>
                      )}
                    </td>
                    <td className="py-3 text-[11.5px] text-slate-400">{formatRelativeTime(u.created_at)}</td>
                    <td className="py-3 px-5 text-end">
                      <div className="flex justify-end gap-1.5">
                        <button onClick={() => openEdit(u)} className="px-3 py-1.5 rounded-pill text-[11.5px] font-semibold bg-brand-50 text-brand-700 hover:bg-brand-100 transition">
                          {t('admin.edit')}
                        </button>
                        <button
                          onClick={() => askBlock(u)}
                          className={`px-3 py-1.5 rounded-pill text-[11.5px] font-semibold transition ${
                            u.is_blocked
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                          }`}
                        >
                          {u.is_blocked ? t('admin.unblock') : t('admin.block')}
                        </button>
                        <button
                          onClick={() => askDelete(u)}
                          className="px-3 py-1.5 rounded-pill text-[11.5px] font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 transition"
                        >
                          {t('admin.delete')}
                        </button>
                      </div>
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
        title={editing ? t('admin.edit_user') : t('admin.create_user')}
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
        <form id="AdminUsersPage-form" onSubmit={onSave} className="space-y-3">
          {formError && (
            <div className="px-3 py-2 rounded bg-rose-50 border border-rose-200 text-rose-700 text-[13px]">{formError}</div>
          )}
          <div>
            <label className="block text-[12px] font-bold text-ink mb-1">{t('admin.field_full_name')}</label>
            <input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className="w-full px-3 py-2 rounded-card border border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500 outline-none text-[14px]" />
          </div>
          <div className="px-3 py-2 rounded-card bg-blue-50 border border-blue-200 text-blue-700 text-[12px]">
            💡 {t('auth.identifiers_hint')}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-bold text-ink mb-1">{t('auth.username')}</label>
              <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="ahmad95" autoComplete="username"
                className="w-full px-3 py-2 rounded-card border border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500 outline-none text-[14px]" />
            </div>
            <div>
              <label className="block text-[12px] font-bold text-ink mb-1">{t('admin.field_email')}</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 rounded-card border border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500 outline-none text-[14px]" />
            </div>
            <div>
              <label className="block text-[12px] font-bold text-ink mb-1">{t('admin.field_phone')}</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+9665XXXXXXXX"
                className="w-full px-3 py-2 rounded-card border border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500 outline-none text-[14px]" />
            </div>
            <div>
              <label className="block text-[12px] font-bold text-ink mb-1">{t('auth.facebook_id')}</label>
              <input value={form.facebook_id} onChange={(e) => setForm({ ...form, facebook_id: e.target.value })}
                className="w-full px-3 py-2 rounded-card border border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500 outline-none text-[14px]" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-bold text-ink mb-1">
                {editing ? t('admin.field_password_optional') : t('admin.field_password')}
              </label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  required={!editing}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full px-3 py-2 rounded-card border border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500 outline-none text-[14px]"
                  style={{ paddingInlineEnd: '40px' }}
                />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  aria-label={showPw ? t('auth.hide_password') : t('auth.show_password')}
                  className="absolute top-1/2 -translate-y-1/2 w-8 h-8 grid place-items-center text-slate-500 hover:text-slate-700"
                  style={{ insetInlineEnd: '4px' }}>
                  {showPw ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-[12px] font-bold text-ink mb-1">{t('admin.field_role')}</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full px-3 py-2 rounded-card border border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500 outline-none text-[14px]">
                <option value="client">{t('auth.role_client')}</option>
                <option value="provider">{t('auth.role_provider')}</option>
                {canEditPerms && <option value="admin">{t('nav.admin')}</option>}
              </select>
            </div>
          </div>
          {editing && (
            <label className="inline-flex items-center gap-2 text-[13px] cursor-pointer">
              <input type="checkbox" checked={!!form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              <span>{t('admin.is_active')}</span>
            </label>
          )}
          {editing && form.role === 'admin' && canEditPerms && (
            <button type="button"
              onClick={() => { setPermsTarget({ id: editing.id, name: editing.full_name }); closeEdit(); }}
              className="w-full mt-2 px-4 py-2.5 rounded-card bg-amber-50 border-2 border-amber-200 text-amber-800 text-[13px] font-bold hover:bg-amber-100 transition">
              🔑 {t('admin.manage_permissions')}
            </button>
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
