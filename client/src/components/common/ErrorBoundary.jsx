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
      return (
        <div className="error-state" style={{ padding: 60 }} data-testid="error-page" data-reason={reason}>
          <h2>{i18n.t(`errors.reason_${reason}_title`)}</h2>
          <p className="text-secondary">{i18n.t(`errors.reason_${reason}_body`)}</p>
          {reason === 'ours' && <p className="text-secondary" style={{ fontSize: 12 }}>{i18n.t('errors.reason_code', { code: this.state.code })}</p>}
          <button className="btn btn-primary mt-3" onClick={() => reloadFreshShell()}>{i18n.t('provider.retry_catalog')}</button>
        </div>
      );
    }
    return this.props.children;
  }
}
