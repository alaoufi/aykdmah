const DEFAULT_TITLE = 'مرحباً بك في منصة الخدمات';
const DEFAULT_DESCRIPTION = 'اطلب أي خدمة محلية بسهولة وسرعة';

const DEFAULT_COPY = {
  ar: { title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION },
  en: { title: 'Welcome to the services platform', description: 'Request any local service quickly and easily' },
  ur: { title: 'خدمات کے پلیٹ فارم پر خوش آمدید', description: 'کوئی بھی مقامی خدمت آسانی اور تیزی سے طلب کریں' },
  hi: { title: 'सेवा प्लेटफ़ॉर्म में आपका स्वागत है', description: 'कोई भी स्थानीय सेवा आसानी और तेज़ी से माँगें' },
  bn: { title: 'সেবা প্ল্যাটফর্মে আপনাকে স্বাগতম', description: 'যেকোনো স্থানীয় সেবা সহজে ও দ্রুত অনুরোধ করুন' },
  ml: { title: 'സേവന പ്ലാറ്റ്‌ഫോമിലേക്ക് സ്വാഗതം', description: 'ഏത് പ്രാദേശിക സേവനവും എളുപ്പത്തിലും വേഗത്തിലും ആവശ്യപ്പെടുക' },
  fil: { title: 'Maligayang pagdating sa platform ng mga serbisyo', description: 'Humiling ng anumang lokal na serbisyo nang mabilis at madali' },
  id: { title: 'Selamat datang di platform layanan', description: 'Minta layanan lokal apa pun dengan cepat dan mudah' },
  ne: { title: 'सेवा प्लेटफर्ममा स्वागत छ', description: 'कुनै पनि स्थानीय सेवा छिटो र सजिलै माग्नुहोस्' },
  am: { title: 'ወደ አገልግሎቶች መድረክ እንኳን በደህና መጡ', description: 'ማንኛውንም የአካባቢ አገልግሎት በቀላሉና በፍጥነት ይጠይቁ' },
  tr: { title: 'Hizmet platformuna hoş geldiniz', description: 'Her türlü yerel hizmeti hızlı ve kolayca isteyin' },
};

// Only the unchanged, text-only platform welcome banner uses translated copy.
// Advertiser text, custom media, links and analytics records remain unchanged.
export function localizedDefaultAdCopy(ad, lang) {
  const copy = { title: ad?.title, description: ad?.description };
  if (!ad || Number(ad.id) !== 1 || ad.placement !== 'home_top'
      || ad.title !== DEFAULT_TITLE || ad.description !== DEFAULT_DESCRIPTION
      || ad.image || ad.link) return copy;
  const code = (lang || 'ar').toLowerCase().split(/[-_]/)[0];
  return { ...(DEFAULT_COPY[code] || DEFAULT_COPY.ar) };
}
