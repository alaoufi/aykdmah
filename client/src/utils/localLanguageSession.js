import { abortLocalLanguage, assertLocalLanguageJob, localLanguageError } from './localLanguage.js';

// One lazy worker per account/conversation, shared by all message bubbles.
// Model weights may remain in the browser model cache, but jobs and results
// live only in memory and the worker is destroyed when its owner changes.
export class LocalLanguageSession {
  constructor({ workerFactory, isCurrent = () => true, timeoutMs = 15 * 60 * 1000 }) {
    this.workerFactory = workerFactory;
    this.isCurrent = isCurrent;
    this.timeoutMs = timeoutMs;
    this.worker = null;
    this.job = null;
    this.counter = 0;
    this.consent = new Set();
    this.destroyed = false;
  }

  current() { return !this.destroyed && this.isCurrent(); }

  allow(kind) { if (this.current()) this.consent.add(kind); }

  allowed(kind) { return this.current() && this.consent.has(kind); }

  run(payload, { owner, onProgress } = {}) {
    assertLocalLanguageJob(payload);
    if (!this.current()) throw abortLocalLanguage();
    if (!this.allowed(payload.kind)) throw localLanguageError('failed');
    if (this.job) throw localLanguageError('busy');
    const id = ++this.counter;
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    this.job = { id, owner, resolve, reject, onProgress, timer: null };
    try {
      if (!this.worker) {
        this.worker = this.workerFactory();
        this.worker.onmessage = event => this.receive(event.data);
        this.worker.onerror = () => this.fail(localLanguageError('unsupported'));
        this.worker.onmessageerror = () => this.fail(localLanguageError('failed'));
      }
      this.job.timer = setTimeout(() => this.fail(localLanguageError('failed')), this.timeoutMs);
      this.worker.postMessage({ type: 'run', id, ...payload }, payload.audio ? [payload.audio.buffer] : []);
    } catch (error) { this.fail(error?.code ? error : localLanguageError('unsupported')); }
    return promise;
  }

  receive(data) {
    const job = this.job;
    if (!job || !data || data.id !== job.id) return;
    if (!this.current()) { this.destroy(); return; }
    if (data.type === 'progress') {
      if (['loading', 'downloading', 'transcribing', 'translating'].includes(data.stage)) {
        job.onProgress?.({ stage: data.stage, percent: Number.isFinite(data.percent) ? Math.max(0, Math.min(100, Math.floor(data.percent))) : null });
      }
      return;
    }
    if (data.type === 'error') {
      const allowedCodes = ['failed', 'unsupported', 'too_long', 'same_language', 'audio_unsupported'];
      this.fail(localLanguageError(allowedCodes.includes(data.code) ? data.code : 'failed'));
      return;
    }
    if (data.type !== 'result') return;
    const result = data.result;
    if (!result || (result.translation != null && (typeof result.translation !== 'string' || result.translation.length > 20000))
        || (result.transcript != null && (typeof result.transcript !== 'string' || result.transcript.length > 12000))
        || (!result.translation?.trim() && !result.transcript?.trim())) {
      this.fail(localLanguageError('failed')); return;
    }
    clearTimeout(job.timer);
    this.job = null;
    job.resolve(result);
  }

  fail(error) {
    const job = this.job;
    this.job = null;
    if (job) { clearTimeout(job.timer); job.reject(error); }
    this.worker?.terminate();
    this.worker = null;
  }

  cancel(owner) {
    if (this.job && (owner == null || this.job.owner === owner)) this.fail(abortLocalLanguage());
  }

  destroy() {
    this.destroyed = true;
    this.consent.clear();
    this.fail(abortLocalLanguage());
  }
}
