import { Component } from 'react';
import i18n from '../../i18n';
import { recoverFromChunkFailure, reloadFreshShell } from '../../utils/chunkRecovery.js';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
    recoverFromChunkFailure(error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="error-state" style={{ padding: 60 }}>
          <h2>{i18n.t('errors.unexpected')}</h2>
          <p className="text-secondary">{i18n.t('errors.generic')}</p>
          <button className="btn btn-primary mt-3" onClick={() => reloadFreshShell()}>{i18n.t('provider.retry_catalog')}</button>
        </div>
      );
    }
    return this.props.children;
  }
}
