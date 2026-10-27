-- -----------------------------------------------------
-- Migration 002: extend categories and services
-- Adds 15 new top-level categories popular in the Saudi/Gulf market
-- plus matching sub-services. Existing IDs (1-23) are preserved.
-- Safe to run on a previously seeded DB (INSERT IGNORE).
-- -----------------------------------------------------

-- Fill missing names/icons without replacing administrative edits.
UPDATE categories SET name_en = 'Home maintenance' WHERE slug = 'home-maintenance' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE categories SET icon = '🔧' WHERE slug = 'home-maintenance' AND (icon IS NULL OR trim(icon) = '');
UPDATE categories SET name_en = 'Cleaning' WHERE slug = 'cleaning' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE categories SET icon = '✨' WHERE slug = 'cleaning' AND (icon IS NULL OR trim(icon) = '');
UPDATE categories SET name_en = 'Moving' WHERE slug = 'moving' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE categories SET icon = '🚚' WHERE slug = 'moving' AND (icon IS NULL OR trim(icon) = '');
UPDATE categories SET name_en = 'Electrical' WHERE slug = 'electrical' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE categories SET icon = '⚡' WHERE slug = 'electrical' AND (icon IS NULL OR trim(icon) = '');
UPDATE categories SET name_en = 'Plumbing' WHERE slug = 'plumbing' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE categories SET icon = '💧' WHERE slug = 'plumbing' AND (icon IS NULL OR trim(icon) = '');
UPDATE categories SET name_en = 'AC & cooling' WHERE slug = 'ac-cooling' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE categories SET icon = '❄️' WHERE slug = 'ac-cooling' AND (icon IS NULL OR trim(icon) = '');
UPDATE categories SET name_en = 'Paint & décor' WHERE slug = 'paint-decor' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE categories SET icon = '🎨' WHERE slug = 'paint-decor' AND (icon IS NULL OR trim(icon) = '');
UPDATE categories SET name_en = 'Gardens & landscaping' WHERE slug = 'gardens' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE categories SET icon = '🌿' WHERE slug = 'gardens' AND (icon IS NULL OR trim(icon) = '');
UPDATE categories SET name_en = 'Tutoring' WHERE slug = 'education' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE categories SET icon = '📚' WHERE slug = 'education' AND (icon IS NULL OR trim(icon) = '');
UPDATE categories SET name_en = 'Cars' WHERE slug = 'cars' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE categories SET icon = '🚗' WHERE slug = 'cars' AND (icon IS NULL OR trim(icon) = '');
UPDATE categories SET name_en = 'Tech & computers' WHERE slug = 'tech' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE categories SET icon = '💻' WHERE slug = 'tech' AND (icon IS NULL OR trim(icon) = '');
UPDATE categories SET name_en = 'Events & catering' WHERE slug = 'events' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE categories SET icon = '🎉' WHERE slug = 'events' AND (icon IS NULL OR trim(icon) = '');

-- New main categories
INSERT IGNORE INTO categories (id, name_ar, name_en, slug, icon, color, sort_order) VALUES
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
(27, 'النقل والمواصلات',            'Transport & mobility',      'transport',         '🚐', '#eab308', 27);

-- Fill missing English names without replacing administrative edits.
UPDATE services SET name_en = 'General maintenance' WHERE slug = 'general-maintenance' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'Furniture installation' WHERE slug = 'furniture-installation' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'Door & window repair' WHERE slug = 'doors-windows-repair' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'Home cleaning' WHERE slug = 'home-cleaning' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'Water tank cleaning' WHERE slug = 'tank-cleaning' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'AC cleaning' WHERE slug = 'ac-cleaning' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'Pest control' WHERE slug = 'pest-control' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'Moving in city' WHERE slug = 'moving-in-city' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'Moving between cities' WHERE slug = 'moving-between-cities' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'Furniture assembly' WHERE slug = 'assembly' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'Electrical repair' WHERE slug = 'electrical-repair' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'Electrical wiring' WHERE slug = 'electrical-wiring' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'Leak repair' WHERE slug = 'leak-repair' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'Drain cleaning' WHERE slug = 'drain-cleaning' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'Split AC service' WHERE slug = 'split-ac-service' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'Central AC service' WHERE slug = 'central-ac-service' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'Home painting' WHERE slug = 'home-painting' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'Wallpaper' WHERE slug = 'wallpaper' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'Garden landscaping' WHERE slug = 'garden-landscaping' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'Private tutoring' WHERE slug = 'private-tutoring' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'Computer repair' WHERE slug = 'computer-repair' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'Web design' WHERE slug = 'web-design' AND (name_en IS NULL OR trim(name_en) = '');
UPDATE services SET name_en = 'Event planning' WHERE slug = 'event-planning' AND (name_en IS NULL OR trim(name_en) = '');

-- New sub-services for existing and new categories
INSERT IGNORE INTO services (id, category_id, name_ar, name_en, slug, sort_order) VALUES
-- Extending existing categories
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
-- Home businesses (13)
(50, 13, 'طبخ منزلي',                   'Home cooking',             'home-cooking',            1),
(51, 13, 'قهوة وحلويات',                'Coffee & sweets',          'coffee-sweets',           2),
(52, 13, 'ذبائح وولائم',                'Catering meat & feasts',   'catering-meat',           3),
(53, 13, 'مأكولات شعبية',               'Traditional foods',        'traditional-foods',       4),
(54, 13, 'مخبوزات',                     'Bakery',                   'bakery',                  5),
-- Photography (14)
(60, 14, 'تصوير منتجات',                'Product photography',      'product-photography',     1),
(61, 14, 'تصوير فيديو',                 'Video shooting',           'video-shooting',          2),
(62, 14, 'تصميم وطباعة',                'Design & printing',        'design-printing',         3),
(63, 14, 'مونتاج فيديو',                'Video editing',            'video-editing',           4),
(64, 14, 'تصوير جوي بدرون',             'Drone aerial shoots',      'drone-aerial',            5),
-- Digital marketing (15)
(70, 15, 'تسويق إلكتروني',              'Digital marketing',        'digital-marketing-svc',   1),
(71, 15, 'إدارة حسابات تواصل',          'Social media management',  'social-media-management', 2),
(72, 15, 'إعلانات ممولة',               'Paid ads',                 'paid-ads',                3),
(73, 15, 'تحسين محركات بحث',            'SEO',                      'seo',                     4),
(74, 15, 'تسويق مؤثرين',                'Influencer marketing',     'influencer-marketing',    5),
-- Delivery (16)
(80, 16, 'توصيل طلبات',                 'Parcel delivery',          'parcel-delivery',         1),
(81, 16, 'شحن داخلي',                   'Local shipping',           'local-shipping',          2),
(82, 16, 'شحن بين المدن',               'Intercity shipping',       'intercity-shipping',      3),
(83, 16, 'مندوب توصيل',                 'Delivery rep',             'delivery-rep',            4),
-- Real estate (17)
(90, 17, 'تأجير يومي',                  'Daily rental',             'daily-rental',            1),
(91, 17, 'شقق مفروشة',                  'Furnished apartments',     'furnished-apartments',    2),
(92, 17, 'شاليهات واستراحات',           'Chalets & resorts',        'chalets-resorts',         3),
(93, 17, 'إدارة عقارات',                'Property management',      'property-management',     4),
-- Construction (18)
(100, 18, 'تشطيبات',                    'Finishing',                'finishing',               1),
(101, 18, 'نجارة',                      'Carpentry',                'carpentry',               2),
(102, 18, 'حدادة',                      'Welding',                  'welding',                 3),
(103, 18, 'جبس',                        'Gypsum work',              'gypsum-work',             4),
(104, 18, 'ترميمات',                    'Renovation',               'renovation',              5),
-- Personal care (19)
(110, 19, 'حلاقة',                      'Barbering',                'barbering',               1),
(111, 19, 'مكياج',                      'Makeup',                   'makeup',                  2),
(112, 19, 'عناية بالشعر',               'Hair care',                'hair-care',               3),
(113, 19, 'تجميل أظافر',                'Nail care',                'nail-care',               4),
(114, 19, 'سبا ومساج',                  'Spa & massage',            'spa-massage',             5),
-- Travel & tours (20)
(120, 20, 'تنظيم رحلات',                'Tour organisation',        'tour-organization',       1),
(121, 20, 'حجوزات فنادق',               'Hotel booking',            'hotel-booking',           2),
(122, 20, 'مرشد سياحي',                 'Tour guide',               'tour-guide',              3),
(123, 20, 'تأجير سيارات',               'Car rental',               'car-rental',              4),
-- Business services (21)
(130, 21, 'استشارات إدارية',            'Management consulting',    'management-consulting',   1),
(131, 21, 'خدمات قانونية',              'Legal services',           'legal-services',          2),
(132, 21, 'خدمات محاسبية',              'Accounting',               'accounting',              3),
(133, 21, 'تأسيس شركات',                'Company formation',        'company-formation',       4),
(134, 21, 'دراسات جدوى',                'Feasibility studies',      'feasibility-studies',     5),
-- Home health (22)
(140, 22, 'تمريض منزلي',                'Home nursing',             'home-nursing',            1),
(141, 22, 'رعاية كبار السن',            'Elderly care',             'elderly-care',            2),
(142, 22, 'جليسة أطفال',                'Babysitting',              'babysitting',             3),
(143, 22, 'علاج طبيعي',                 'Physical therapy',         'physical-therapy',        4),
(144, 22, 'تحاليل منزلية',              'Home lab tests',           'home-lab-tests',          5),
-- Training (23)
(150, 23, 'دورات احترافية',             'Professional courses',     'professional-courses',    1),
(151, 23, 'دورات لغة',                  'Language courses',         'language-courses',        2),
(152, 23, 'دورات تقنية',                'Tech courses',             'tech-courses',            3),
(153, 23, 'تدريب مهني',                 'Vocational training',      'vocational-training',     4),
-- Fitness (24)
(160, 24, 'تدريب شخصي',                 'Personal training',        'personal-training',       1),
(161, 24, 'تمارين جماعية',              'Group fitness',            'group-fitness',           2),
(162, 24, 'تدريب رياضي',                'Sports coaching',          'sports-coaching',         3),
(163, 24, 'تغذية وحمية',                'Nutrition & diet',         'nutrition-diet',          4),
(164, 24, 'يوغا وتأمل',                 'Yoga & meditation',        'yoga-meditation',         5),
-- Student services (25)
(170, 25, 'كتابة بحوث',                 'Research writing',         'research-writing',        1),
(171, 25, 'ترجمة أكاديمية',             'Academic translation',     'academic-translation',    2),
(172, 25, 'تصميم عروض',                 'Presentation design',      'presentation-design',     3),
(173, 25, 'حل واجبات',                  'Homework help',            'homework-help',           4),
-- Tailoring (26)
(180, 26, 'خياطة رجالية',               'Mens tailoring',           'mens-tailoring',          1),
(181, 26, 'خياطة نسائية',               'Womens tailoring',         'womens-tailoring',        2),
(182, 26, 'تعديل ملابس',                'Clothing alteration',      'clothing-alteration',     3),
(183, 26, 'خياطة ستائر',                'Curtain tailoring',        'curtain-tailoring',       4),
-- Transport (27)
(190, 27, 'نقل ركاب',                   'Passenger transport',      'passenger-transport',     1),
(191, 27, 'تأجير حافلات',               'Bus rental',               'bus-rental',              2),
(192, 27, 'نقل مدرسي',                  'School transport',         'school-transport',        3);
