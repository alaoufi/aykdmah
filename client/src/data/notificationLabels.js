import { tx } from '../utils/localize.js';

// Match both the event type and the platform's exact original template.
// User names, request subjects, messages and custom alerts remain verbatim.
const labels = {
  "new_offer": {
    "title": {
      "ar": "عرض سعر جديد",
      "en": "New quote received",
      "ur": "نئی قیمت کی پیشکش",
      "bn": "নতুন দর প্রাপ্ত",
      "hi": "नया कोटेशन प्राप्त",
      "ml": "പുതിയ വിലപേശല്",
      "fil": "Bagong quote na natanggap",
      "id": "Penawaran baru diterima",
      "ne": "नयाँ उद्धरण प्राप्त",
      "am": "አዲስ ዋጋ የተቀበለው",
      "tr": "Yeni alıntı"
    },
    "body": {
      "ar": "قدم {{name}} عرضاً بقيمة {{price}}",
      "en": "{{name}} sent an offer of {{price}}",
      "ur": "{{name}} نے {{price}} کی پیشکش بھیجی",
      "bn": "{{name}} {{price}} এর একটি অফার পাঠিয়েছেন",
      "hi": "{{name}} ने {{price}} का ऑफ़र भेजा",
      "ml": "{{name}} ഒരു ഓഫർ അയച്ചു {{price}}",
      "fil": "{{name}} nagpadala ng isang alok ng {{price}}",
      "id": "{{name}} mengirimkan penawaran untuk {{price}}",
      "ne": "{{name}} ले प्रस्ताव पठायो {{price}}",
      "am": "{{name}} የ {{price}} ቅናሽ ላከ",
      "tr": "{{name}} gönderdi bir teklif {{price}}"
    }
  },
  "offer_accepted": {
    "title": {
      "ar": "تم قبول عرضك",
      "en": "Your offer was accepted",
      "ur": "آپ کی پیشکش قبول ہو گئی",
      "bn": "আপনার অফার গৃহীত হয়েছে",
      "hi": "आपका ऑफ़र स्वीकार हुआ",
      "ml": "നിങ്ങളുടെ ഓഫർ സ്വീകരിച്ചു",
      "fil": "Tinanggap ang iyong alok",
      "id": "Tawaranmu diterima",
      "ne": "तपाईंको प्रस्ताव स्वीकार गरियो",
      "am": "የእርስዎ አቅርቦት ተቀባይነት አግኝቷል",
      "tr": "Teklifiniz kabul edildi"
    },
    "body": {
      "ar": "قبل العميل عرضك على: {{title}}",
      "en": "The client accepted your offer on: {{title}}",
      "ur": "کلائنٹ نے آپ کی پیشکش قبول کی: {{title}}",
      "bn": "ক্লায়েন্ট আপনার অফার গ্রহণ করেছেন: {{title}}",
      "hi": "ग्राहक ने आपका ऑफ़र स्वीकार किया: {{title}}",
      "ml": "നിങ്ങളുടെ ഓഫർ ക്ലയന്റ് സ്വീകരിച്ചു: {{title}}",
      "fil": "Tinanggap ng kliyente ang iyong alok sa: {{title}}",
      "id": "Klien menerima tawaranmu pada: {{title}}",
      "ne": "ग्राहकले तपाईंको प्रस्ताव स्वीकार गरेः {{title}}",
      "am": "ደንበኛው የእርስዎን አቅርቦት ተቀብሏል: {{title}}",
      "tr": "Müşteri teklifinizi kabul etti: {{title}}"
    }
  },
  "offer_rejected": {
    "title": {
      "ar": "تم رفض عرضك",
      "en": "Your offer was rejected",
      "ur": "آپ کی پیشکش مسترد ہو گئی",
      "bn": "আপনার অফার প্রত্যাখ্যাত হয়েছে",
      "hi": "आपका ऑफ़र अस्वीकार हुआ",
      "ml": "നിങ്ങളുടെ ഓഫർ നിരസിക്കപ്പെട്ടു",
      "fil": "Ang iyong alok ay tinanggihan",
      "id": "Tawaranmu ditolak",
      "ne": "तपाईंको प्रस्ताव अस्वीकृत भयो",
      "am": "የእርስዎ አቅርቦት ውድቅ ተደርጓል",
      "tr": "Teklifiniz reddedildi"
    },
    "body": {
      "ar": "للأسف، تم رفض عرضك",
      "en": "Unfortunately, your offer was rejected",
      "ur": "بدقسمتی سے، آپ کی پیشکش مسترد ہو گئی",
      "bn": "দুর্ভাগ্যবশত, আপনার অফার প্রত্যাখ্যাত হয়েছে",
      "hi": "दुर्भाग्य से, आपका ऑफ़र अस्वीकार कर दिया गया",
      "ml": "നിർഭാഗ്യവശാൽ, നിങ്ങളുടെ ഓഫർ നിരസിക്കപ്പെട്ടു",
      "fil": "Sa kasamaang palad, ang iyong alok ay tinanggihan",
      "id": "Sayangnya, tawaranmu ditolak",
      "ne": "दुर्भाग्यवश, तपाईंको प्रस्ताव अस्वीकृत भयो",
      "am": "የሚያሳዝነው ግን፣ የእርስዎ አቅርቦት ውድቅ ተደርጓል።",
      "tr": "Ne yazık ki teklifiniz reddedildi"
    }
  },
  "request_reminder": {
    "title": {
      "ar": "هل وجدت من يخدمك؟",
      "en": "Did you find someone?",
      "ur": "کیا آپ کو خدمت کرنے والا مل گیا؟",
      "bn": "আপনি কি সেবাদাতা পেয়েছেন?",
      "hi": "क्या आपको सेवा देने वाला मिल गया?",
      "ml": "ആരെയെങ്കിലും കണ്ടെത്തിയോ?",
      "fil": "May nakita ka ba?",
      "id": "Apa kau menemukan seseorang?",
      "ne": "के तपाईंले कसैलाई भेट्टाउनुभयो?",
      "am": "አንድ ሰው አገኘህ?",
      "tr": "Birini buldun mu?"
    },
    "body": {
      "ar": "طلبك «{{title}}» ما زال مفتوحًا. إن اتفقت مع أحد فأوقف الطلب، أو أوقف هذا التذكير.",
      "en": "Your request \"{{title}}\" is still open. If you have agreed with someone, close it, or stop this reminder.",
      "ur": "آپ کی درخواست «{{title}}» ابھی کھلی ہے۔ اگر کسی سے بات طے ہو گئی ہے تو اسے بند کریں، یا یہ یاد دہانی روک دیں۔",
      "bn": "আপনার অনুরোধ «{{title}}» এখনো খোলা। কারও সাথে চুক্তি হলে বন্ধ করুন, অথবা এই রিমাইন্ডার বন্ধ করুন।",
      "hi": "आपका अनुरोध «{{title}}» अभी खुला है। अगर किसी से बात तय हो गई है तो इसे बंद करें, या यह याद दिलाना बंद करें।",
      "ml": "നിങ്ങളുടെ അഭ്യർത്ഥന \"{{title}}\" ഇപ്പോഴും തുറന്നിരിക്കുന്നു. നിങ്ങൾ ആരുമായും യോജിച്ചെങ്കിൽ, അത് അടയ്ക്കുക, അല്ലെങ്കിൽ ഈ ഓർമ്മപ്പെടുത്തൽ നിർത്തുക.",
      "fil": "Ang iyong kahilingan \"{{title}}\" ay bukas pa rin. Kung ikaw ay sumasang-ayon sa isang tao, i-close ito, o i-stop ang paalala.",
      "id": "Jika Anda telah setuju dengan seseorang, tutupnya, atau berhenti mengingatkan. {{title}}",
      "ne": "तपाईंको अनुरोध \"{{title}}\" अझै खुला छ। यदि तपाईं कसैसँग सहमत हुनुभयो भने, यसलाई बन्द गर्नुहोस्, वा यो सम्झाउने बन्द गर्नुहोस्।",
      "am": "ጥያቄህ \"{{title}}\" አሁንም ክፍት ነው። ከአንድ ሰው ጋር ተስማምተህ ከሆነ ጥያቄውን አቁም ወይም ይህን ማሳሰቢያ አቁም።",
      "tr": "Bir kişiyle anlaştığınızda, bunu kapatın ya da bu hatırlatmayı bırakın. {{title}}"
    }
  },
  "request_completed": {
    "title": {
      "ar": "اكتمل الطلب",
      "en": "Request completed",
      "ur": "درخواست مکمل ہو گئی",
      "bn": "অনুরোধ সম্পন্ন হয়েছে",
      "hi": "अनुरोध पूर्ण हुआ",
      "ml": "അഭ്യർത്ഥന പൂര് ത്തിയാക്കി",
      "fil": "Nagbigay ng kahilingan",
      "id": "Permintaan selesai",
      "ne": "अनुरोध पूरा",
      "am": "የተጠናቀቀ ጥያቄ",
      "tr": "Başvuru tamamlandı"
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
      "en": "New review",
      "ur": "نیا جائزہ",
      "bn": "নতুন পর্যালোচনা",
      "hi": "नई समीक्षा",
      "ml": "പുതിയ അവലോകനം",
      "fil": "Bagong pagsusuri",
      "id": "Ulasan baru",
      "ne": "नयाँ समीक्षा",
      "am": "አዲስ ግምገማ",
      "tr": "Yeni inceleme"
    }
  },
  "admin_assigned": {
    "title": {
      "ar": "تم تحديث الحالة",
      "en": "Status updated",
      "ur": "حیثیت اپ ڈیٹ ہو گئی",
      "bn": "অবস্থা আপডেট হয়েছে",
      "hi": "स्थिति अपडेट हुई",
      "ml": "അപ്ഡേറ്റ് ചെയ്ത നില",
      "fil": "Na-update na katayuan",
      "id": "Status diperbarui",
      "ne": "हालसम्मको स्थिति",
      "am": "የዘመነ ሁኔታ",
      "tr": "Güncelleştirilmiş durum"
    }
  },
  "dispute_opened": {
    "title": {
      "ar": "فُتح نزاع",
      "en": "Dispute opened",
      "ur": "تنازعہ کھلا",
      "bn": "বিরোধ খোলা হয়েছে",
      "hi": "विवाद खोला गया",
      "ml": "തർക്കം തുറന്നു",
      "fil": "Nagbukas ang dispute",
      "id": "Perdebatan dibuka",
      "ne": "विवाद खुला",
      "am": "ክርክር ተከፍቷል",
      "tr": "Dava açıldı"
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
      "fil": "Natutunaw ang dispute",
      "id": "Pertikaian diselesaikan",
      "ne": "विवाद समाधान",
      "am": "ክርክር ተፈታ",
      "tr": "Çözülmüş anlaşmazlık"
    }
  },
  "dispute_status": {
    "title": {
      "ar": "تحديث حالة النزاع",
      "en": "Dispute status updated",
      "ur": "تنازعہ کی حیثیت اپ ڈیٹ",
      "bn": "বিরোধ অবস্থা আপডেট",
      "hi": "विवाद स्थिति अपडेट",
      "ml": "തർക്ക നില അപ്ഡേറ്റ് ചെയ്തു",
      "fil": "Na-update ang katayuan ng mga kontrata",
      "id": "Status perselisihan diperbarui",
      "ne": "विवादको स्थिति अपडेट",
      "am": "የተቃውሞ ሁኔታ",
      "tr": "Tartışma durumu güncellenmiştir"
    }
  },
  "dispute_message": {
    "title": {
      "ar": "رسالة جديدة في النزاع",
      "en": "New dispute message",
      "ur": "تنازعہ میں نیا پیغام",
      "bn": "বিরোধে নতুন বার্তা",
      "hi": "विवाद में नया संदेश",
      "ml": "പുതിയ തർക്ക സന്ദേശം",
      "fil": "Bagong mensahe sa dispute",
      "id": "Pesan sengketa baru",
      "ne": "नयाँ विवाद सन्देश",
      "am": "አዲስ የውዝግብ መልዕክት",
      "tr": "Yeni anlaşmazlık mesajı"
    }
  },
  "subscription_activated": {
    "title": {
      "ar": "تم تفعيل اشتراكك",
      "en": "Your subscription is active",
      "ur": "آپ کی سبسکرپشن فعال ہو گئی",
      "bn": "আপনার সাবস্ক্রিপশন সক্রিয় হয়েছে",
      "hi": "आपकी सदस्यता सक्रिय है",
      "ml": "നിങ്ങളുടെ സബ്സ്ക്രിപ്ഷൻ സജീവമാണ്",
      "fil": "Ang iyong subscription ay aktibo",
      "id": "Langganan Anda aktif",
      "ne": "तपाईंको सदस्यता सक्रिय छ",
      "am": "የእርስዎ ምዝገባ ንቁ ነው",
      "tr": "aboneliğiniz aktif"
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
      "ur": "ادائیگی کامیاب",
      "bn": "পেমেন্ট সফল হয়েছে",
      "hi": "भुगतान सफल",
      "ml": "പേയ്മെന്റ് വിജയകരമായി",
      "fil": "Nagtagumpay na pagbabayad",
      "id": "Pembayaran berhasil",
      "ne": "भुक्तानी सफल",
      "am": "ክፍያ የተሳካ",
      "tr": "Ödemesi başarıyla"
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
  "ur": "نیا منسلک",
  "bn": "নতুন সংযুক্তি",
  "hi": "नया अनुलग्नक"
};
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
      title: data?.system_title === 'new_message' && Object.values(definition.title).includes(title)
        ? tx(definition.title, language) : title,
      body: data?.system_body === 'new_attachment' && Object.values(attachmentLabel).includes(body)
        ? tx(attachmentLabel, language) : body,
    };
  }

  if (!Object.values(definition.title).includes(title)) return { title, body };
  let localizedBody = body;
  if (definition.body) {
    const values = matchTemplate(body, definition.body);
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
