import api from './api';

const data = request => request.then(response => response.data.data);

export const getWallet = () => data(api.get('/wallet'));
export const applyCoupon = code => data(api.post('/wallet/coupon', { code }));
export const requestWithdrawal = body => data(api.post('/wallet/withdrawals', body));
export const cancelWithdrawal = id => data(api.post(`/wallet/withdrawals/${id}/cancel`));
export const previewGift = body => data(api.post('/wallet/gift/preview', body));
export const giftSubscription = body => data(api.post('/wallet/gift', body));

export const adminWallets = () => data(api.get('/wallet/admin'));
export const adminLedger = userId => data(api.get(`/wallet/admin/users/${userId}`));
export const adminAdjust = (userId, body) => data(api.post(`/wallet/admin/users/${userId}/adjust`, body));
export const adminProcessWithdrawal = (id, body) => data(api.post(`/wallet/admin/withdrawals/${id}`, body));
export const adminWalletSettings = body => data(api.put('/wallet/admin/settings', body));

// Server error codes become translated messages (wallet.errors.<code>).
export const walletError = (err, t) => {
  const code = err?.response?.data?.message;
  return t(`wallet.errors.${code}`, { defaultValue: t('wallet.errors.generic') });
};
