-- Auto-generated from database/seed.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/dump-pg-sql.js'

INSERT INTO roles (id, name, display_name, description) VALUES
(1, 'admin', 'مدير النظام', 'صلاحيات كاملة'),
(2, 'provider', 'مقدم خدمة', 'يقدم خدمات للعملاء'),
(3, 'client', 'عميل', 'يطلب الخدمات') ON CONFLICT DO NOTHING;

INSERT INTO regions (id, code, name_ar, name_en, capital_ar, capital_en, latitude, longitude, sort_order) VALUES
(1,  'RD', 'منطقة الرياض',         'Riyadh Region',          'الرياض',         'Riyadh',  24.7136, 46.6753, 1),
(2,  'MK', 'منطقة مكة المكرمة',    'Makkah Region',          'مكة المكرمة',    'Makkah',  21.3891, 39.8579, 2),
(3,  'MD', 'منطقة المدينة المنورة','Madinah Region',         'المدينة المنورة','Madinah', 24.5247, 39.5692, 3),
(4,  'QS', 'منطقة القصيم',         'Al-Qassim Region',       'بريدة',          'Buraidah',26.3260, 43.9750, 4),
(5,  'ES', 'المنطقة الشرقية',      'Eastern Region',         'الدمام',         'Dammam',  26.4207, 50.0888, 5),
(6,  'AS', 'منطقة عسير',           'Asir Region',            'أبها',           'Abha',    18.2164, 42.5053, 6),
(7,  'TB', 'منطقة تبوك',           'Tabuk Region',           'تبوك',           'Tabuk',   28.3835, 36.5662, 7),
(8,  'HA', 'منطقة حائل',           'Hail Region',            'حائل',           'Hail',    27.5114, 41.6900, 8),
(9,  'NB', 'منطقة الحدود الشمالية','Northern Borders Region','عرعر',           'Arar',    30.9753, 41.0381, 9),
(10, 'JZ', 'منطقة جازان',          'Jazan Region',           'جازان',          'Jazan',   16.8892, 42.5511, 10),
(11, 'NJ', 'منطقة نجران',          'Najran Region',          'نجران',          'Najran',  17.4924, 44.1277, 11),
(12, 'BH', 'منطقة الباحة',         'Al-Bahah Region',        'الباحة',         'Bahah',   20.0129, 41.4677, 12),
(13, 'JF', 'منطقة الجوف',          'Al-Jouf Region',         'سكاكا',          'Sakaka',  29.9697, 40.2064, 13) ON CONFLICT DO NOTHING;

INSERT INTO governorates (id, region_id, name_ar, name_en, latitude, longitude, is_capital, sort_order) VALUES
(1,   1, 'الرياض',          'Riyadh',           24.7136, 46.6753, 1, 1),
(2,   1, 'الدرعية',         'Diriyah',          24.7320, 46.5750, 0, 2),
(3,   1, 'الخرج',           'Al-Kharj',         24.1556, 47.3120, 0, 3),
(4,   1, 'الدوادمي',        'Ad-Dawadmi',       24.5061, 44.3923, 0, 4),
(5,   1, 'المجمعة',         'Al-Majmaah',       25.9020, 45.3450, 0, 5),
(6,   1, 'القويعية',        'Al-Quwaiiyah',     24.0667, 45.2833, 0, 6),
(7,   1, 'وادي الدواسر',    'Wadi Ad-Dawasir',  20.4944, 44.8044, 0, 7),
(8,   1, 'الأفلاج',         'Al-Aflaj',         22.2774, 46.7172, 0, 8),
(9,   1, 'الزلفي',          'Az-Zulfi',         26.3000, 44.8000, 0, 9),
(10,  1, 'شقراء',           'Shaqra',           25.2486, 45.2519, 0, 10),
(11,  1, 'حوطة بني تميم',   'Hawtat Bani Tamim',23.5167, 46.8500, 0, 11),
(12,  1, 'عفيف',            'Afif',             23.9061, 42.9170, 0, 12),
(13,  1, 'السليل',          'As-Sulayyil',      20.4607, 45.5763, 0, 13),
(14,  1, 'ضرما',            'Dhurma',           24.6167, 46.1167, 0, 14),
(15,  1, 'المزاحمية',       'Al-Muzahmiyah',    24.4742, 46.2569, 0, 15),
(16,  1, 'رماح',            'Rumah',            25.5808, 47.1422, 0, 16),
(17,  1, 'ثادق',            'Thadiq',           25.2944, 45.8631, 0, 17),
(18,  1, 'حريملاء',         'Huraymila',        25.1167, 46.1167, 0, 18),
(19,  1, 'الحريق',          'Al-Hariq',         23.6128, 46.0978, 0, 19),
(20,  1, 'مرات',            'Marat',            25.0833, 45.4833, 0, 20) ON CONFLICT DO NOTHING;

INSERT INTO governorates (id, region_id, name_ar, name_en, latitude, longitude, is_capital, sort_order) VALUES
(21,  2, 'مكة المكرمة',     'Makkah',           21.3891, 39.8579, 1, 1),
(22,  2, 'جدة',             'Jeddah',           21.4858, 39.1925, 0, 2),
(23,  2, 'الطائف',          'Taif',             21.2703, 40.4178, 0, 3),
(24,  2, 'القنفذة',         'Al-Qunfudhah',     19.1264, 41.0789, 0, 4),
(25,  2, 'الليث',           'Al-Lith',          20.1500, 40.2667, 0, 5),
(26,  2, 'رابغ',            'Rabigh',           22.7986, 39.0347, 0, 6),
(27,  2, 'خليص',            'Khulays',          22.1500, 39.3333, 0, 7),
(28,  2, 'الجموم',          'Al-Jumum',         21.6217, 39.6981, 0, 8),
(29,  2, 'الكامل',          'Al-Kamil',         22.2017, 39.7975, 0, 9),
(30,  2, 'المويه',          'Al-Muwayh',        22.4453, 41.7367, 0, 10),
(31,  2, 'ميسان',           'Maysan',           21.0167, 40.7167, 0, 11),
(32,  2, 'أضم',             'Adham',            20.0833, 41.2333, 0, 12),
(33,  2, 'الخرمة',          'Al-Khurmah',       21.9214, 42.0497, 0, 13),
(34,  2, 'تربة',            'Turabah',          21.2153, 41.6347, 0, 14),
(35,  2, 'رنية',            'Raniyah',          21.2667, 42.8500, 0, 15),
(36,  2, 'العرضيات',        'Al-Ardiyat',       20.0167, 41.4333, 0, 16),
(37,  2, 'بحرة',            'Bahrah',           21.4067, 39.4583, 0, 17) ON CONFLICT DO NOTHING;

INSERT INTO governorates (id, region_id, name_ar, name_en, latitude, longitude, is_capital, sort_order) VALUES
(38,  3, 'المدينة المنورة', 'Madinah',          24.5247, 39.5692, 1, 1),
(39,  3, 'ينبع',            'Yanbu',            24.0892, 38.0617, 0, 2),
(40,  3, 'العلا',           'Al-Ula',           26.6086, 37.9233, 0, 3),
(41,  3, 'مهد الذهب',       'Mahd Ad-Dahab',    23.4839, 40.8617, 0, 4),
(42,  3, 'الحناكية',        'Al-Henakiyah',     24.8631, 40.5083, 0, 5),
(43,  3, 'بدر',             'Badr',             23.7833, 38.7833, 0, 6),
(44,  3, 'خيبر',            'Khaybar',          25.7000, 39.2833, 0, 7),
(45,  3, 'العيص',           'Al-Ais',           25.8997, 38.5972, 0, 8) ON CONFLICT DO NOTHING;

INSERT INTO governorates (id, region_id, name_ar, name_en, latitude, longitude, is_capital, sort_order) VALUES
(46,  4, 'بريدة',           'Buraidah',         26.3260, 43.9750, 1, 1),
(47,  4, 'عنيزة',           'Unaizah',          26.0843, 43.9936, 0, 2),
(48,  4, 'الرس',            'Ar-Rass',          25.8667, 43.5000, 0, 3),
(49,  4, 'المذنب',          'Al-Mithnab',       25.8617, 44.2228, 0, 4),
(50,  4, 'البكيرية',        'Al-Bukayriyah',    26.1397, 43.6536, 0, 5),
(51,  4, 'البدائع',         'Al-Badaie',        26.0254, 43.7681, 0, 6),
(52,  4, 'الأسياح',         'Al-Asyah',         26.5167, 44.0833, 0, 7),
(53,  4, 'النبهانية',       'An-Nabhaniyah',    26.4500, 43.4500, 0, 8),
(54,  4, 'الشماسية',        'Ash-Shamasiyah',   26.5000, 44.0500, 0, 9),
(55,  4, 'عيون الجواء',     'Uyun Al-Jiwa',     26.5333, 43.7167, 0, 10),
(56,  4, 'رياض الخبراء',    'Riyad Al-Khabra',  26.5083, 43.5722, 0, 11),
(57,  4, 'ضرية',            'Dariyah',          27.7333, 42.7167, 0, 12),
(58,  4, 'عقلة الصقور',     'Uqlat As-Suqur',   25.8500, 42.1833, 0, 13) ON CONFLICT DO NOTHING;

INSERT INTO governorates (id, region_id, name_ar, name_en, latitude, longitude, is_capital, sort_order) VALUES
(59,  5, 'الدمام',          'Dammam',           26.4207, 50.0888, 1, 1),
(60,  5, 'الأحساء',         'Al-Ahsa',          25.3833, 49.5833, 0, 2),
(61,  5, 'حفر الباطن',      'Hafar Al-Batin',   28.4337, 45.9601, 0, 3),
(62,  5, 'الجبيل',          'Jubail',           27.0174, 49.6225, 0, 4),
(63,  5, 'القطيف',          'Qatif',            26.5654, 50.0079, 0, 5),
(64,  5, 'الخبر',           'Khobar',           26.2172, 50.1971, 0, 6),
(65,  5, 'الخفجي',          'Al-Khafji',        28.4347, 48.4914, 0, 7),
(66,  5, 'رأس تنورة',       'Ras Tanura',       26.6453, 50.1583, 0, 8),
(67,  5, 'بقيق',            'Buqayq',           25.9342, 49.6664, 0, 9),
(68,  5, 'النعيرية',        'An-Nairyah',       27.4811, 48.4894, 0, 10),
(69,  5, 'قرية العليا',     'Qaryat Al-Ulya',   27.6275, 47.7211, 0, 11),
(70,  5, 'العديد',          'Al-Udayd',         24.6000, 51.3833, 0, 12) ON CONFLICT DO NOTHING;

INSERT INTO governorates (id, region_id, name_ar, name_en, latitude, longitude, is_capital, sort_order) VALUES
(71,  6, 'أبها',             'Abha',            18.2164, 42.5053, 1, 1),
(72,  6, 'خميس مشيط',        'Khamis Mushait',  18.3000, 42.7333, 0, 2),
(73,  6, 'بيشة',             'Bisha',           19.9774, 42.5908, 0, 3),
(74,  6, 'محايل عسير',       'Mahayil Asir',    18.5500, 42.0333, 0, 4),
(75,  6, 'النماص',           'An-Namas',        19.1500, 42.1167, 0, 5),
(76,  6, 'ظهران الجنوب',     'Dhahran Al-Janub',17.6692, 43.5161, 0, 6),
(77,  6, 'تثليث',            'Tathlith',        19.5667, 43.3000, 0, 7),
(78,  6, 'رجال ألمع',        'Rijal Alma',      18.1922, 42.2569, 0, 8),
(79,  6, 'سراة عبيدة',       'Sarat Abidah',    18.2167, 42.8000, 0, 9),
(80,  6, 'أحد رفيدة',        'Ahad Rafidah',    18.2083, 42.8642, 0, 10),
(81,  6, 'طريب',             'Tarib',           18.7667, 43.3333, 0, 11),
(82,  6, 'بلقرن',            'Balqarn',         19.7167, 42.1500, 0, 12),
(83,  6, 'المجاردة',         'Al-Majaridah',    19.1186, 41.9000, 0, 13),
(84,  6, 'البرك',            'Al-Birk',         18.2333, 41.5333, 0, 14),
(85,  6, 'بارق',             'Bariq',           18.7500, 41.7500, 0, 15),
(86,  6, 'تنومة',            'Tanumah',         19.0875, 42.1719, 0, 16),
(87,  6, 'الحرجة',           'Al-Harajah',      19.3333, 41.9667, 0, 17),
(88,  6, 'العرين',           'Al-Areen',        18.1833, 42.4500, 0, 18) ON CONFLICT DO NOTHING;

INSERT INTO governorates (id, region_id, name_ar, name_en, latitude, longitude, is_capital, sort_order) VALUES
(89,  7, 'تبوك',             'Tabuk',           28.3835, 36.5662, 1, 1),
(90,  7, 'الوجه',            'Al-Wajh',         26.2419, 36.4642, 0, 2),
(91,  7, 'تيماء',            'Tayma',           27.6306, 38.5453, 0, 3),
(92,  7, 'ضباء',             'Duba',            27.3500, 35.7000, 0, 4),
(93,  7, 'أملج',             'Umluj',           25.0214, 37.2697, 0, 5),
(94,  7, 'حقل',              'Haql',            29.2972, 34.9381, 0, 6),
(95,  7, 'البدع',            'Al-Bada',         28.4667, 35.0000, 0, 7) ON CONFLICT DO NOTHING;

INSERT INTO governorates (id, region_id, name_ar, name_en, latitude, longitude, is_capital, sort_order) VALUES
(96,  8, 'حائل',             'Hail',            27.5114, 41.6900, 1, 1),
(97,  8, 'بقعاء',            'Baqaa',           27.8833, 42.6500, 0, 2),
(98,  8, 'الغزالة',          'Al-Ghazalah',     26.8167, 41.3333, 0, 3),
(99,  8, 'الشنان',           'Ash-Shinan',      27.4667, 42.6167, 0, 4),
(100, 8, 'الشملي',           'Ash-Shimli',      27.3333, 40.5000, 0, 5),
(101, 8, 'الحائط',           'Al-Hait',         26.0567, 41.7244, 0, 6),
(102, 8, 'السليمي',          'As-Sulaymi',      26.4333, 41.5667, 0, 7),
(103, 8, 'موقق',             'Mawqaq',          27.6500, 41.1167, 0, 8),
(104, 8, 'سميراء',           'Sumayra',         27.5667, 42.2667, 0, 9) ON CONFLICT DO NOTHING;

INSERT INTO governorates (id, region_id, name_ar, name_en, latitude, longitude, is_capital, sort_order) VALUES
(105, 9, 'عرعر',             'Arar',            30.9753, 41.0381, 1, 1),
(106, 9, 'رفحاء',            'Rafha',           29.6383, 43.4983, 0, 2),
(107, 9, 'طريف',             'Turaif',          31.6725, 38.6638, 0, 3),
(108, 9, 'العويقيلة',        'Al-Uwayqilah',    30.3422, 42.2658, 0, 4) ON CONFLICT DO NOTHING;

INSERT INTO governorates (id, region_id, name_ar, name_en, latitude, longitude, is_capital, sort_order) VALUES
(109,10, 'جازان',             'Jazan',          16.8892, 42.5511, 1, 1),
(110,10, 'صبيا',              'Sabya',          17.1494, 42.6253, 0, 2),
(111,10, 'أبو عريش',          'Abu Arish',      16.9692, 42.8311, 0, 3),
(112,10, 'صامطة',             'Samtah',         16.5972, 42.9461, 0, 4),
(113,10, 'بيش',               'Baish',          17.3811, 42.5836, 0, 5),
(114,10, 'الدرب',             'Ad-Darb',        17.7228, 42.2528, 0, 6),
(115,10, 'الريث',             'Ar-Reith',       17.5333, 43.0167, 0, 7),
(116,10, 'العارضة',           'Al-Aridhah',     16.9667, 43.0500, 0, 8),
(117,10, 'أحد المسارحة',      'Ahad Al-Masarihah',16.7058,42.9569,0, 9),
(118,10, 'الحرث',             'Al-Harith',      16.7136, 43.0203, 0, 10),
(119,10, 'العيدابي',          'Al-Aydabi',      17.2167, 42.8667, 0, 11),
(120,10, 'الدائر',            'Ad-Dair',        17.4833, 43.2167, 0, 12),
(121,10, 'فرسان',             'Farasan',        16.7000, 42.1167, 0, 13) ON CONFLICT DO NOTHING;

INSERT INTO governorates (id, region_id, name_ar, name_en, latitude, longitude, is_capital, sort_order) VALUES
(122,11, 'نجران',             'Najran',         17.4924, 44.1277, 1, 1),
(123,11, 'شرورة',             'Sharurah',       17.4664, 47.1147, 0, 2),
(124,11, 'حبونا',             'Habuna',         17.6833, 44.3500, 0, 3),
(125,11, 'بدر الجنوب',        'Badr Al-Janub',  17.9833, 45.6167, 0, 4),
(126,11, 'يدمة',              'Yadamah',        17.5667, 45.0667, 0, 5),
(127,11, 'ثار',               'Thar',           17.7500, 44.3000, 0, 6),
(128,11, 'خباش',              'Khubash',        17.6667, 44.0500, 0, 7) ON CONFLICT DO NOTHING;

INSERT INTO governorates (id, region_id, name_ar, name_en, latitude, longitude, is_capital, sort_order) VALUES
(129,12, 'الباحة',            'Bahah',          20.0129, 41.4677, 1, 1),
(130,12, 'بلجرشي',            'Baljurashi',     19.8589, 41.5683, 0, 2),
(131,12, 'المندق',            'Al-Mandaq',      20.1933, 41.2825, 0, 3),
(132,12, 'المخواة',           'Al-Mikhwah',     19.7500, 41.4333, 0, 4),
(133,12, 'العقيق',            'Al-Aqiq',        20.2861, 41.6494, 0, 5),
(134,12, 'القرى',             'Al-Qura',        20.3000, 41.3000, 0, 6),
(135,12, 'قلوة',              'Qilwah',         19.6667, 41.4167, 0, 7),
(136,12, 'الحجرة',            'Al-Hajrah',      19.7833, 41.6000, 0, 8),
(137,12, 'بني حسن',           'Bani Hassan',    20.1000, 41.3667, 0, 9),
(138,12, 'غامد الزناد',       'Ghamid Az-Zinad',20.1500, 41.5167, 0, 10) ON CONFLICT DO NOTHING;

INSERT INTO governorates (id, region_id, name_ar, name_en, latitude, longitude, is_capital, sort_order) VALUES
(139,13, 'سكاكا',             'Sakaka',         29.9697, 40.2064, 1, 1),
(140,13, 'القريات',           'Al-Qurayyat',    31.3320, 37.3450, 0, 2),
(141,13, 'دومة الجندل',       'Dumat Al-Jandal',29.8000, 39.8667, 0, 3),
(142,13, 'طبرجل',             'Tabarjal',       30.5000, 38.2167, 0, 4) ON CONFLICT DO NOTHING;

INSERT INTO cities (id, governorate_id, name_ar, name_en, latitude, longitude, is_active, sort_order) VALUES
(1,   1, 'الرياض',          'Riyadh',   24.7136, 46.6753, 1, 1),
(2,  22, 'جدة',             'Jeddah',   21.4858, 39.1925, 1, 2),
(3,  21, 'مكة المكرمة',     'Makkah',   21.3891, 39.8579, 1, 3),
(4,  38, 'المدينة المنورة', 'Madinah',  24.5247, 39.5692, 1, 4),
(5,  59, 'الدمام',          'Dammam',   26.4207, 50.0888, 1, 5),
(6,  64, 'الخبر',           'Khobar',   26.2172, 50.1971, 1, 6),
(7,  23, 'الطائف',          'Taif',     21.2703, 40.4178, 1, 7),
(8,  89, 'تبوك',            'Tabuk',    28.3835, 36.5662, 1, 8),
(9,  46, 'بريدة',           'Buraidah', 26.3260, 43.9750, 1, 9),
(10, 71, 'أبها',            'Abha',     18.2164, 42.5053, 1, 10),

(11, 60, 'الهفوف',          'Hofuf',    25.3833, 49.5833, 1, 11),
(12, 60, 'المبرز',          'Al-Mubarraz',25.4081, 49.5910, 1, 12),
(13, 62, 'الجبيل',          'Jubail',   27.0174, 49.6225, 1, 13),
(14, 63, 'القطيف',          'Qatif',    26.5654, 50.0079, 1, 14),
(15, 39, 'ينبع',            'Yanbu',    24.0892, 38.0617, 1, 15),
(16, 47, 'عنيزة',           'Unaizah',  26.0843, 43.9936, 1, 16),
(17, 48, 'الرس',            'Ar-Rass',  25.8667, 43.5000, 1, 17),
(18, 72, 'خميس مشيط',       'Khamis Mushait',18.3000,42.7333,1, 18),
(19, 73, 'بيشة',            'Bisha',    19.9774, 42.5908, 1, 19),
(20,109, 'جازان',            'Jazan',   16.8892, 42.5511, 1, 20),
(21,122, 'نجران',           'Najran',   17.4924, 44.1277, 1, 21),
(22,129, 'الباحة',          'Bahah',    20.0129, 41.4677, 1, 22),
(23,139, 'سكاكا',           'Sakaka',   29.9697, 40.2064, 1, 23),
(24, 96, 'حائل',            'Hail',     27.5114, 41.6900, 1, 24),
(25,105, 'عرعر',            'Arar',     30.9753, 41.0381, 1, 25),
(26,  3, 'الخرج',           'Al-Kharj', 24.1556, 47.3120, 1, 26),
(27,  9, 'الزلفي',          'Az-Zulfi', 26.3000, 44.8000, 1, 27),
(28, 61, 'حفر الباطن',      'Hafar Al-Batin',28.4337,45.9601,1, 28),
(29, 65, 'الخفجي',          'Al-Khafji',28.4347, 48.4914, 1, 29),
(30, 40, 'العلا',           'Al-Ula',   26.6086, 37.9233, 1, 30) ON CONFLICT DO NOTHING;

INSERT INTO districts (id, city_id, name_ar, latitude, longitude) VALUES
(1,  1, 'العليا',          24.6915, 46.6859),
(2,  1, 'الملز',            24.6740, 46.7351),
(3,  1, 'النخيل',           24.7741, 46.6300),
(4,  1, 'الياسمين',         24.8412, 46.6442),
(5,  1, 'الورود',           24.7370, 46.6802),
(6,  1, 'حطين',             24.7706, 46.6193),
(7,  1, 'الملقا',           24.8011, 46.6500),
(8,  1, 'الروضة',           24.7167, 46.7333),
(9,  1, 'النرجس',           24.9000, 46.6500),
(10, 1, 'الربيع',           24.8167, 46.6833),
(11, 1, 'المروج',           24.7833, 46.6833),
(12, 1, 'العقيق',           24.7833, 46.6167),
(13, 1, 'السليمانية',       24.6833, 46.7000),
(14, 1, 'الصحافة',          24.7667, 46.6667),
(15, 1, 'القيروان',         24.8500, 46.5833),
(16, 1, 'العارض',           24.9333, 46.6500),
(17, 1, 'الشفا',            24.5500, 46.7167),
(18, 1, 'الدرعية الجديدة',  24.7167, 46.5833),
(19, 1, 'المعذر',           24.6833, 46.6667),
(20, 1, 'الصحافة الشمالية', 24.7833, 46.6500) ON CONFLICT DO NOTHING;

INSERT INTO districts (id, city_id, name_ar, latitude, longitude) VALUES
(21, 2, 'الروضة',           21.5810, 39.1690),
(22, 2, 'الزهراء',          21.5395, 39.1797),
(23, 2, 'الصفا',            21.5571, 39.1908),
(24, 2, 'الحمراء',          21.5169, 39.1857),
(25, 2, 'النعيم',           21.6167, 39.1500),
(26, 2, 'البساتين',         21.6000, 39.1500),
(27, 2, 'الفيصلية',         21.5167, 39.1833),
(28, 2, 'الشاطئ',           21.6833, 39.1167),
(29, 2, 'أبحر الشمالية',    21.7333, 39.0833),
(30, 2, 'أبحر الجنوبية',    21.6833, 39.1000),
(31, 2, 'البوادي',          21.5500, 39.2000),
(32, 2, 'النزهة',           21.5667, 39.1833),
(33, 2, 'السلامة',          21.5833, 39.1500),
(34, 2, 'المرجان',          21.6500, 39.1333),
(35, 2, 'الواحة',           21.5333, 39.2000) ON CONFLICT DO NOTHING;

INSERT INTO districts (id, city_id, name_ar, latitude, longitude) VALUES
(36, 3, 'العزيزية',         21.3973, 39.8856),
(37, 3, 'الششة',            21.3786, 39.8474),
(38, 3, 'العوالي',          21.3500, 39.8500),
(39, 3, 'النسيم',           21.4000, 39.8167),
(40, 3, 'الرصيفة',          21.3667, 39.8333),
(41, 3, 'الزاهر',           21.4333, 39.8167),
(42, 3, 'الكعكية',          21.4167, 39.8500),
(43, 3, 'العتيبية',         21.4333, 39.8333),
(44, 3, 'بطحاء قريش',       21.4167, 39.8333),
(45, 3, 'المسفلة',          21.4167, 39.8167) ON CONFLICT DO NOTHING;

INSERT INTO districts (id, city_id, name_ar, latitude, longitude) VALUES
(46, 4, 'قباء',             24.4639, 39.6181),
(47, 4, 'العوالي',          24.4500, 39.6167),
(48, 4, 'الحرة الشرقية',    24.5500, 39.6000),
(49, 4, 'الحرة الغربية',    24.4833, 39.5500),
(50, 4, 'السيح',            24.5333, 39.5500),
(51, 4, 'العزيزية',         24.5167, 39.5833),
(52, 4, 'الخالدية',         24.5333, 39.5667),
(53, 4, 'الدفاع',           24.4667, 39.5833),
(54, 4, 'بني خدرة',         24.4833, 39.6333),
(55, 4, 'الرانوناء',        24.4500, 39.5833) ON CONFLICT DO NOTHING;

INSERT INTO districts (id, city_id, name_ar, latitude, longitude) VALUES
(56, 5, 'الفيصلية',         26.4205, 50.0791),
(57, 5, 'النهضة',           26.3837, 50.0904),
(58, 5, 'الشاطئ',           26.4500, 50.1167),
(59, 5, 'الفردوس',          26.4333, 50.1000),
(60, 5, 'الجلوية',          26.4167, 50.1000),
(61, 5, 'الإسكان',          26.4500, 50.0833),
(62, 5, 'النور',            26.3833, 50.1167),
(63, 5, 'الأمانة',          26.4000, 50.0833),
(64, 5, 'الزهور',           26.4167, 50.0667),
(65, 5, 'البديع',           26.4500, 50.1000) ON CONFLICT DO NOTHING;

INSERT INTO districts (id, city_id, name_ar, latitude, longitude) VALUES
(66, 6, 'الراكة',           26.2954, 50.2231),
(67, 6, 'العقربية',         26.2667, 50.2000),
(68, 6, 'البحيرة',          26.2833, 50.2167),
(69, 6, 'الخبر الشمالية',   26.2833, 50.2000),
(70, 6, 'الخبر الجنوبية',   26.2000, 50.2000),
(71, 6, 'اليرموك',          26.2500, 50.1833),
(72, 6, 'الأمواج',          26.3000, 50.2167) ON CONFLICT DO NOTHING;

INSERT INTO categories (id, name_ar, name_en, slug, icon, color, sort_order) VALUES
(1,  'صيانة منزلية',                'Home maintenance',          'home-maintenance',  '🔧', '#3b82f6', 1),
(2,  'نظافة',                       'Cleaning',                  'cleaning',          '✨', '#10b981', 2),
(3,  'نقل وعفش',                    'Moving',                    'moving',            '🚚', '#f59e0b', 3),
(4,  'كهرباء',                      'Electrical',                'electrical',        '⚡', '#ef4444', 4),
(5,  'سباكة',                       'Plumbing',                  'plumbing',          '💧', '#06b6d4', 5),
(6,  'تكييف وتبريد',                'AC & cooling',              'ac-cooling',        '❄️', '#0ea5e9', 6),
(7,  'دهانات وديكور',               'Paint & décor',             'paint-decor',       '🎨', '#8b5cf6', 7),
(8,  'حدائق ومناظر',                'Gardens & landscaping',     'gardens',           '🌿', '#22c55e', 8),
(9,  'تعليم وتدريس',                'Tutoring',                  'education',         '📚', '#6366f1', 9),
(10, 'سيارات',                      'Cars',                      'cars',              '🚗', '#64748b', 10),
(11, 'تقنية وكمبيوتر',              'Tech & computers',          'tech',              '💻', '#0f172a', 11),
(12, 'مناسبات وضيافة',              'Events & catering',         'events',            '🎉', '#ec4899', 12),
(13, 'الأسر المنتجة',               'Home businesses',           'home-businesses',   '🍳', '#ec4899', 13),
(14, 'التصوير والإبداع',            'Photography & creative',    'photography',       '📸', '#6366f1', 14),
(15, 'التسويق الرقمي',              'Digital marketing',         'digital-marketing', '📱', '#06b6d4', 15),
(16, 'التوصيل والشحن',              'Delivery & shipping',       'delivery',          '📦', '#f59e0b', 16),
(17, 'العقار والإيجار',             'Real estate & rentals',     'real-estate',       '🏢', '#9c6a3d', 17),
(18, 'المقاولات والإنشاءات',        'Construction & contracting','construction',      '🏗️', '#d97706', 18),
(19, 'العناية الشخصية والتجميل',    'Personal care & beauty',    'personal-care',     '💇', '#f43f5e', 19),
(20, 'السفر والرحلات',              'Travel & tours',            'travel-tours',      '✈️', '#0ea5e9', 20),
(21, 'خدمات الأعمال',               'Business services',         'business-services', '💼', '#475569', 21),
(22, 'الصحة المنزلية والرعاية',     'Home health & care',        'home-health',       '🩺', '#dc2626', 22),
(23, 'التدريب والدورات',            'Training & courses',        'training',          '🏆', '#8b5cf6', 23),
(24, 'اللياقة والرياضة',            'Fitness & sports',          'fitness',           '💪', '#16a34a', 24),
(25, 'خدمات الطلاب',                'Student services',          'student-services',  '🎓', '#10b981', 25),
(26, 'الخياطة والتفصيل',            'Tailoring & sewing',        'tailoring',         '🧵', '#a855f7', 26),
(27, 'النقل والمواصلات',            'Transport & mobility',      'transport',         '🚐', '#eab308', 27) ON CONFLICT DO NOTHING;

INSERT INTO services (id, category_id, name_ar, name_en, slug, sort_order) VALUES

(1,  1,  'صيانة عامة',                  'General maintenance',      'general-maintenance',     1),
(2,  1,  'تركيب أثاث',                  'Furniture installation',   'furniture-installation',  2),
(3,  1,  'إصلاح أبواب ونوافذ',          'Door & window repair',     'doors-windows-repair',    3),
(4,  2,  'تنظيف منازل',                 'Home cleaning',            'home-cleaning',           1),
(5,  2,  'تنظيف خزانات',                'Water tank cleaning',      'tank-cleaning',           2),
(6,  2,  'تنظيف مكيفات',                'AC cleaning',              'ac-cleaning',             3),
(7,  2,  'مكافحة حشرات',                'Pest control',             'pest-control',            4),
(8,  3,  'نقل عفش داخل المدينة',        'Moving in city',           'moving-in-city',          1),
(9,  3,  'نقل عفش بين المدن',           'Moving between cities',    'moving-between-cities',   2),
(10, 3,  'فك وتركيب أثاث',              'Furniture assembly',       'assembly',                3),
(11, 4,  'إصلاح أعطال كهربائية',        'Electrical repair',        'electrical-repair',       1),
(12, 4,  'تمديدات كهربائية',            'Electrical wiring',        'electrical-wiring',       2),
(13, 5,  'إصلاح تسربات',                'Leak repair',              'leak-repair',             1),
(14, 5,  'تسليك مجاري',                 'Drain cleaning',           'drain-cleaning',          2),
(15, 6,  'صيانة مكيفات سبليت',          'Split AC service',         'split-ac-service',        1),
(16, 6,  'صيانة مكيفات مركزية',         'Central AC service',       'central-ac-service',      2),
(17, 7,  'دهان منازل',                  'Home painting',            'home-painting',           1),
(18, 7,  'ورق جدران',                   'Wallpaper',                'wallpaper',               2),
(19, 8,  'تنسيق حدائق',                 'Garden landscaping',       'garden-landscaping',      1),
(20, 9,  'تدريس خصوصي',                 'Private tutoring',         'private-tutoring',        1),
(21, 11, 'صيانة كمبيوتر',               'Computer repair',          'computer-repair',         1),
(22, 11, 'تصميم مواقع',                 'Web design',               'web-design',              2),
(23, 12, 'تنظيم حفلات',                 'Event planning',           'event-planning',          1),

(24, 1,  'تركيب ستائر',                 'Curtain installation',     'curtain-installation',    4),
(25, 2,  'غسيل سجاد',                   'Carpet cleaning',          'carpet-cleaning',         5),
(26, 4,  'تركيب إنارة',                 'Lighting installation',    'lighting-installation',   3),
(27, 5,  'تركيب سخانات',                'Heater installation',      'heater-installation',     3),
(28, 6,  'تركيب مكيفات',                'AC installation',          'ac-installation',         3),
(29, 7,  'ديكور جبس',                   'Gypsum decor',             'gypsum-decor',            3),
(30, 8,  'العناية بالعشب',              'Lawn care',                'lawn-care',               2),
(31, 9,  'تحفيظ قرآن',                  'Quran teaching',           'quran-teaching',          2),
(32, 9,  'تدريس لغات',                  'Language tutoring',        'language-tutoring',       3),
(33, 10, 'غسيل سيارات',                 'Car wash',                 'car-wash',                1),
(34, 10, 'تلميع سيارات',                'Car polishing',            'car-polish',              2),
(35, 10, 'تغيير زيت',                   'Oil change',               'oil-change',              3),
(36, 10, 'ميكانيكا متنقلة',             'Mobile mechanic',          'mobile-mechanic',         4),
(37, 11, 'دعم تقني',                    'Tech support',             'tech-support',            3),
(38, 11, 'تركيب شبكات',                 'Network installation',     'network-installation',    4),
(39, 11, 'تركيب كاميرات',               'Camera installation',      'camera-installation',     5),
(40, 11, 'تطوير تطبيقات',               'App development',          'app-development',         6),
(41, 12, 'كوش وأفراح',                  'Wedding stages',           'wedding-stage',           2),
(42, 12, 'تصوير مناسبات',               'Event photography',        'event-photography',       3),
(43, 12, 'تأجير كراسي وطاولات',         'Chair & table rental',     'chairs-tables-rental',    4),

(50, 13, 'طبخ منزلي',                   'Home cooking',             'home-cooking',            1),
(51, 13, 'قهوة وحلويات',                'Coffee & sweets',          'coffee-sweets',           2),
(52, 13, 'ذبائح وولائم',                'Catering meat & feasts',   'catering-meat',           3),
(53, 13, 'مأكولات شعبية',               'Traditional foods',        'traditional-foods',       4),
(54, 13, 'مخبوزات',                     'Bakery',                   'bakery',                  5),

(60, 14, 'تصوير منتجات',                'Product photography',      'product-photography',     1),
(61, 14, 'تصوير فيديو',                 'Video shooting',           'video-shooting',          2),
(62, 14, 'تصميم وطباعة',                'Design & printing',        'design-printing',         3),
(63, 14, 'مونتاج فيديو',                'Video editing',            'video-editing',           4),
(64, 14, 'تصوير جوي بدرون',             'Drone aerial shoots',      'drone-aerial',            5),

(70, 15, 'تسويق إلكتروني',              'Digital marketing',        'digital-marketing-svc',   1),
(71, 15, 'إدارة حسابات تواصل',          'Social media management',  'social-media-management', 2),
(72, 15, 'إعلانات ممولة',               'Paid ads',                 'paid-ads',                3),
(73, 15, 'تحسين محركات بحث',            'SEO',                      'seo',                     4),
(74, 15, 'تسويق مؤثرين',                'Influencer marketing',     'influencer-marketing',    5),

(80, 16, 'توصيل طلبات',                 'Parcel delivery',          'parcel-delivery',         1),
(81, 16, 'شحن داخلي',                   'Local shipping',           'local-shipping',          2),
(82, 16, 'شحن بين المدن',               'Intercity shipping',       'intercity-shipping',      3),
(83, 16, 'مندوب توصيل',                 'Delivery rep',             'delivery-rep',            4),

(90, 17, 'تأجير يومي',                  'Daily rental',             'daily-rental',            1),
(91, 17, 'شقق مفروشة',                  'Furnished apartments',     'furnished-apartments',    2),
(92, 17, 'شاليهات واستراحات',           'Chalets & resorts',        'chalets-resorts',         3),
(93, 17, 'إدارة عقارات',                'Property management',      'property-management',     4),

(100, 18, 'تشطيبات',                    'Finishing',                'finishing',               1),
(101, 18, 'نجارة',                      'Carpentry',                'carpentry',               2),
(102, 18, 'حدادة',                      'Welding',                  'welding',                 3),
(103, 18, 'جبس',                        'Gypsum work',              'gypsum-work',             4),
(104, 18, 'ترميمات',                    'Renovation',               'renovation',              5),

(110, 19, 'حلاقة',                      'Barbering',                'barbering',               1),
(111, 19, 'مكياج',                      'Makeup',                   'makeup',                  2),
(112, 19, 'عناية بالشعر',               'Hair care',                'hair-care',               3),
(113, 19, 'تجميل أظافر',                'Nail care',                'nail-care',               4),
(114, 19, 'سبا ومساج',                  'Spa & massage',            'spa-massage',             5),

(120, 20, 'تنظيم رحلات',                'Tour organisation',        'tour-organization',       1),
(121, 20, 'حجوزات فنادق',               'Hotel booking',            'hotel-booking',           2),
(122, 20, 'مرشد سياحي',                 'Tour guide',               'tour-guide',              3),
(123, 20, 'تأجير سيارات',               'Car rental',               'car-rental',              4),

(130, 21, 'استشارات إدارية',            'Management consulting',    'management-consulting',   1),
(131, 21, 'خدمات قانونية',              'Legal services',           'legal-services',          2),
(132, 21, 'خدمات محاسبية',              'Accounting',               'accounting',              3),
(133, 21, 'تأسيس شركات',                'Company formation',        'company-formation',       4),
(134, 21, 'دراسات جدوى',                'Feasibility studies',      'feasibility-studies',     5),

(140, 22, 'تمريض منزلي',                'Home nursing',             'home-nursing',            1),
(141, 22, 'رعاية كبار السن',            'Elderly care',             'elderly-care',            2),
(142, 22, 'جليسة أطفال',                'Babysitting',              'babysitting',             3),
(143, 22, 'علاج طبيعي',                 'Physical therapy',         'physical-therapy',        4),
(144, 22, 'تحاليل منزلية',              'Home lab tests',           'home-lab-tests',          5),

(150, 23, 'دورات احترافية',             'Professional courses',     'professional-courses',    1),
(151, 23, 'دورات لغة',                  'Language courses',         'language-courses',        2),
(152, 23, 'دورات تقنية',                'Tech courses',             'tech-courses',            3),
(153, 23, 'تدريب مهني',                 'Vocational training',      'vocational-training',     4),

(160, 24, 'تدريب شخصي',                 'Personal training',        'personal-training',       1),
(161, 24, 'تمارين جماعية',              'Group fitness',            'group-fitness',           2),
(162, 24, 'تدريب رياضي',                'Sports coaching',          'sports-coaching',         3),
(163, 24, 'تغذية وحمية',                'Nutrition & diet',         'nutrition-diet',          4),
(164, 24, 'يوغا وتأمل',                 'Yoga & meditation',        'yoga-meditation',         5),

(170, 25, 'كتابة بحوث',                 'Research writing',         'research-writing',        1),
(171, 25, 'ترجمة أكاديمية',             'Academic translation',     'academic-translation',    2),
(172, 25, 'تصميم عروض',                 'Presentation design',      'presentation-design',     3),
(173, 25, 'حل واجبات',                  'Homework help',            'homework-help',           4),

(180, 26, 'خياطة رجالية',               'Mens tailoring',           'mens-tailoring',          1),
(181, 26, 'خياطة نسائية',               'Womens tailoring',         'womens-tailoring',        2),
(182, 26, 'تعديل ملابس',                'Clothing alteration',      'clothing-alteration',     3),
(183, 26, 'خياطة ستائر',                'Curtain tailoring',        'curtain-tailoring',       4),

(190, 27, 'نقل ركاب',                   'Passenger transport',      'passenger-transport',     1),
(191, 27, 'تأجير حافلات',               'Bus rental',               'bus-rental',              2),
(192, 27, 'نقل مدرسي',                  'School transport',         'school-transport',        3) ON CONFLICT DO NOTHING;

INSERT INTO subscription_plans (id, name_ar, slug, description, price, duration_days, max_offers_per_month, is_featured, badge, features, sort_order) VALUES
(1, 'مجاني', 'free', 'الباقة المجانية للمبتدئين', 0.00, 30, 5, 0, NULL,
   jsonb_build_array('5 عروض شهرياً', 'ظهور عادي', 'دعم عبر البريد'), 1),
(2, 'مميز', 'premium', 'الباقة المميزة لزيادة الأعمال', 99.00, 30, 50, 1, 'مميز',
   jsonb_build_array('50 عرض شهرياً', 'إبراز في النتائج', 'شارة موثق', 'دعم سريع'), 2),
(3, 'احترافي', 'pro', 'الباقة الاحترافية للمحترفين', 199.00, 30, NULL, 1, 'احترافي',
   jsonb_build_array('عروض غير محدودة', 'ظهور في أعلى النتائج', 'شارة احترافي', 'إعلانات داخلية مجانية', 'دعم متميز 24/7'), 3) ON CONFLICT DO NOTHING;

INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description) VALUES
('site_name', 'RIZA', 'string', 'general', 1, 'اسم الموقع'),
('site_description', 'منصة الخدمات المحلية', 'string', 'general', 1, 'وصف الموقع'),
('site_logo', '', 'string', 'general', 1, 'شعار الموقع'),
('site_email', 'info@example.com', 'string', 'general', 1, 'البريد العام'),
('site_phone', '', 'string', 'general', 1, 'هاتف التواصل'),
('default_language', 'ar', 'string', 'general', 1, 'اللغة الافتراضية'),
('default_currency', 'SAR', 'string', 'general', 1, 'العملة الافتراضية'),
('map_provider', 'osm', 'string', 'map', 1, 'مزود الخرائط osm|google'),
('default_lat', '24.7136', 'string', 'map', 1, 'خط العرض الافتراضي'),
('default_lng', '46.6753', 'string', 'map', 1, 'خط الطول الافتراضي'),
('search_radius_km', '25', 'number', 'general', 1, 'نصف قطر البحث بالكيلومتر'),
('allow_registration', 'true', 'boolean', 'auth', 1, 'السماح بالتسجيل'),
('require_email_verification', 'false', 'boolean', 'auth', 0, 'يتطلب توثيق البريد'),
('require_provider_verification', 'true', 'boolean', 'auth', 1, 'يتطلب توثيق مقدمي الخدمة'),
('max_offers_per_request', '20', 'number', 'requests', 0, 'حد أقصى للعروض'),
('commission_percent', '10', 'number', 'payments', 0, 'نسبة العمولة %'),
('maintenance_mode', 'false', 'boolean', 'general', 1, 'وضع الصيانة') ON CONFLICT DO NOTHING;

INSERT INTO ads (id, title, description, placement, is_active) VALUES
(1, 'مرحباً بك في منصة الخدمات', 'اطلب أي خدمة محلية بسهولة وسرعة', 'home_top', 1) ON CONFLICT DO NOTHING;
