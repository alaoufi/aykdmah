// Service types available at launch. Customers receive provider offers after creating a request.
import extraLanguages from './catalogExtraLanguages.json' with { type: 'json' };

// The newer languages (AYK-037) are looked up by the English text.
const L = (ar, en, ur, hi, bn) => ({ ar, en, ur, hi, bn, ...(extraLanguages[en] || {}) });
export const ORDER_STATUSES = ['new','reviewing','accepted','in_progress','completed','cancelled'];
export const CATEGORIES = [
  { id:5, slug:'plumbing', icon:'🔧', tint:'#0ea5e9', bg:'#e0f2fe', name:L('سباكة','Plumbing','پلمبنگ','प्लंबिंग','প্লাম্বিং'), desc:L('إصلاح التسريبات وصيانة الأدوات الصحية','Leak repairs and plumbing maintenance','پانی کے رساؤ کی مرمت اور پلمبنگ کی دیکھ بھال','पानी के रिसाव की मरम्मत और प्लंबिंग का रखरखाव','পানির লিক মেরামত ও প্লাম্বিং রক্ষণাবেক্ষণ'), subs:[] },
  { id:4, slug:'electrical', icon:'⚡', tint:'#eab308', bg:'#fef3c7', name:L('كهرباء','Electrical','بجلی کے کام','बिजली के काम','বৈদ্যুতিক কাজ'), desc:L('صيانة الكهرباء والإنارة المنزلية','Home electrical and lighting maintenance','گھر کی بجلی اور روشنی کے نظام کی دیکھ بھال','घर की बिजली और रोशनी की व्यवस्था का रखरखाव','বাড়ির বিদ্যুৎ ও আলোর ব্যবস্থার রক্ষণাবেক্ষণ'), subs:[] },
  { id:2, slug:'yard-cleaning', icon:'🧹', tint:'#16a34a', bg:'#d1fae5', name:L('غسيل الأحواش','Yard cleaning','صحن کی صفائی','आँगन की सफाई','উঠান পরিষ্কার'), desc:L('تنظيف الحوش والمدخل الخارجي','Yard and entrance cleaning','صحن اور بیرونی داخلی راستے کی صفائی','आँगन और बाहरी प्रवेश द्वार की सफाई','উঠান ও বাইরের প্রবেশপথ পরিষ্কার'), subs:[] },
];
export const SERVICES = CATEGORIES.map((c,i) => ({
  id:[13,11,3001][i], categoryId:c.id, categorySlug:c.slug, icon:c.icon, cover:c.bg, title:c.name,
  desc:c.desc, longDesc:c.desc, searchTerms:[['سباك', 'plumber', 'پلمبنگ', 'প্লাম্বিং', 'प्लंबिंग'], ['كهربائي', 'electrician', 'بجلی', 'বৈদ্যুতিক কাজ', 'बिजली का काम'], ['غسيل الحوش', 'تنظيف الحوش', 'صحن کی صفائی', 'উঠান পরিষ্কার', 'आंगन की सफाई']][i], status:'active', featured:false, includes:[c.desc],
  excludes:[L('قطع الغيار والمواد تُحدد في العرض','Parts and materials are specified in the offer','اسپیئر پارٹس اور مواد کی تفصیل پیشکش میں دی جاتی ہے','स्पेयर पार्ट्स और सामग्री का विवरण प्रस्ताव में दिया जाता है','যন্ত্রাংশ ও উপকরণের বিবরণ প্রস্তাবে দেওয়া হয়')],
  priceFrom:null, duration:L('حسب الاتفاق','By agreement','باہمی اتفاق کے مطابق','आपसी सहमति के अनुसार','পারস্পরিক সম্মতি অনুযায়ী'), rating:0, ratingCount:0, ordersCount:0,
  city:L('القصيم والمجمعة','Al-Qassim and Al Majmaah','القصیم اور المجمعہ','अल-क़सीम और अल-मजमआ','আল-কাসিম ও আল-মাজমা'), coverage:L('القصيم والمجمعة','Al-Qassim and Al Majmaah','القصیم اور المجمعہ','अल-क़सीम और अल-मजमआ','আল-কাসিম ও আল-মাজমা'), packages:[],
  provider:{id:null,name:L('تستقبل عروض مقدمي الخدمة بعد إنشاء الطلب','Receive provider offers after creating a request','درخواست بنانے کے بعد خدمت فراہم کرنے والوں کی پیشکشیں موصول ہوں گی','अनुरोध बनाने के बाद सेवा प्रदाताओं के प्रस्ताव मिलेंगे','অনুরোধ তৈরি করার পর সেবাদাতাদের প্রস্তাব পাবেন'),verified:false,rating:0,ordersCount:0},
}));
export const ORDERS = [];
export const REVIEWS = [];
export const getCategory = slug => CATEGORIES.find(c => c.slug === slug) || null;
export const servicesByCategory = slug => SERVICES.filter(s => s.categorySlug === slug);
export const getService = id => SERVICES.find(s => String(s.id) === String(id)) || null;
export const serviceCountByCategory = slug => servicesByCategory(slug).length;
export const featuredServices = () => SERVICES.filter(s => s.featured);
export const popularServices = (limit=6) => SERVICES.slice(0,limit);
export const reviewsForService = () => [];
