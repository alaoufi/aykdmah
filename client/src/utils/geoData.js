// Static Saudi administrative divisions data.
// Used as a fallback when the backend API is unavailable.
// Source: database/seed.sql

export const REGIONS = [
  { id: 1,  code: 'RD', name_ar: 'منطقة الرياض',          name_en: 'Riyadh Region',           name_ur: 'ریاض ریجن',           name_bn: 'রিয়াদ অঞ্চল',          name_hi: 'रियाद क्षेत्र' },
  { id: 2,  code: 'MK', name_ar: 'منطقة مكة المكرمة',     name_en: 'Makkah Region',           name_ur: 'مکہ مکرمہ ریجن',      name_bn: 'মক্কা মুকাররমা অঞ্চল',  name_hi: 'मक्का मुकर्रमा क्षेत्र' },
  { id: 3,  code: 'MD', name_ar: 'منطقة المدينة المنورة', name_en: 'Madinah Region',          name_ur: 'مدینہ منورہ ریجن',    name_bn: 'মদিনা মুনাওয়ারা অঞ্চল', name_hi: 'मदीना मुनव्वरा क्षेत्र' },
  { id: 4,  code: 'QS', name_ar: 'منطقة القصيم',          name_en: 'Al-Qassim Region',        name_ur: 'القصیم ریجن',         name_bn: 'আল-কাসিম অঞ্চল',        name_hi: 'अल-कासिम क्षेत्र' },
  { id: 5,  code: 'ES', name_ar: 'المنطقة الشرقية',       name_en: 'Eastern Region',          name_ur: 'مشرقی ریجن',          name_bn: 'পূর্বাঞ্চল',            name_hi: 'पूर्वी क्षेत्र' },
  { id: 6,  code: 'AS', name_ar: 'منطقة عسير',            name_en: 'Asir Region',             name_ur: 'عسیر ریجن',           name_bn: 'আসির অঞ্চল',           name_hi: 'असीर क्षेत्र' },
  { id: 7,  code: 'TB', name_ar: 'منطقة تبوك',            name_en: 'Tabuk Region',            name_ur: 'تبوک ریجن',           name_bn: 'তাবুক অঞ্চল',          name_hi: 'तबूक क्षेत्र' },
  { id: 8,  code: 'HA', name_ar: 'منطقة حائل',            name_en: 'Hail Region',             name_ur: 'حائل ریجن',           name_bn: 'হাইল অঞ্চল',           name_hi: 'हाइल क्षेत्र' },
  { id: 9,  code: 'NB', name_ar: 'منطقة الحدود الشمالية', name_en: 'Northern Borders Region', name_ur: 'شمالی سرحدی ریجن',    name_bn: 'উত্তর সীমান্ত অঞ্চল',  name_hi: 'उत्तरी सीमा क्षेत्र' },
  { id: 10, code: 'JZ', name_ar: 'منطقة جازان',           name_en: 'Jazan Region',            name_ur: 'جازان ریجن',          name_bn: 'জাজান অঞ্চল',          name_hi: 'जाज़ान क्षेत्र' },
  { id: 11, code: 'NJ', name_ar: 'منطقة نجران',           name_en: 'Najran Region',           name_ur: 'نجران ریجن',          name_bn: 'নাজরান অঞ্চল',         name_hi: 'नजरान क्षेत्र' },
  { id: 12, code: 'BH', name_ar: 'منطقة الباحة',          name_en: 'Al-Bahah Region',         name_ur: 'الباحہ ریجن',         name_bn: 'আল-বাহাহ অঞ্চল',       name_hi: 'अल-बाहा क्षेत्र' },
  { id: 13, code: 'JF', name_ar: 'منطقة الجوف',           name_en: 'Al-Jouf Region',          name_ur: 'الجوف ریجن',          name_bn: 'আল-জাওফ অঞ্চল',        name_hi: 'अल-जौफ क्षेत्र' },
];

export const GOVERNORATES = [
  // الرياض
  { id: 1,   region_id: 1, name_ar: 'الرياض',          name_en: 'Riyadh' },
  { id: 2,   region_id: 1, name_ar: 'الدرعية',         name_en: 'Diriyah' },
  { id: 3,   region_id: 1, name_ar: 'الخرج',           name_en: 'Al-Kharj' },
  { id: 4,   region_id: 1, name_ar: 'الدوادمي',        name_en: 'Ad-Dawadmi' },
  { id: 5,   region_id: 1, name_ar: 'المجمعة',         name_en: 'Al-Majmaah' },
  { id: 6,   region_id: 1, name_ar: 'القويعية',        name_en: 'Al-Quwaiiyah' },
  { id: 7,   region_id: 1, name_ar: 'وادي الدواسر',    name_en: 'Wadi Ad-Dawasir' },
  { id: 8,   region_id: 1, name_ar: 'الأفلاج',         name_en: 'Al-Aflaj' },
  { id: 9,   region_id: 1, name_ar: 'الزلفي',          name_en: 'Az-Zulfi' },
  { id: 10,  region_id: 1, name_ar: 'شقراء',           name_en: 'Shaqra' },
  { id: 11,  region_id: 1, name_ar: 'حوطة بني تميم',   name_en: 'Hawtat Bani Tamim' },
  { id: 12,  region_id: 1, name_ar: 'عفيف',            name_en: 'Afif' },
  { id: 13,  region_id: 1, name_ar: 'السليل',          name_en: 'As-Sulayyil' },
  { id: 14,  region_id: 1, name_ar: 'ضرما',            name_en: 'Dhurma' },
  { id: 15,  region_id: 1, name_ar: 'المزاحمية',       name_en: 'Al-Muzahmiyah' },
  { id: 16,  region_id: 1, name_ar: 'رماح',            name_en: 'Rumah' },
  { id: 17,  region_id: 1, name_ar: 'ثادق',            name_en: 'Thadiq' },
  { id: 18,  region_id: 1, name_ar: 'حريملاء',         name_en: 'Huraymila' },
  { id: 19,  region_id: 1, name_ar: 'الحريق',          name_en: 'Al-Hariq' },
  { id: 20,  region_id: 1, name_ar: 'مرات',            name_en: 'Marat' },
  // مكة المكرمة
  { id: 21,  region_id: 2, name_ar: 'مكة المكرمة',     name_en: 'Makkah' },
  { id: 22,  region_id: 2, name_ar: 'جدة',             name_en: 'Jeddah' },
  { id: 23,  region_id: 2, name_ar: 'الطائف',          name_en: 'Taif' },
  { id: 24,  region_id: 2, name_ar: 'القنفذة',         name_en: 'Al-Qunfudhah' },
  { id: 25,  region_id: 2, name_ar: 'الليث',           name_en: 'Al-Lith' },
  { id: 26,  region_id: 2, name_ar: 'رابغ',            name_en: 'Rabigh' },
  { id: 27,  region_id: 2, name_ar: 'خليص',            name_en: 'Khulays' },
  { id: 28,  region_id: 2, name_ar: 'الجموم',          name_en: 'Al-Jumum' },
  { id: 29,  region_id: 2, name_ar: 'الكامل',          name_en: 'Al-Kamil' },
  { id: 30,  region_id: 2, name_ar: 'المويه',          name_en: 'Al-Muwayh' },
  { id: 31,  region_id: 2, name_ar: 'ميسان',           name_en: 'Maysan' },
  { id: 32,  region_id: 2, name_ar: 'أضم',             name_en: 'Adham' },
  { id: 33,  region_id: 2, name_ar: 'الخرمة',          name_en: 'Al-Khurmah' },
  { id: 34,  region_id: 2, name_ar: 'تربة',            name_en: 'Turabah' },
  { id: 35,  region_id: 2, name_ar: 'رنية',            name_en: 'Raniyah' },
  { id: 36,  region_id: 2, name_ar: 'العرضيات',        name_en: 'Al-Ardiyat' },
  { id: 37,  region_id: 2, name_ar: 'بحرة',            name_en: 'Bahrah' },
  // المدينة المنورة
  { id: 38,  region_id: 3, name_ar: 'المدينة المنورة', name_en: 'Madinah' },
  { id: 39,  region_id: 3, name_ar: 'ينبع',            name_en: 'Yanbu' },
  { id: 40,  region_id: 3, name_ar: 'العلا',           name_en: 'Al-Ula' },
  { id: 41,  region_id: 3, name_ar: 'مهد الذهب',       name_en: 'Mahd Ad-Dahab' },
  { id: 42,  region_id: 3, name_ar: 'الحناكية',        name_en: 'Al-Henakiyah' },
  { id: 43,  region_id: 3, name_ar: 'بدر',             name_en: 'Badr' },
  { id: 44,  region_id: 3, name_ar: 'خيبر',            name_en: 'Khaybar' },
  { id: 45,  region_id: 3, name_ar: 'العيص',           name_en: 'Al-Ais' },
  // القصيم
  { id: 46,  region_id: 4, name_ar: 'بريدة',           name_en: 'Buraidah' },
  { id: 47,  region_id: 4, name_ar: 'عنيزة',           name_en: 'Unaizah' },
  { id: 48,  region_id: 4, name_ar: 'الرس',            name_en: 'Ar-Rass' },
  { id: 49,  region_id: 4, name_ar: 'المذنب',          name_en: 'Al-Mithnab' },
  { id: 50,  region_id: 4, name_ar: 'البكيرية',        name_en: 'Al-Bukayriyah' },
  { id: 51,  region_id: 4, name_ar: 'البدائع',         name_en: 'Al-Badaie' },
  { id: 52,  region_id: 4, name_ar: 'الأسياح',         name_en: 'Al-Asyah' },
  { id: 53,  region_id: 4, name_ar: 'النبهانية',       name_en: 'An-Nabhaniyah' },
  { id: 54,  region_id: 4, name_ar: 'الشماسية',        name_en: 'Ash-Shamasiyah' },
  { id: 55,  region_id: 4, name_ar: 'عيون الجواء',     name_en: 'Uyun Al-Jiwa' },
  { id: 56,  region_id: 4, name_ar: 'رياض الخبراء',    name_en: 'Riyad Al-Khabra' },
  { id: 57,  region_id: 4, name_ar: 'ضرية',            name_en: 'Dariyah' },
  { id: 58,  region_id: 4, name_ar: 'عقلة الصقور',     name_en: 'Uqlat As-Suqur' },
  // الشرقية
  { id: 59,  region_id: 5, name_ar: 'الدمام',          name_en: 'Dammam' },
  { id: 60,  region_id: 5, name_ar: 'الأحساء',         name_en: 'Al-Ahsa' },
  { id: 61,  region_id: 5, name_ar: 'حفر الباطن',      name_en: 'Hafar Al-Batin' },
  { id: 62,  region_id: 5, name_ar: 'الجبيل',          name_en: 'Jubail' },
  { id: 63,  region_id: 5, name_ar: 'القطيف',          name_en: 'Qatif' },
  { id: 64,  region_id: 5, name_ar: 'الخبر',           name_en: 'Khobar' },
  { id: 65,  region_id: 5, name_ar: 'الخفجي',          name_en: 'Al-Khafji' },
  { id: 66,  region_id: 5, name_ar: 'رأس تنورة',       name_en: 'Ras Tanura' },
  { id: 67,  region_id: 5, name_ar: 'بقيق',            name_en: 'Buqayq' },
  { id: 68,  region_id: 5, name_ar: 'النعيرية',        name_en: 'An-Nairyah' },
  { id: 69,  region_id: 5, name_ar: 'قرية العليا',     name_en: 'Qaryat Al-Ulya' },
  { id: 70,  region_id: 5, name_ar: 'العديد',          name_en: 'Al-Udayd' },
  // عسير
  { id: 71,  region_id: 6, name_ar: 'أبها',            name_en: 'Abha' },
  { id: 72,  region_id: 6, name_ar: 'خميس مشيط',       name_en: 'Khamis Mushait' },
  { id: 73,  region_id: 6, name_ar: 'بيشة',            name_en: 'Bisha' },
  { id: 74,  region_id: 6, name_ar: 'محايل عسير',      name_en: 'Mahayil Asir' },
  { id: 75,  region_id: 6, name_ar: 'النماص',          name_en: 'An-Namas' },
  { id: 76,  region_id: 6, name_ar: 'ظهران الجنوب',    name_en: 'Dhahran Al-Janub' },
  { id: 77,  region_id: 6, name_ar: 'تثليث',           name_en: 'Tathlith' },
  { id: 78,  region_id: 6, name_ar: 'رجال ألمع',       name_en: 'Rijal Alma' },
  { id: 79,  region_id: 6, name_ar: 'سراة عبيدة',      name_en: 'Sarat Abidah' },
  { id: 80,  region_id: 6, name_ar: 'أحد رفيدة',       name_en: 'Ahad Rafidah' },
  { id: 81,  region_id: 6, name_ar: 'طريب',            name_en: 'Tarib' },
  { id: 82,  region_id: 6, name_ar: 'بلقرن',           name_en: 'Balqarn' },
  { id: 83,  region_id: 6, name_ar: 'المجاردة',        name_en: 'Al-Majaridah' },
  { id: 84,  region_id: 6, name_ar: 'البرك',           name_en: 'Al-Birk' },
  { id: 85,  region_id: 6, name_ar: 'بارق',            name_en: 'Bariq' },
  { id: 86,  region_id: 6, name_ar: 'تنومة',           name_en: 'Tanumah' },
  { id: 87,  region_id: 6, name_ar: 'الحرجة',          name_en: 'Al-Harajah' },
  { id: 88,  region_id: 6, name_ar: 'العرين',          name_en: 'Al-Areen' },
  // تبوك
  { id: 89,  region_id: 7, name_ar: 'تبوك',            name_en: 'Tabuk' },
  { id: 90,  region_id: 7, name_ar: 'الوجه',           name_en: 'Al-Wajh' },
  { id: 91,  region_id: 7, name_ar: 'تيماء',           name_en: 'Tayma' },
  { id: 92,  region_id: 7, name_ar: 'ضباء',            name_en: 'Duba' },
  { id: 93,  region_id: 7, name_ar: 'أملج',            name_en: 'Umluj' },
  { id: 94,  region_id: 7, name_ar: 'حقل',             name_en: 'Haql' },
  { id: 95,  region_id: 7, name_ar: 'البدع',           name_en: 'Al-Bada' },
  // حائل
  { id: 96,  region_id: 8, name_ar: 'حائل',            name_en: 'Hail' },
  { id: 97,  region_id: 8, name_ar: 'بقعاء',           name_en: 'Baqaa' },
  { id: 98,  region_id: 8, name_ar: 'الغزالة',         name_en: 'Al-Ghazalah' },
  { id: 99,  region_id: 8, name_ar: 'الشنان',          name_en: 'Ash-Shinan' },
  { id: 100, region_id: 8, name_ar: 'الشملي',          name_en: 'Ash-Shimli' },
  { id: 101, region_id: 8, name_ar: 'الحائط',          name_en: 'Al-Hait' },
  { id: 102, region_id: 8, name_ar: 'السليمي',         name_en: 'As-Sulaymi' },
  { id: 103, region_id: 8, name_ar: 'موقق',            name_en: 'Mawqaq' },
  { id: 104, region_id: 8, name_ar: 'سميراء',          name_en: 'Sumayra' },
  // الحدود الشمالية
  { id: 105, region_id: 9, name_ar: 'عرعر',            name_en: 'Arar' },
  { id: 106, region_id: 9, name_ar: 'رفحاء',           name_en: 'Rafha' },
  { id: 107, region_id: 9, name_ar: 'طريف',            name_en: 'Turaif' },
  { id: 108, region_id: 9, name_ar: 'العويقيلة',       name_en: 'Al-Uwayqilah' },
  // جازان
  { id: 109, region_id: 10, name_ar: 'جازان',           name_en: 'Jazan' },
  { id: 110, region_id: 10, name_ar: 'صبيا',            name_en: 'Sabya' },
  { id: 111, region_id: 10, name_ar: 'أبو عريش',        name_en: 'Abu Arish' },
  { id: 112, region_id: 10, name_ar: 'صامطة',           name_en: 'Samtah' },
  { id: 113, region_id: 10, name_ar: 'بيش',             name_en: 'Baish' },
  { id: 114, region_id: 10, name_ar: 'الدرب',           name_en: 'Ad-Darb' },
  { id: 115, region_id: 10, name_ar: 'الريث',           name_en: 'Ar-Reith' },
  { id: 116, region_id: 10, name_ar: 'العارضة',         name_en: 'Al-Aridhah' },
  { id: 117, region_id: 10, name_ar: 'أحد المسارحة',    name_en: 'Ahad Al-Masarihah' },
  { id: 118, region_id: 10, name_ar: 'الحرث',           name_en: 'Al-Harith' },
  { id: 119, region_id: 10, name_ar: 'العيدابي',        name_en: 'Al-Aydabi' },
  { id: 120, region_id: 10, name_ar: 'الدائر',          name_en: 'Ad-Dair' },
  { id: 121, region_id: 10, name_ar: 'فرسان',           name_en: 'Farasan' },
  // نجران
  { id: 122, region_id: 11, name_ar: 'نجران',           name_en: 'Najran' },
  { id: 123, region_id: 11, name_ar: 'شرورة',           name_en: 'Sharurah' },
  { id: 124, region_id: 11, name_ar: 'حبونا',           name_en: 'Habuna' },
  { id: 125, region_id: 11, name_ar: 'بدر الجنوب',      name_en: 'Badr Al-Janub' },
  { id: 126, region_id: 11, name_ar: 'يدمة',            name_en: 'Yadamah' },
  { id: 127, region_id: 11, name_ar: 'ثار',             name_en: 'Thar' },
  { id: 128, region_id: 11, name_ar: 'خباش',            name_en: 'Khubash' },
  // الباحة
  { id: 129, region_id: 12, name_ar: 'الباحة',          name_en: 'Bahah' },
  { id: 130, region_id: 12, name_ar: 'بلجرشي',          name_en: 'Baljurashi' },
  { id: 131, region_id: 12, name_ar: 'المندق',          name_en: 'Al-Mandaq' },
  { id: 132, region_id: 12, name_ar: 'المخواة',         name_en: 'Al-Mikhwah' },
  { id: 133, region_id: 12, name_ar: 'العقيق',          name_en: 'Al-Aqiq' },
  { id: 134, region_id: 12, name_ar: 'القرى',           name_en: 'Al-Qura' },
  { id: 135, region_id: 12, name_ar: 'قلوة',            name_en: 'Qilwah' },
  { id: 136, region_id: 12, name_ar: 'الحجرة',          name_en: 'Al-Hajrah' },
  { id: 137, region_id: 12, name_ar: 'بني حسن',         name_en: 'Bani Hassan' },
  { id: 138, region_id: 12, name_ar: 'غامد الزناد',     name_en: 'Ghamid Az-Zinad' },
  // الجوف
  { id: 139, region_id: 13, name_ar: 'سكاكا',           name_en: 'Sakaka' },
  { id: 140, region_id: 13, name_ar: 'القريات',         name_en: 'Al-Qurayyat' },
  { id: 141, region_id: 13, name_ar: 'دومة الجندل',     name_en: 'Dumat Al-Jandal' },
  { id: 142, region_id: 13, name_ar: 'طبرجل',           name_en: 'Tabarjal' },
];

// Cities tied to specific governorates. For governorates not listed here,
// we synthesise a single "city" entry mirroring the governorate name below.
const EXPLICIT_CITIES = [
  { id: 1,  governorate_id: 1,  name_ar: 'الرياض',          name_en: 'Riyadh' },
  { id: 2,  governorate_id: 22, name_ar: 'جدة',             name_en: 'Jeddah' },
  { id: 3,  governorate_id: 21, name_ar: 'مكة المكرمة',     name_en: 'Makkah' },
  { id: 4,  governorate_id: 38, name_ar: 'المدينة المنورة', name_en: 'Madinah' },
  { id: 5,  governorate_id: 59, name_ar: 'الدمام',          name_en: 'Dammam' },
  { id: 6,  governorate_id: 64, name_ar: 'الخبر',           name_en: 'Khobar' },
  { id: 7,  governorate_id: 23, name_ar: 'الطائف',          name_en: 'Taif' },
  { id: 8,  governorate_id: 89, name_ar: 'تبوك',            name_en: 'Tabuk' },
  { id: 9,  governorate_id: 46, name_ar: 'بريدة',           name_en: 'Buraidah' },
  { id: 10, governorate_id: 71, name_ar: 'أبها',            name_en: 'Abha' },
  { id: 11, governorate_id: 60, name_ar: 'الهفوف',          name_en: 'Hofuf' },
  { id: 12, governorate_id: 60, name_ar: 'المبرز',          name_en: 'Al-Mubarraz' },
  { id: 13, governorate_id: 62, name_ar: 'الجبيل',          name_en: 'Jubail' },
  { id: 14, governorate_id: 63, name_ar: 'القطيف',          name_en: 'Qatif' },
  { id: 15, governorate_id: 39, name_ar: 'ينبع',            name_en: 'Yanbu' },
  { id: 16, governorate_id: 47, name_ar: 'عنيزة',           name_en: 'Unaizah' },
  { id: 17, governorate_id: 48, name_ar: 'الرس',            name_en: 'Ar-Rass' },
  { id: 18, governorate_id: 72, name_ar: 'خميس مشيط',       name_en: 'Khamis Mushait' },
  { id: 19, governorate_id: 73, name_ar: 'بيشة',            name_en: 'Bisha' },
  { id: 20, governorate_id: 109,name_ar: 'جازان',           name_en: 'Jazan' },
  { id: 21, governorate_id: 122,name_ar: 'نجران',           name_en: 'Najran' },
  { id: 22, governorate_id: 129,name_ar: 'الباحة',          name_en: 'Bahah' },
  { id: 23, governorate_id: 139,name_ar: 'سكاكا',           name_en: 'Sakaka' },
  { id: 24, governorate_id: 96, name_ar: 'حائل',            name_en: 'Hail' },
  { id: 25, governorate_id: 105,name_ar: 'عرعر',            name_en: 'Arar' },
  { id: 26, governorate_id: 3,  name_ar: 'الخرج',           name_en: 'Al-Kharj' },
  { id: 27, governorate_id: 9,  name_ar: 'الزلفي',          name_en: 'Az-Zulfi' },
  { id: 28, governorate_id: 61, name_ar: 'حفر الباطن',      name_en: 'Hafar Al-Batin' },
  { id: 29, governorate_id: 65, name_ar: 'الخفجي',          name_en: 'Al-Khafji' },
  { id: 30, governorate_id: 40, name_ar: 'العلا',           name_en: 'Al-Ula' },
];

// Ensure every governorate has at least one selectable city. For any
// governorate without an explicit city, mirror the governorate as the city.
const explicitGovIds = new Set(EXPLICIT_CITIES.map(c => c.governorate_id));
let nextCityId = 1000;
const SYNTHETIC_CITIES = GOVERNORATES
  .filter(g => !explicitGovIds.has(g.id))
  .map(g => ({
    id: nextCityId++,
    governorate_id: g.id,
    name_ar: g.name_ar,
    name_en: g.name_en,
  }));

export const CITIES = [...EXPLICIT_CITIES, ...SYNTHETIC_CITIES];

export const DISTRICTS = [
  // الرياض (city 1)
  { id: 1,  city_id: 1, name_ar: 'العليا' },
  { id: 2,  city_id: 1, name_ar: 'الملز' },
  { id: 3,  city_id: 1, name_ar: 'النخيل' },
  { id: 4,  city_id: 1, name_ar: 'الياسمين' },
  { id: 5,  city_id: 1, name_ar: 'الورود' },
  { id: 6,  city_id: 1, name_ar: 'حطين' },
  { id: 7,  city_id: 1, name_ar: 'الملقا' },
  { id: 8,  city_id: 1, name_ar: 'الروضة' },
  { id: 9,  city_id: 1, name_ar: 'النرجس' },
  { id: 10, city_id: 1, name_ar: 'الربيع' },
  { id: 11, city_id: 1, name_ar: 'المروج' },
  { id: 12, city_id: 1, name_ar: 'العقيق' },
  { id: 13, city_id: 1, name_ar: 'السليمانية' },
  { id: 14, city_id: 1, name_ar: 'الصحافة' },
  { id: 15, city_id: 1, name_ar: 'القيروان' },
  { id: 16, city_id: 1, name_ar: 'العارض' },
  { id: 17, city_id: 1, name_ar: 'الشفا' },
  { id: 18, city_id: 1, name_ar: 'الدرعية الجديدة' },
  { id: 19, city_id: 1, name_ar: 'المعذر' },
  { id: 20, city_id: 1, name_ar: 'الصحافة الشمالية' },
  // جدة (city 2)
  { id: 21, city_id: 2, name_ar: 'الروضة' },
  { id: 22, city_id: 2, name_ar: 'الزهراء' },
  { id: 23, city_id: 2, name_ar: 'الصفا' },
  { id: 24, city_id: 2, name_ar: 'الحمراء' },
  { id: 25, city_id: 2, name_ar: 'النعيم' },
  { id: 26, city_id: 2, name_ar: 'البساتين' },
  { id: 27, city_id: 2, name_ar: 'الفيصلية' },
  { id: 28, city_id: 2, name_ar: 'الشاطئ' },
  { id: 29, city_id: 2, name_ar: 'أبحر الشمالية' },
  { id: 30, city_id: 2, name_ar: 'أبحر الجنوبية' },
  { id: 31, city_id: 2, name_ar: 'البوادي' },
  { id: 32, city_id: 2, name_ar: 'النزهة' },
  { id: 33, city_id: 2, name_ar: 'السلامة' },
  { id: 34, city_id: 2, name_ar: 'المرجان' },
  { id: 35, city_id: 2, name_ar: 'الواحة' },
  // مكة المكرمة (city 3)
  { id: 36, city_id: 3, name_ar: 'العزيزية' },
  { id: 37, city_id: 3, name_ar: 'الششة' },
  { id: 38, city_id: 3, name_ar: 'العوالي' },
  { id: 39, city_id: 3, name_ar: 'النسيم' },
  { id: 40, city_id: 3, name_ar: 'الرصيفة' },
  { id: 41, city_id: 3, name_ar: 'الزاهر' },
  { id: 42, city_id: 3, name_ar: 'الكعكية' },
  { id: 43, city_id: 3, name_ar: 'العتيبية' },
  { id: 44, city_id: 3, name_ar: 'بطحاء قريش' },
  { id: 45, city_id: 3, name_ar: 'المسفلة' },
  // المدينة المنورة (city 4)
  { id: 46, city_id: 4, name_ar: 'قباء' },
  { id: 47, city_id: 4, name_ar: 'العوالي' },
  { id: 48, city_id: 4, name_ar: 'الحرة الشرقية' },
  { id: 49, city_id: 4, name_ar: 'الحرة الغربية' },
  { id: 50, city_id: 4, name_ar: 'السيح' },
  { id: 51, city_id: 4, name_ar: 'العزيزية' },
  { id: 52, city_id: 4, name_ar: 'الخالدية' },
  { id: 53, city_id: 4, name_ar: 'الدفاع' },
  { id: 54, city_id: 4, name_ar: 'بني خدرة' },
  { id: 55, city_id: 4, name_ar: 'الرانوناء' },
  // الدمام (city 5)
  { id: 56, city_id: 5, name_ar: 'الفيصلية' },
  { id: 57, city_id: 5, name_ar: 'النهضة' },
  { id: 58, city_id: 5, name_ar: 'الشاطئ' },
  { id: 59, city_id: 5, name_ar: 'الفردوس' },
  { id: 60, city_id: 5, name_ar: 'الجلوية' },
  { id: 61, city_id: 5, name_ar: 'الإسكان' },
  { id: 62, city_id: 5, name_ar: 'النور' },
  { id: 63, city_id: 5, name_ar: 'الأمانة' },
  { id: 64, city_id: 5, name_ar: 'الزهور' },
  { id: 65, city_id: 5, name_ar: 'البديع' },
  // الخبر (city 6)
  { id: 66, city_id: 6, name_ar: 'الراكة' },
  { id: 67, city_id: 6, name_ar: 'العقربية' },
  { id: 68, city_id: 6, name_ar: 'البحيرة' },
  { id: 69, city_id: 6, name_ar: 'الخبر الشمالية' },
  { id: 70, city_id: 6, name_ar: 'الخبر الجنوبية' },
  { id: 71, city_id: 6, name_ar: 'اليرموك' },
  { id: 72, city_id: 6, name_ar: 'الأمواج' },
];

export function getRegions() {
  return REGIONS;
}

export function getGovernorates(regionId) {
  if (!regionId) return GOVERNORATES;
  const rid = Number(regionId);
  return GOVERNORATES.filter(g => g.region_id === rid);
}

export function getCities({ governorateId, regionId } = {}) {
  if (governorateId) {
    const gid = Number(governorateId);
    return CITIES.filter(c => c.governorate_id === gid);
  }
  if (regionId) {
    const rid = Number(regionId);
    const govIds = new Set(GOVERNORATES.filter(g => g.region_id === rid).map(g => g.id));
    return CITIES.filter(c => govIds.has(c.governorate_id));
  }
  return CITIES;
}

export function getDistricts(cityId) {
  if (!cityId) return DISTRICTS;
  const cid = Number(cityId);
  return DISTRICTS.filter(d => d.city_id === cid);
}
