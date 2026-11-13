import { Component } from 'react';
import i18n from '../../i18n';
import { recoverFromChunkFailure, reloadFreshShell, isChunkLoadError } from '../../utils/chunkRecovery.js';

// What went wrong, in words the user can act on (AYK-044): no internet (theirs), a
// new site version (reloads by itself), or a fault on our side with a short code
// they can send us. The fault is also reported to the server log.
function reasonOf(error) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  if (isChunkLoadError(error)) return 'update';
  return 'ours';
}

function report(error, code) {
  try {
    const body = JSON.stringify({
      code, message: String(error?.message || error || '').slice(0, 300),
      stack: String(error?.stack || '').slice(0, 1500), path: window.location.pathname,
      version: document.querySelector('meta[name="aykdmh-build"]')?.content || '',
    });
    navigator.sendBeacon?.('/api/client-errors', new Blob([body], { type: 'application/json' }))
      || fetch('/api/client-errors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch (_) { /* reporting must never break the error page */ }
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, code: '' };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error, code: Date.now().toString(36).slice(-6).toUpperCase() };
  }
  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
    if (reasonOf(error) === 'ours') report(error, this.state.code);
    recoverFromChunkFailure(error);
  }
  render() {
    if (this.state.hasError) {
      const reason = reasonOf(this.state.error);
      // A calm card with the brand (AYK-143): what happened, a retry, and the way home.
      const icon = { offline: '📶', update: '🔄', ours: '🛠️' }[reason];
      return (
        <div data-testid="error-page" data-reason={reason}
          style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', padding: '24px 16px' }}>
          <div style={{ width: '100%', maxWidth: 420, background: 'var(--bg-card, #fff)', borderRadius: 24,
            boxShadow: '0 12px 40px rgba(15,23,42,.10)', border: '1px solid var(--border, #e5e7eb)', overflow: 'hidden', textAlign: 'center' }}>
            <div style={{ height: 6, background: 'linear-gradient(90deg, #1e6fd9, #f28c28)' }} />
            <div style={{ padding: '28px 24px 24px' }}>
              <img src="/brand/aykdmh-logo-256.png" alt="" width="64" height="64" style={{ margin: '0 auto', display: 'block', borderRadius: 16 }} />
              <div style={{ width: 64, height: 64, margin: '16px auto 0', borderRadius: '50%', display: 'grid', placeItems: 'center',
                fontSize: 30, background: 'var(--bg-soft, #f5f2ec)' }} aria-hidden="true">{icon}</div>
              <h2 style={{ margin: '16px 0 8px', fontSize: 21, fontWeight: 800, color: 'var(--text, #0f172a)' }}>{i18n.t(`errors.reason_${reason}_title`)}</h2>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.8, color: 'var(--text-secondary, #475569)' }}>{i18n.t(`errors.reason_${reason}_body`)}</p>
              <div style={{ display: 'flex', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-primary" style={{ flex: 1, minWidth: 140 }} onClick={() => reloadFreshShell()}>
                  ↻ {i18n.t('provider.retry_catalog')}
                </button>
                <a href="/" className="btn" style={{ flex: 1, minWidth: 140, border: '1px solid var(--border, #e5e7eb)', textDecoration: 'none' }}>
                  🏠 {i18n.t('nav.home')}
                </a>
              </div>
              {reason === 'ours' && (
                <p dir="ltr" style={{ margin: '18px auto 0', display: 'inline-block', padding: '3px 10px', borderRadius: 999, fontSize: 11,
                  color: 'var(--text-secondary, #94a3b8)', background: 'var(--bg-soft, #f5f2ec)' }}>
                  {i18n.t('errors.reason_code', { code: this.state.code })}
                </p>
              )}
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
