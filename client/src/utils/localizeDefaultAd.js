const DEFAULT_TITLE = 'مرحباً بك في منصة الخدمات';
const DEFAULT_DESCRIPTION = 'اطلب أي خدمة محلية بسهولة وسرعة';

const DEFAULT_COPY = {
  ar: { title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION },
  en: { title: 'Welcome to the services platform', description: 'Request any local service quickly and easily' },
  ur: { title: 'خدمات کے پلیٹ فارم پر خوش آمدید', description: 'کوئی بھی مقامی خدمت آسانی اور تیزی سے طلب کریں' },
  hi: { title: 'सेवा प्लेटफ़ॉर्म में आपका स्वागत है', description: 'कोई भी स्थानीय सेवा आसानी और तेज़ी से माँगें' },
  bn: { title: 'সেবা প্ল্যাটফর্মে আপনাকে স্বাগতম', description: 'যেকোনো স্থানীয় সেবা সহজে ও দ্রুত অনুরোধ করুন' },
};

// Only the unchanged, text-only platform welcome banner uses translated copy.
// Advertiser text, custom media, links and analytics records remain unchanged.
export function localizedDefaultAdCopy(ad, lang) {
  const copy = { title: ad?.title, description: ad?.description };
  if (!ad || Number(ad.id) !== 1 || ad.placement !== 'home_top'
      || ad.title !== DEFAULT_TITLE || ad.description !== DEFAULT_DESCRIPTION
      || ad.image || ad.link) return copy;
  const code = (lang || 'ar').toLowerCase().slice(0, 2);
  return { ...(DEFAULT_COPY[code] || DEFAULT_COPY.ar) };
}
