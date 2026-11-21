import { tx } from '../utils/localize.js';

// Match both the event type and the platform's exact original template.
// User names, request subjects, messages and custom alerts remain verbatim.
const labels = {
  "new_offer": {
    "title": {
      "ar": "عرض سعر جديد",
      "en": "New price offer",
      "ur": "نئی قیمت کی پیشکش",
      "bn": "নতুন দামের অফার",
      "hi": "कीमत का नया ऑफ़र",
      "ml": "പുതിയ വില ഓഫർ",
      "fil": "Bagong alok na presyo",
      "id": "Penawaran harga baru",
      "ne": "नयाँ मूल्य प्रस्ताव",
      "am": "አዲስ የዋጋ ሀሳብ",
      "tr": "Yeni fiyat teklifi"
    },
    "body": {
      "ar": "قدم {{name}} عرضاً بقيمة {{price}}",
      "en": "{{name}} sent an offer of {{price}}",
      "ur": "{{name}} نے {{price}} کی پیشکش بھیجی",
      "bn": "{{name}} {{price}} দামের একটি অফার দিয়েছেন",
      "hi": "{{name}} ने {{price}} का ऑफ़र भेजा",
      "ml": "{{name}} {{price}} വിലയുള്ള ഒരു ഓഫർ അയച്ചു",
      "fil": "Nagpadala si {{name}} ng alok na {{price}}",
      "id": "{{name}} mengajukan penawaran sebesar {{price}}",
      "ne": "{{name}} ले {{price}} को प्रस्ताव पठाउनुभयो",
      "am": "{{name}} የ{{price}} የዋጋ ሀሳብ ልከዋል",
      "tr": "{{name}} {{price}} tutarında bir teklif verdi"
    }
  },
  "offer_accepted": {
    "title": {
      "ar": "تم قبول عرضك",
      "en": "Your offer was accepted",
      "ur": "آپ کی پیشکش قبول ہو گئی",
      "bn": "আপনার অফার গৃহীত হয়েছে",
      "hi": "आपका ऑफ़र स्वीकार कर लिया गया",
      "ml": "നിങ്ങളുടെ ഓഫർ സ്വീകരിച്ചു",
      "fil": "Tinanggap ang iyong alok",
      "id": "Penawaran Anda diterima",
      "ne": "तपाईंको प्रस्ताव स्वीकार गरियो",
      "am": "የዋጋ ሀሳብዎ ተቀባይነት አግኝቷል",
      "tr": "Teklifiniz kabul edildi"
    },
    "body": {
      "ar": "قبل طالب الخدمة عرضك على: {{title}}",
      "en": "The client accepted your offer on: {{title}}",
      "ur": "گاہک نے آپ کی پیشکش قبول کر لی: {{title}}",
      "bn": "সেবাপ্রার্থী আপনার অফার গ্রহণ করেছেন: {{title}}",
      "hi": "ग्राहक ने आपका ऑफ़र स्वीकार किया: {{title}}",
      "ml": "ഉപഭോക്താവ് നിങ്ങളുടെ ഓഫർ സ്വീകരിച്ചു: {{title}}",
      "fil": "Tinanggap ng kliyente ang iyong alok sa: {{title}}",
      "id": "Klien menerima penawaran Anda untuk: {{title}}",
      "ne": "ग्राहकले तपाईंको प्रस्ताव स्वीकार गर्नुभयो: {{title}}",
      "am": "ደንበኛው የዋጋ ሀሳብዎን ተቀብለዋል፦ {{title}}",
      "tr": "Müşteri teklifinizi kabul etti: {{title}}"
    }
  },
  "offer_rejected": {
    "title": {
      "ar": "تم رفض عرضك",
      "en": "Your offer was rejected",
      "ur": "آپ کی پیشکش مسترد ہو گئی",
      "bn": "আপনার অফার প্রত্যাখ্যাত হয়েছে",
      "hi": "आपका ऑफ़र अस्वीकार कर दिया गया",
      "ml": "നിങ്ങളുടെ ഓഫർ നിരസിക്കപ്പെട്ടു",
      "fil": "Tinanggihan ang iyong alok",
      "id": "Penawaran Anda ditolak",
      "ne": "तपाईंको प्रस्ताव अस्वीकृत भयो",
      "am": "የዋጋ ሀሳብዎ ውድቅ ተደርጓል",
      "tr": "Teklifiniz reddedildi"
    },
    "body": {
      "ar": "للأسف، تم رفض عرضك",
      "en": "Unfortunately, your offer was rejected",
      "ur": "بدقسمتی سے، آپ کی پیشکش مسترد ہو گئی",
      "bn": "দুর্ভাগ্যবশত, আপনার অফার প্রত্যাখ্যাত হয়েছে",
      "hi": "दुर्भाग्य से, आपका ऑफ़र अस्वीकार कर दिया गया",
      "ml": "നിർഭാഗ്യവശാൽ, നിങ്ങളുടെ ഓഫർ നിരസിക്കപ്പെട്ടു",
      "fil": "Paumanhin, tinanggihan ang iyong alok",
      "id": "Mohon maaf, penawaran Anda ditolak",
      "ne": "दुर्भाग्यवश, तपाईंको प्रस्ताव अस्वीकृत भयो",
      "am": "እናዝናለን፣ የዋጋ ሀሳብዎ ውድቅ ተደርጓል።",
      "tr": "Ne yazık ki teklifiniz reddedildi"
    }
  },
  "request_contact": {
    "title": {
      "ar": "تواصل بخصوص طلب",
      "en": "New contact about a request",
      "ur": "درخواست کے بارے میں رابطہ",
      "bn": "অনুরোধ নিয়ে যোগাযোগ",
      "hi": "अनुरोध के बारे में संपर्क",
      "ml": "ഒരു അഭ്യർത്ഥനയെക്കുറിച്ച് പുതിയ ബന്ധപ്പെടൽ",
      "fil": "May nakikipag-ugnayan tungkol sa kahilingan",
      "id": "Ada yang menghubungi Anda tentang permintaan",
      "ne": "अनुरोधको बारेमा नयाँ सम्पर्क",
      "am": "ስለ ጥያቄዎ አዲስ ግንኙነት",
      "tr": "Bir talep hakkında iletişim"
    },
    "body": {
      "ar": "{{name}} يتواصل معك بخصوص «{{title}}»",
      "en": "{{name}} contacted you about \"{{title}}\"",
      "ur": "{{name}} نے «{{title}}» کے بارے میں آپ سے رابطہ کیا",
      "bn": "{{name}} «{{title}}» নিয়ে আপনার সাথে যোগাযোগ করেছেন",
      "hi": "{{name}} ने «{{title}}» के बारे में आपसे संपर्क किया",
      "ml": "«{{title}}» സംബന്ധിച്ച് {{name}} നിങ്ങളെ ബന്ധപ്പെടുന്നു",
      "fil": "Nakikipag-ugnayan sa iyo si {{name}} tungkol sa «{{title}}»",
      "id": "{{name}} menghubungi Anda tentang \"{{title}}\"",
      "ne": "{{name}} ले «{{title}}» बारे तपाईंलाई सम्पर्क गर्दै हुनुहुन्छ",
      "am": "{{name}} ስለ «{{title}}» አነጋግረውዎታል",
      "tr": "{{name}}, \"{{title}}\" hakkında sizinle iletişime geçiyor"
    }
  },
  "request_reminder": {
    "title": {
      "ar": "هل وجدت من يخدمك؟",
      "en": "Have you found someone to help you?",
      "ur": "کیا آپ کو خدمت کرنے والا مل گیا؟",
      "bn": "আপনি কি সেবাদাতা পেয়েছেন?",
      "hi": "क्या आपको सेवा देने वाला मिल गया?",
      "ml": "നിങ്ങൾക്ക് സേവനം നൽകാൻ ആരെയെങ്കിലും കിട്ടിയോ?",
      "fil": "May nakita ka na bang magseserbisyo sa iyo?",
      "id": "Sudah menemukan yang bisa membantu Anda?",
      "ne": "के तपाईंले सेवा दिने कोही भेट्टाउनुभयो?",
      "am": "የሚያገለግልዎ ሰው አግኝተዋል?",
      "tr": "Size hizmet verecek birini buldunuz mu?"
    },
    "body": {
      "ar": "طلبك «{{title}}» ما زال مفتوحًا. إن اتفقت مع أحد فأوقف الطلب، أو أوقف هذا التذكير.",
      "en": "Your request \"{{title}}\" is still open. If you have agreed with someone, close it, or stop this reminder.",
      "ur": "آپ کی درخواست «{{title}}» ابھی کھلی ہے۔ اگر کسی سے بات طے ہو گئی ہے تو اسے بند کریں، یا یہ یاد دہانی روک دیں۔",
      "bn": "আপনার অনুরোধ «{{title}}» এখনো খোলা। কারও সাথে চুক্তি হলে বন্ধ করুন, অথবা এই রিমাইন্ডার বন্ধ করুন।",
      "hi": "आपका अनुरोध «{{title}}» अभी खुला है। अगर किसी से बात तय हो गई है तो इसे बंद करें, या यह याद दिलाना बंद करें।",
      "ml": "നിങ്ങളുടെ അഭ്യർത്ഥന «{{title}}» ഇപ്പോഴും തുറന്നിരിക്കുന്നു. ആരുമായെങ്കിലും ധാരണയായെങ്കിൽ അഭ്യർത്ഥന നിർത്തുക, അല്ലെങ്കിൽ ഈ ഓർമ്മപ്പെടുത്തൽ നിർത്തുക.",
      "fil": "Bukas pa rin ang iyong kahilingang «{{title}}». Kung may nakasundo ka na, itigil ang kahilingan, o itigil ang paalalang ito.",
      "id": "Permintaan Anda «{{title}}» masih terbuka. Jika sudah sepakat dengan seseorang, hentikan permintaannya, atau matikan pengingat ini.",
      "ne": "तपाईंको अनुरोध «{{title}}» अझै खुला छ। कसैसँग सहमति भइसकेको भए अनुरोध बन्द गर्नुहोस्, वा यो रिमाइन्डर बन्द गर्नुहोस्।",
      "am": "ጥያቄዎ «{{title}}» አሁንም ክፍት ነው። ከአንድ ሰው ጋር ከተስማሙ ጥያቄውን ያቁሙ፣ ወይም ይህን ማሳሰቢያ ያቁሙ።",
      "tr": "\"{{title}}\" talebiniz hâlâ açık. Biriyle anlaştıysanız talebi durdurun veya bu hatırlatmayı kapatın."
    }
  },
  "request_completed": {
    "title": {
      "ar": "اكتمل الطلب",
      "en": "Request completed",
      "ur": "درخواست مکمل ہو گئی",
      "bn": "অনুরোধ সম্পন্ন হয়েছে",
      "hi": "अनुरोध पूरा हो गया",
      "ml": "അഭ്യർത്ഥന പൂർത്തിയായി",
      "fil": "Nakumpleto ang kahilingan",
      "id": "Permintaan selesai",
      "ne": "अनुरोध पूरा भयो",
      "am": "ጥያቄው ተጠናቋል",
      "tr": "Talep tamamlandı"
    },
    "body": {
      "ar": "تم إكمال طلبك: {{title}}",
      "en": "Your request was completed: {{title}}",
      "ur": "آپ کی درخواست مکمل ہو گئی: {{title}}",
      "hi": "आपका अनुरोध पूरा हो गया: {{title}}",
      "bn": "আপনার অনুরোধ সম্পন্ন হয়েছে: {{title}}",
      "ml": "നിങ്ങളുടെ അപേക്ഷ പൂരിപ്പിച്ചുഃ {{title}}",
      "fil": "Ang iyong kahilingan ay nasusumpungan: {{title}}",
      "id": "Permintaan Anda telah diselesaikan: {{title}}",
      "ne": "तपाईंको अनुरोध पूरा भयोः {{title}}",
      "am": "ጥያቄዎ ተፈጸመ: {{title}}",
      "tr": "İsteğiniz tamamlandı: {{title}}"
    }
  },
  "new_review": {
    "title": {
      "ar": "تقييم جديد",
      "en": "New rating",
      "ur": "نئی ریٹنگ",
      "bn": "নতুন রেটিং",
      "hi": "नई रेटिंग",
      "ml": "പുതിയ റേറ്റിംഗ്",
      "fil": "Bagong review",
      "id": "Ulasan baru",
      "ne": "नयाँ मूल्याङ्कन",
      "am": "አዲስ ግምገማ",
      "tr": "Yeni değerlendirme"
    }
  },
  "admin_assigned": {
    "title": {
      "ar": "تم تحديث الحالة",
      "en": "Status updated",
      "ur": "اسٹیٹس اپ ڈیٹ ہو گیا",
      "bn": "অবস্থা আপডেট হয়েছে",
      "hi": "स्थिति अपडेट हो गई",
      "ml": "നില അപ്‌ഡേറ്റ് ചെയ്തു",
      "fil": "Na-update ang status",
      "id": "Status diperbarui",
      "ne": "स्थिति अपडेट भयो",
      "am": "ሁኔታው ተዘምኗል",
      "tr": "Durum güncellendi"
    }
  },
  "dispute_opened": {
    "title": {
      "ar": "فُتح نزاع",
      "en": "Dispute opened",
      "ur": "تنازعہ کھولا گیا",
      "bn": "বিরোধ খোলা হয়েছে",
      "hi": "विवाद खोला गया",
      "ml": "തർക്കം തുറന്നു",
      "fil": "May binuksang dispute",
      "id": "Sengketa dibuka",
      "ne": "विवाद खोलियो",
      "am": "ክርክር ተከፍቷል",
      "tr": "Anlaşmazlık açıldı"
    }
  },
  "dispute_resolved": {
    "title": {
      "ar": "تم حل النزاع",
      "en": "Dispute resolved",
      "ur": "تنازعہ حل ہو گیا",
      "bn": "বিরোধ সমাধান হয়েছে",
      "hi": "विवाद हल हो गया",
      "ml": "തർക്കം പരിഹരിക്കപ്പെട്ടു",
      "fil": "Naresolba na ang dispute",
      "id": "Sengketa telah diselesaikan",
      "ne": "विवाद समाधान भयो",
      "am": "ክርክር ተፈታ",
      "tr": "Anlaşmazlık çözüldü"
    }
  },
  "dispute_status": {
    "title": {
      "ar": "تحديث حالة النزاع",
      "en": "Dispute status updated",
      "ur": "تنازعے کا اسٹیٹس اپ ڈیٹ ہو گیا",
      "bn": "বিরোধ অবস্থা আপডেট",
      "hi": "विवाद की स्थिति अपडेट हो गई",
      "ml": "തർക്ക നില അപ്‌ഡേറ്റ് ചെയ്തു",
      "fil": "Na-update ang status ng dispute",
      "id": "Status sengketa diperbarui",
      "ne": "विवादको स्थिति अपडेट",
      "am": "የክርክሩ ሁኔታ ተዘምኗል",
      "tr": "Anlaşmazlık durumu güncellendi"
    }
  },
  "dispute_message": {
    "title": {
      "ar": "رسالة جديدة في النزاع",
      "en": "New message in the dispute",
      "ur": "تنازعہ میں نیا پیغام",
      "bn": "বিরোধে নতুন বার্তা",
      "hi": "विवाद में नया संदेश",
      "ml": "പുതിയ തർക്ക സന്ദേശം",
      "fil": "Bagong mensahe sa dispute",
      "id": "Pesan baru dalam sengketa",
      "ne": "विवादमा नयाँ सन्देश",
      "am": "በክርክሩ ውስጥ አዲስ መልዕክት",
      "tr": "Anlaşmazlıkta yeni mesaj"
    }
  },
  "subscription_activated": {
    "title": {
      "ar": "تم تفعيل اشتراكك",
      "en": "Your subscription is active",
      "ur": "آپ کی سبسکرپشن فعال ہو گئی",
      "bn": "আপনার সাবস্ক্রিপশন সক্রিয় হয়েছে",
      "hi": "आपकी सदस्यता चालू हो गई",
      "ml": "നിങ്ങളുടെ സബ്‌സ്ക്രിപ്ഷൻ സജീവമാക്കി",
      "fil": "Aktibo na ang iyong subscription",
      "id": "Langganan Anda telah diaktifkan",
      "ne": "तपाईंको सदस्यता सक्रिय भयो",
      "am": "የደንበኝነት ምዝገባዎ ነቅቷል",
      "tr": "Aboneliğiniz etkinleştirildi"
    },
    "body": {
      "ar": "شكراً لاشتراكك في منصتنا",
      "en": "Thank you for subscribing to our platform",
      "ur": "ہمارے پلیٹ فارم کی رکنیت لینے کا شکریہ",
      "hi": "हमारे प्लेटफ़ॉर्म की सदस्यता लेने के लिए धन्यवाद",
      "bn": "আমাদের প্ল্যাটফর্মের সদস্যতা নেওয়ার জন্য ধন্যবাদ",
      "ml": "ഞങ്ങളുടെ പ്ലാറ്റ്ഫോമിൽ സബ്സ്ക്രൈബുചെയ്തതിന് നന്ദി",
      "fil": "Salamat sa pag-subscribe sa aming platform",
      "id": "Terima kasih telah berlangganan platform kami",
      "ne": "हाम्रो प्लेटफर्ममा सदस्यता लिएकोमा धन्यवाद",
      "am": "ለድረ ገጻችን ስላመዘገቡኝ አመሰግናለሁ",
      "tr": "Platformumuza abone olduğunuz için teşekkür ederim"
    }
  },
  "payment_success": {
    "title": {
      "ar": "تمت عملية الدفع بنجاح",
      "en": "Payment successful",
      "ur": "ادائیگی کامیابی سے ہو گئی",
      "bn": "পেমেন্ট সফল হয়েছে",
      "hi": "भुगतान सफल रहा",
      "ml": "പേയ്‌മെന്റ് വിജയകരമായി പൂർത്തിയായി",
      "fil": "Matagumpay ang pagbabayad",
      "id": "Pembayaran berhasil",
      "ne": "भुक्तानी सफल भयो",
      "am": "ክፍያው በተሳካ ሁኔታ ተፈጽሟል",
      "tr": "Ödeme başarıyla tamamlandı"
    },
    "body": {
      "ar": "تم دفع {{amount}} {{currency}}",
      "en": "Paid {{amount}} {{currency}}",
      "ur": "{{amount}} {{currency}} ادا کیے گئے",
      "hi": "{{amount}} {{currency}} का भुगतान हुआ",
      "bn": "{{amount}} {{currency}} পরিশোধ করা হয়েছে",
      "ml": "അടച്ചത് {{amount}} {{currency}}",
      "fil": "Nagbabayad {{amount}} {{currency}}",
      "id": "Dibayar {{amount}} {{currency}}",
      "ne": "भुक्तान {{amount}} {{currency}}",
      "am": "የተከፈለ {{amount}} {{currency}}",
      "tr": "Ödenmiş {{amount}} {{currency}}"
    }
  },
  "new_message": {
    "title": {
      "ar": "رسالة جديدة",
      "en": "New message",
      "ur": "نیا پیغام",
      "bn": "নতুন বার্তা",
      "hi": "नया संदेश",
      "ml": "പുതിയ സന്ദേശം",
      "fil": "Bagong mensahe",
      "id": "Pesan baru",
      "ne": "नयाँ सन्देश",
      "am": "አዲስ መልዕክት",
      "tr": "Yeni mesaj"
    }
  }
};

const attachmentLabel = {
  "ar": "مرفق جديد",
  "en": "New attachment",
  "ur": "نیا منسلکہ",
  "bn": "নতুন সংযুক্তি",
  "hi": "नया अटैचमेंट",
  "ml": "പുതിയ അറ്റാച്ച്മെന്റ്",
  "fil": "Bagong attachment",
  "id": "Lampiran baru",
  "ne": "नयाँ संलग्नक",
  "am": "አዲስ አባሪ",
  "tr": "Yeni ek"
};

// Earlier wordings of the same server texts (before the 2026-11-19 review). Notifications already
// stored keep the old words, so they are still recognized and shown in the reader's language.
const legacyLabels = {
  "new_offer": {
    "title": [
      "New quote received",
      "নতুন দর প্রাপ্ত",
      "नया कोटेशन प्राप्त",
      "പുതിയ വിലപേശല്",
      "Bagong quote na natanggap",
      "Penawaran baru diterima",
      "नयाँ उद्धरण प्राप्त",
      "አዲስ ዋጋ የተቀበለው",
      "Yeni alıntı"
    ],
    "body": [
      "{{name}} {{price}} এর একটি অফার পাঠিয়েছেন",
      "{{name}} ഒരു ഓഫർ അയച്ചു {{price}}",
      "{{name}} nagpadala ng isang alok ng {{price}}",
      "{{name}} mengirimkan penawaran untuk {{price}}",
      "{{name}} ले प्रस्ताव पठायो {{price}}",
      "{{name}} የ {{price}} ቅናሽ ላከ",
      "{{name}} gönderdi bir teklif {{price}}"
    ]
  },
  "offer_accepted": {
    "title": [
      "आपका ऑफ़र स्वीकार हुआ",
      "Tawaranmu diterima",
      "የእርስዎ አቅርቦት ተቀባይነት አግኝቷል"
    ],
    "body": [
      "کلائنٹ نے آپ کی پیشکش قبول کی: {{title}}",
      "ক্লায়েন্ট আপনার অফার গ্রহণ করেছেন: {{title}}",
      "നിങ്ങളുടെ ഓഫർ ക്ലയന്റ് സ്വീകരിച്ചു: {{title}}",
      "Klien menerima tawaranmu pada: {{title}}",
      "ग्राहकले तपाईंको प्रस्ताव स्वीकार गरेः {{title}}",
      "ደንበኛው የእርስዎን አቅርቦት ተቀብሏል: {{title}}"
    ]
  },
  "offer_rejected": {
    "title": [
      "आपका ऑफ़र अस्वीकार हुआ",
      "Ang iyong alok ay tinanggihan",
      "Tawaranmu ditolak",
      "የእርስዎ አቅርቦት ውድቅ ተደርጓል"
    ],
    "body": [
      "Sa kasamaang palad, ang iyong alok ay tinanggihan",
      "Sayangnya, tawaranmu ditolak",
      "የሚያሳዝነው ግን፣ የእርስዎ አቅርቦት ውድቅ ተደርጓል።"
    ]
  },
  "request_contact": {
    "title": [
      "ഒരു അഭ്യർത്ഥന സംബന്ധിച്ച പുതിയ കോൺടാക്റ്റ്",
      "Bagong kontak tungkol sa isang kahilingan",
      "Kontak baru tentang permintaan",
      "ስለ ጥያቄ አዲስ እውቂያ",
      "Bir talebe ilişkin yeni bir iletişim"
    ],
    "body": [
      "{{name}} നിങ്ങളെ \"{{title}}\" നെ കുറിച്ച് ബന്ധപ്പെട്ടു",
      "{{name}} nakipag-ugnay sa iyo tungkol sa \"{{title}}\"",
      "{{name}} तपाईंलाई \"{{title}}\" को बारेमा सम्पर्क गरियो",
      "{{name}} ስለ \"{{title}}\" አነጋግሬያችኋለሁ",
      "{{name}} \"{{title}}\" hakkında sizinle iletişime geçti"
    ]
  },
  "request_reminder": {
    "title": [
      "Did you find someone?",
      "ആരെയെങ്കിലും കണ്ടെത്തിയോ?",
      "May nakita ka ba?",
      "Apa kau menemukan seseorang?",
      "के तपाईंले कसैलाई भेट्टाउनुभयो?",
      "አንድ ሰው አገኘህ?",
      "Birini buldun mu?"
    ],
    "body": [
      "നിങ്ങളുടെ അഭ്യർത്ഥന \"{{title}}\" ഇപ്പോഴും തുറന്നിരിക്കുന്നു. നിങ്ങൾ ആരുമായും യോജിച്ചെങ്കിൽ, അത് അടയ്ക്കുക, അല്ലെങ്കിൽ ഈ ഓർമ്മപ്പെടുത്തൽ നിർത്തുക.",
      "Ang iyong kahilingan \"{{title}}\" ay bukas pa rin. Kung ikaw ay sumasang-ayon sa isang tao, i-close ito, o i-stop ang paalala.",
      "Jika Anda telah setuju dengan seseorang, tutupnya, atau berhenti mengingatkan. {{title}}",
      "तपाईंको अनुरोध \"{{title}}\" अझै खुला छ। यदि तपाईं कसैसँग सहमत हुनुभयो भने, यसलाई बन्द गर्नुहोस्, वा यो सम्झाउने बन्द गर्नुहोस्।",
      "ጥያቄህ \"{{title}}\" አሁንም ክፍት ነው። ከአንድ ሰው ጋር ተስማምተህ ከሆነ ጥያቄውን አቁም ወይም ይህን ማሳሰቢያ አቁም።",
      "Bir kişiyle anlaştığınızda, bunu kapatın ya da bu hatırlatmayı bırakın. {{title}}"
    ]
  },
  "request_completed": {
    "title": [
      "अनुरोध पूर्ण हुआ",
      "അഭ്യർത്ഥന പൂര് ത്തിയാക്കി",
      "Nagbigay ng kahilingan",
      "अनुरोध पूरा",
      "የተጠናቀቀ ጥያቄ",
      "Başvuru tamamlandı"
    ]
  },
  "new_review": {
    "title": [
      "New review",
      "نیا جائزہ",
      "নতুন পর্যালোচনা",
      "नई समीक्षा",
      "പുതിയ അവലോകനം",
      "Bagong pagsusuri",
      "नयाँ समीक्षा",
      "Yeni inceleme"
    ]
  },
  "admin_assigned": {
    "title": [
      "حیثیت اپ ڈیٹ ہو گئی",
      "स्थिति अपडेट हुई",
      "അപ്ഡേറ്റ് ചെയ്ത നില",
      "Na-update na katayuan",
      "हालसम्मको स्थिति",
      "የዘመነ ሁኔታ",
      "Güncelleştirilmiş durum"
    ]
  },
  "dispute_opened": {
    "title": [
      "تنازعہ کھلا",
      "Nagbukas ang dispute",
      "Perdebatan dibuka",
      "विवाद खुला",
      "Dava açıldı"
    ]
  },
  "dispute_resolved": {
    "title": [
      "Natutunaw ang dispute",
      "Pertikaian diselesaikan",
      "विवाद समाधान",
      "Çözülmüş anlaşmazlık"
    ]
  },
  "dispute_status": {
    "title": [
      "تنازعہ کی حیثیت اپ ڈیٹ",
      "विवाद स्थिति अपडेट",
      "തർക്ക നില അപ്ഡേറ്റ് ചെയ്തു",
      "Na-update ang katayuan ng mga kontrata",
      "Status perselisihan diperbarui",
      "የተቃውሞ ሁኔታ",
      "Tartışma durumu güncellenmiştir"
    ]
  },
  "dispute_message": {
    "title": [
      "New dispute message",
      "Pesan sengketa baru",
      "नयाँ विवाद सन्देश",
      "አዲስ የውዝግብ መልዕክት",
      "Yeni anlaşmazlık mesajı"
    ]
  },
  "subscription_activated": {
    "title": [
      "आपकी सदस्यता सक्रिय है",
      "നിങ്ങളുടെ സബ്സ്ക്രിപ്ഷൻ സജീവമാണ്",
      "Ang iyong subscription ay aktibo",
      "Langganan Anda aktif",
      "तपाईंको सदस्यता सक्रिय छ",
      "የእርስዎ ምዝገባ ንቁ ነው",
      "aboneliğiniz aktif"
    ]
  },
  "payment_success": {
    "title": [
      "ادائیگی کامیاب",
      "भुगतान सफल",
      "പേയ്മെന്റ് വിജയകരമായി",
      "Nagtagumpay na pagbabayad",
      "भुक्तानी सफल",
      "ክፍያ የተሳካ",
      "Ödemesi başarıyla"
    ]
  }
};
const legacyAttachment = ["نیا منسلک","नया अनुलग्नक","አዲስ ማያዣ","Yeni ekleme"];
const disputeStatuses = {
  "open": {
    "ar": "مفتوح",
    "en": "Open",
    "ur": "کھلا",
    "bn": "খোলা",
    "hi": "खुला"
  },
  "under_review": {
    "ar": "قيد المراجعة",
    "en": "Under review",
    "ur": "زیر جائزہ",
    "bn": "পর্যালোচনাধীন",
    "hi": "समीक्षाधीन"
  },
  "waiting_response": {
    "ar": "بانتظار رد",
    "en": "Waiting response",
    "ur": "جواب کے انتظار میں",
    "bn": "প্রতিক্রিয়ার অপেক্ষায়",
    "hi": "उत्तर की प्रतीक्षा"
  },
  "escalated": {
    "ar": "تصعيد",
    "en": "Escalated",
    "ur": "اضافہ شدہ",
    "bn": "উত্থাপিত",
    "hi": "बढ़ाया गया"
  },
  "resolved": {
    "ar": "تم الحل",
    "en": "Resolved",
    "ur": "حل شدہ",
    "bn": "সমাধান হয়েছে",
    "hi": "हल हो गया"
  },
  "rejected": {
    "ar": "مرفوض",
    "en": "Rejected",
    "ur": "مسترد",
    "bn": "প্রত্যাখ্যাত",
    "hi": "अस्वीकृत"
  },
  "closed": {
    "ar": "مغلق",
    "en": "Closed",
    "ur": "بند",
    "bn": "বন্ধ",
    "hi": "बंद"
  }
};

const templateMatchers = new Map();
function quotePattern(value) {
  const special = '.+*?^$()[]{}|\\';
  return Array.from(value).map(char => special.includes(char) ? '\\' + char : char).join('');
}

function matchTemplate(value, translations) {
  for (const template of Object.values(translations)) {
    let matcher = templateMatchers.get(template);
    if (!matcher) {
      const keys = [];
      let cursor = 0;
      let pattern = '^';
      for (const token of template.matchAll(/\{\{(\w+)\}\}/g)) {
        const capture = ['price', 'amount'].includes(token[1])
          ? '([+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:e[+-]?\\d+)?)'
          : token[1] === 'currency' ? '([A-Z]{3})' : '([\\s\\S]*?)';
        pattern += quotePattern(template.slice(cursor, token.index)) + capture;
        keys.push(token[1]);
        cursor = token.index + token[0].length;
      }
      matcher = { pattern: new RegExp(pattern + quotePattern(template.slice(cursor)) + '$'), keys };
      templateMatchers.set(template, matcher);
    }
    const match = matcher.pattern.exec(value);
    if (match) return Object.fromEntries(matcher.keys.map((key, index) => [key, match[index + 1]]));
  }
  return null;
}

function renderTemplate(translations, language, values) {
  return tx(translations, language).replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? '');
}

function metadata(data) {
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch (_) { return null; }
  }
  return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
}

function knownTitle(type, definition, title) {
  return Object.values(definition.title).includes(title) || Boolean(legacyLabels[type]?.title?.includes(title));
}

export function localizedNotification(notification, language) {
  const title = typeof notification?.title === 'string' ? notification.title : '';
  const body = typeof notification?.body === 'string' ? notification.body : '';
  const type = notification?.type;
  const definition = typeof type === 'string' && Object.hasOwn(labels, type) ? labels[type] : null;
  if (!definition) return { title, body };

  // Chat titles and previews normally contain user text. Only an explicit
  // server-written provenance marker authorizes their system-label fallback.
  if (type === 'new_message') {
    const data = metadata(notification.data);
    return {
      title: data?.system_title === 'new_message' && knownTitle(type, definition, title)
        ? tx(definition.title, language) : title,
      body: data?.system_body === 'new_attachment' &&
        (Object.values(attachmentLabel).includes(body) || legacyAttachment.includes(body))
        ? tx(attachmentLabel, language) : body,
    };
  }

  if (!knownTitle(type, definition, title)) return { title, body };
  let localizedBody = body;
  if (definition.body) {
    const values = matchTemplate(body, definition.body) ??
      (legacyLabels[type]?.body ? matchTemplate(body, legacyLabels[type].body) : null);
    if (values && (!values.price || /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?$/i.test(values.price)) &&
        (!values.amount || /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?$/i.test(values.amount)) &&
        (!values.currency || /^[A-Z]{3}$/.test(values.currency))) {
      localizedBody = renderTemplate(definition.body, language, values);
    }
  } else if (type === 'dispute_status') {
    const match = /^(open|under_review|waiting_response|escalated|resolved|rejected|closed) — ([\s\S]*)$/.exec(body);
    if (match) localizedBody = tx(disputeStatuses[match[1]], language) + ' — ' + match[2];
  }
  return { title: tx(definition.title, language), body: localizedBody };
}
