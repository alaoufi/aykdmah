// What went wrong, why, and the way out (AYK-219). Every refusal or failure on the site is turned
// into { tone, icon, title, reason, fix, actions, jobs } and shown by <ProblemNotice>. It takes an
// API error (axios) or a message already translated.

export function explainProblem(input, t) {
  if (!input) return null;
  if (typeof input === 'string') {
    return { tone: 'warning', icon: '⚠️', title: t('problem.title_default'), reason: input, fix: t('problem.fix_default'),
      actions: [{ to: '/support', label: t('problem.action_support') }] };
  }
  const response = input.response;
  const data = response?.data || {};
  const code = data.errors?.code;
  const message = typeof data.message === 'string' && data.message ? data.message : null;
  const status = response?.status;
  const jobs = Array.isArray(data.errors?.jobs) ? data.errors.jobs : [];

  if (code === 'admin_account') {
    return { tone: 'info', icon: '🛡️', title: t('problem.title_account_type'), reason: message, fix: t('problem.fix_admin_account'),
      actions: [{ to: '/register?role=provider', label: t('problem.action_new_provider'), signOut: true }] };
  }
  if (code === 'active_jobs') {
    return { tone: 'warning', icon: '🧰', title: t('problem.title_account_type'), reason: message, fix: t('problem.fix_active_jobs'), jobs, actions: [] };
  }
  if (code === 'open_requests') {
    return { tone: 'warning', icon: '📋', title: t('problem.title_account_type'), reason: message, fix: t('problem.fix_open_requests'), jobs,
      actions: [{ handler: 'choose_both', label: t('problem.action_choose_both') }, { to: '/client', label: t('problem.action_my_requests') }] };
  }
  if (!response) {
    return { tone: 'warning', icon: '📡', title: t('problem.title_network'), reason: t('problem.reason_network'), fix: t('problem.fix_network'),
      actions: [{ handler: 'retry', label: t('problem.action_retry') }] };
  }
  if (status === 401) {
    return { tone: 'info', icon: '🔐', title: t('problem.title_login'), reason: message, fix: t('problem.fix_login'),
      actions: [{ to: '/login', label: t('problem.action_login') }] };
  }
  if (status === 423) {
    return { tone: 'warning', icon: '🔒', title: t('problem.title_locked'), reason: message, fix: t('problem.fix_locked'),
      actions: [{ to: '/forgot-password', label: t('problem.action_reset') }] };
  }
  if (status === 403) {
    return { tone: 'danger', icon: '⛔', title: t('problem.title_forbidden'), reason: message, fix: t('problem.fix_forbidden'),
      actions: [{ to: '/support', label: t('problem.action_support') }] };
  }
  if (status === 404) {
    return { tone: 'info', icon: '🔎', title: t('problem.title_not_found'), reason: message, fix: t('problem.fix_not_found'),
      actions: [{ to: '/', label: t('problem.action_home') }] };
  }
  if (status >= 500) {
    return { tone: 'danger', icon: '🛠️', title: t('problem.title_server'), reason: message, fix: t('problem.fix_server'),
      actions: [{ handler: 'retry', label: t('problem.action_retry') }, { to: '/support', label: t('problem.action_support') }] };
  }
  return { tone: 'warning', icon: '⚠️', title: t('problem.title_default'), reason: message, fix: t('problem.fix_default'),
    actions: [{ to: '/support', label: t('problem.action_support') }], jobs };
}
