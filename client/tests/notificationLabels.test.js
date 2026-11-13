import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { localizedNotification } from '../src/data/notificationLabels.js';

const { translate } = createRequire(import.meta.url)('../../server/utils/i18n.js');
const languages = ['ar', 'en', 'ur', 'hi', 'bn'];
const scripts = { ar: /[\u0600-\u06ff]/u, en: /[a-z]/iu, ur: /[\u0600-\u06ff]/u, hi: /[\u0900-\u097f]/u, bn: /[\u0980-\u09ff]/u };
const events = {
  new_offer: 'notif_new_offer_title', offer_accepted: 'notif_offer_accepted_title',
  offer_rejected: 'notif_offer_rejected_title', request_completed: 'notif_request_completed_title',
  new_review: 'notif_new_review_title', admin_assigned: 'status_updated',
  dispute_opened: 'dispute_opened_title', dispute_resolved: 'dispute_resolved_title',
  dispute_status: 'dispute_status_changed', dispute_message: 'dispute_new_message',
  subscription_activated: 'sub_activated', payment_success: 'payment_success',
};

test('platform notification titles follow the active language regardless of the stored source language', () => {
  for (const target of languages) {
    for (const source of languages) {
      for (const [type, key] of Object.entries(events)) {
        const result = localizedNotification({ type, title: translate(source, key), body: 'User text $& محمد' }, target);
        assert.equal(result.title, translate(target, key), `${type}: ${source} → ${target}`);
        assert.match(result.title, scripts[target]);
        assert.equal(result.body, 'User text $& محمد');
      }
    }
  }
});

test('offer templates translate across all five languages while preserving names, request titles and prices', () => {
  const name = 'محمد $& <b>plumber</b>';
  const title = 'تنظيف الحوش $& {{title}}';
  // Literal placeholder substitution mirrors the source template without
  // treating dollars in user-written text as replacement directives.
  const render = (language, key, values) => translate(language, key).replace(/\{\{(\w+)\}\}/g, (_, key) => values[key]);
  for (const target of languages) {
    for (const source of languages) {
      const offer = localizedNotification({ type: 'new_offer', title: translate(source, 'notif_new_offer_title'), body: render(source, 'notif_new_offer_body', { name, price: '40.50' }) }, target);
      assert.equal(offer.body, render(target, 'notif_new_offer_body', { name, price: '40.50' }));
      assert.ok(offer.body.includes(name));
      const accepted = localizedNotification({ type: 'offer_accepted', title: translate(source, 'notif_offer_accepted_title'), body: render(source, 'notif_offer_accepted_body', { title }) }, target);
      assert.equal(accepted.body, render(target, 'notif_offer_accepted_body', { title }));
      assert.ok(accepted.body.includes(title));
      const rejected = localizedNotification({ type: 'offer_rejected', title: translate(source, 'notif_offer_rejected_title'), body: translate(source, 'notif_offer_rejected_body') }, target);
      assert.equal(rejected.body, translate(target, 'notif_offer_rejected_body'));
    }
  }
});

test('completion, payment and subscription templates have native wording without changing their payload', () => {
  for (const target of languages) {
    const completion = localizedNotification({ type: 'request_completed', title: 'اكتمل الطلب', body: 'تم إكمال طلبك: إصلاح السباكة $&' }, target);
    assert.match(completion.body, scripts[target]);
    assert.ok(completion.body.endsWith('إصلاح السباكة $&'));
    const payment = localizedNotification({ type: 'payment_success', title: 'تمت عملية الدفع بنجاح', body: 'تم دفع 40.50 SAR' }, target);
    assert.match(payment.body, scripts[target]);
    assert.match(payment.body, /40\.50 SAR/);
    const subscription = localizedNotification({ type: 'subscription_activated', title: 'تم تفعيل اشتراكك', body: 'شكراً لاشتراكك في منصتنا' }, target);
    assert.match(subscription.body, scripts[target]);
    if (target !== 'ar') assert.notEqual(subscription.body, 'شكراً لاشتراكك في منصتنا');
  }
});

test('custom alerts, arbitrary event types and user-written chat previews remain unchanged', () => {
  const cases = [
    { type: 'new_offer', title: 'An administrator custom alert', body: 'قدم محمد عرضاً بقيمة 40' },
    { type: 'new_offer', title: 'عرض سعر جديد', body: 'A provider-written custom note' },
    { type: 'custom', title: 'اكتمل الطلب', body: 'تم إكمال طلبك: custom' },
    { type: 'constructor', title: 'عرض سعر جديد', body: 'custom' },
    // A person's real name or message can equal a platform label.
    { type: 'new_message', title: 'رسالة جديدة', body: 'مرفق جديد' },
    { type: 'new_message', title: 'محمد', body: 'شكراً لاشتراكك في منصتنا' },
  ];
  for (const target of languages) {
    for (const notification of cases) {
      const result = localizedNotification(notification, target);
      assert.equal(result.body, notification.body);
      if (notification.type !== 'new_offer' || notification.title !== 'عرض سعر جديد') assert.equal(result.title, notification.title);
    }
    assert.equal(localizedNotification({ type: 'payment_success', title: 'تمت عملية الدفع بنجاح', body: 'تم دفع private-data not-a-currency' }, target).body, 'تم دفع private-data not-a-currency');
  }
  assert.deepEqual(localizedNotification(null, 'en'), { title: '', body: '' });
});

test('chat system labels require both server provenance and an exact known label', () => {
  for (const target of languages) {
    for (const source of languages) {
      const result = localizedNotification({ type: 'new_message', title: 'محمد', body: translate(source, 'notif_new_attachment'), data: JSON.stringify({ system_body: 'new_attachment' }) }, target);
      assert.equal(result.title, 'محمد');
      assert.equal(result.body, translate(target, 'notif_new_attachment'));
      const fallback = localizedNotification({ type: 'new_message', title: translate(source, 'notif_new_message_title'), data: { system_title: 'new_message' } }, target);
      assert.equal(fallback.title, translate(target, 'notif_new_message_title'));
    }
    for (const data of ['invalid', [], { system_body: 'something_else' }, { system_title: 'new_message' }]) {
      assert.equal(localizedNotification({ type: 'new_message', title: 'محمد', body: 'مرفق جديد', data }, target).body, 'مرفق جديد');
    }
    assert.equal(localizedNotification({ type: 'new_message', title: 'محمد', body: 'User text', data: { system_body: 'new_attachment', system_title: 'new_message' } }, target).body, 'User text');
  }
});

test('dispute status labels translate while subjects, resolutions and comments remain verbatim', () => {
  for (const target of languages) {
    for (const status of ['open', 'under_review', 'waiting_response', 'escalated', 'resolved', 'rejected', 'closed']) {
      const result = localizedNotification({ type: 'dispute_status', title: 'تحديث حالة النزاع', body: `${status} — محل محمد $&` }, target);
      assert.match(result.body, scripts[target]);
      assert.ok(result.body.endsWith(' — محل محمد $&'));
      if (target !== 'en') assert.notEqual(result.body, `${status} — محل محمد $&`);
    }
    for (const [type, key] of [['dispute_opened', 'dispute_opened_title'], ['dispute_resolved', 'dispute_resolved_title'], ['dispute_message', 'dispute_new_message']]) {
      assert.equal(localizedNotification({ type, title: translate('ar', key), body: 'ملاحظة كتبها العميل أو الإدارة' }, target).body, 'ملاحظة كتبها العميل أو الإدارة');
    }
  }
});
