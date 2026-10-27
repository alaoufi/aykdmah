-- Fill missing native catalog labels for exact platform seed names only.
-- Includes every original base-seed, migration002, migration009 and launch record.
-- Existing labels, activation, category assignments and custom translations stay unchanged.

WITH labels(slug, name_ar, name_en, ur, hi, bn) AS (
  VALUES
  ('home-maintenance', 'صيانة منزلية', 'Home maintenance', 'گھر کی دیکھ بھال', 'घर की मरम्मत', 'বাড়ির মেরামত'),
  ('cleaning', 'نظافة', 'Cleaning', 'صفائی', 'सफ़ाई', 'পরিষ্কার'),
  ('moving', 'نقل وعفش', 'Moving', 'سامان کی منتقلی', 'सामान की ढुलाई', 'মালামাল স্থানান্তর'),
  ('electrical', 'كهرباء', 'Electrical', 'بجلی کا کام', 'बिजली का काम', 'বিদ্যুতের কাজ'),
  ('plumbing', 'سباكة', 'Plumbing', 'پلمبنگ', 'प्लंबिंग', 'প্লাম্বিং'),
  ('ac-cooling', 'تكييف وتبريد', 'AC & cooling', 'ایئر کنڈیشننگ اور کولنگ', 'एसी और कूलिंग', 'এসি ও কুলিং'),
  ('paint-decor', 'دهانات وديكور', 'Paint & décor', 'رنگ و سجاوٹ', 'पेंट और सजावट', 'রং ও সাজসজ্জা'),
  ('gardens', 'حدائق ومناظر', 'Gardens & landscaping', 'باغات اور زمین کی آرائش', 'बाग़ और भूदृश्य', 'বাগান ও ল্যান্ডস্কেপ'),
  ('education', 'تعليم وتدريس', 'Tutoring', 'ٹیوشن', 'ट्यूशन', 'প্রাইভেট পড়ানো'),
  ('cars', 'سيارات', 'Cars', 'گاڑیوں کی خدمات', 'कार सेवाएँ', 'গাড়ির সেবা'),
  ('tech', 'تقنية وكمبيوتر', 'Tech & computers', 'ٹیکنالوجی اور کمپیوٹر', 'तकनीक और कंप्यूटर', 'প্রযুক্তি ও কম্পিউটার'),
  ('events', 'مناسبات وضيافة', 'Events & catering', 'تقریبات اور کھانے کا انتظام', 'कार्यक्रम और खानपान', 'অনুষ্ঠান ও খাবার সরবরাহ'),
  ('home-businesses', 'الأسر المنتجة', 'Home businesses', 'گھریلو کاروبار', 'घरेलू व्यवसाय', 'ঘরোয়া ব্যবসা'),
  ('photography', 'التصوير والإبداع', 'Photography & creative', 'فوٹوگرافی اور تخلیقی خدمات', 'फ़ोटोग्राफ़ी और रचनात्मक सेवाएँ', 'ফটোগ্রাফি ও সৃজনশীল সেবা'),
  ('digital-marketing', 'التسويق الرقمي', 'Digital marketing', 'ڈیجیٹل مارکیٹنگ', 'डिजिटल मार्केटिंग', 'ডিজিটাল মার্কেটিং'),
  ('delivery', 'التوصيل والشحن', 'Delivery & shipping', 'ڈیلیوری اور شپنگ', 'डिलीवरी और शिपिंग', 'ডেলিভারি ও শিপিং'),
  ('real-estate', 'العقار والإيجار', 'Real estate & rentals', 'جائیداد اور کرایہ', 'संपत्ति और किराये की सेवाएँ', 'সম্পত্তি ও ভাড়া'),
  ('construction', 'المقاولات والإنشاءات', 'Construction & contracting', 'تعمیرات اور ٹھیکیداری', 'निर्माण और ठेकेदारी', 'নির্মাণ ও ঠিকাদারি'),
  ('personal-care', 'العناية الشخصية والتجميل', 'Personal care & beauty', 'ذاتی نگہداشت اور خوبصورتی', 'व्यक्तिगत देखभाल और सौंदर्य', 'ব্যক্তিগত যত্ন ও সৌন্দর্য'),
  ('travel-tours', 'السفر والرحلات', 'Travel & tours', 'سفر اور سیاحت', 'यात्रा और पर्यटन', 'ভ্রমণ ও পর্যটন'),
  ('business-services', 'خدمات الأعمال', 'Business services', 'کاروباری خدمات', 'व्यावसायिक सेवाएँ', 'ব্যবসায়িক সেবা'),
  ('home-health', 'الصحة المنزلية والرعاية', 'Home health & care', 'گھر پر صحت اور نگہداشت', 'घर पर स्वास्थ्य और देखभाल', 'বাড়িতে স্বাস্থ্যসেবা ও যত্ন'),
  ('training', 'التدريب والدورات', 'Training & courses', 'تربیت اور کورسز', 'प्रशिक्षण और पाठ्यक्रम', 'প্রশিক্ষণ ও কোর্স'),
  ('fitness', 'اللياقة والرياضة', 'Fitness & sports', 'فٹنس اور کھیل', 'फ़िटनेस और खेल', 'ফিটনেস ও খেলাধুলা'),
  ('student-services', 'خدمات الطلاب', 'Student services', 'طلبہ کی خدمات', 'छात्र सेवाएँ', 'শিক্ষার্থীদের সেবা'),
  ('tailoring', 'الخياطة والتفصيل', 'Tailoring & sewing', 'سلائی اور درزی کی خدمات', 'सिलाई और दर्ज़ी सेवाएँ', 'সেলাই ও দর্জির সেবা'),
  ('transport', 'النقل والمواصلات', 'Transport & mobility', 'آمد و رفت', 'परिवहन', 'যাতায়াত')
)
UPDATE categories AS item
SET name_translations = COALESCE(item.name_translations::jsonb, '{}'::jsonb)
  || COALESCE((SELECT jsonb_object_agg(translation.lang, translation.label)
    FROM (VALUES ('ur', labels.ur), ('hi', labels.hi), ('bn', labels.bn))
      AS translation(lang, label)
    WHERE NULLIF(btrim(item.name_translations::jsonb ->> translation.lang), '') IS NULL
  ), '{}'::jsonb)
FROM labels
WHERE item.slug = labels.slug
  AND item.name_ar = labels.name_ar
  AND item.name_en = labels.name_en
  AND (item.name_translations IS NULL OR jsonb_typeof(item.name_translations::jsonb) = 'object')
  AND (item.name_translations::jsonb ->> 'ar' IS NULL OR item.name_translations::jsonb ->> 'ar' = labels.name_ar)
  AND (item.name_translations::jsonb ->> 'en' IS NULL OR item.name_translations::jsonb ->> 'en' = labels.name_en)
  AND EXISTS (
    SELECT 1 FROM (VALUES ('ur'), ('hi'), ('bn')) AS missing(lang)
    WHERE NULLIF(btrim(item.name_translations::jsonb ->> missing.lang), '') IS NULL
  );

WITH labels(slug, name_ar, name_en, ur, hi, bn) AS (
  VALUES
  ('general-maintenance', 'صيانة عامة', 'General maintenance', 'عام مرمت', 'सामान्य मरम्मत', 'সাধারণ মেরামত'),
  ('furniture-installation', 'تركيب أثاث', 'Furniture installation', 'فرنیچر کی تنصیب', 'फ़र्नीचर लगाना', 'আসবাবপত্র স্থাপন'),
  ('doors-windows-repair', 'إصلاح أبواب ونوافذ', 'Door & window repair', 'دروازوں اور کھڑکیوں کی مرمت', 'दरवाज़े और खिड़की की मरम्मत', 'দরজা ও জানালা মেরামত'),
  ('home-cleaning', 'تنظيف منازل', 'Home cleaning', 'گھر کی صفائی', 'घर की सफ़ाई', 'বাড়ি পরিষ্কার'),
  ('tank-cleaning', 'تنظيف خزانات', 'Water tank cleaning', 'پانی کی ٹینکی کی صفائی', 'पानी की टंकी की सफ़ाई', 'পানির ট্যাংক পরিষ্কার'),
  ('ac-cleaning', 'تنظيف مكيفات', 'AC cleaning', 'ایئر کنڈیشنر کی صفائی', 'एसी की सफ़ाई', 'এসি পরিষ্কার'),
  ('pest-control', 'مكافحة حشرات', 'Pest control', 'کیڑوں کا خاتمہ', 'कीट नियंत्रण', 'কীটপতঙ্গ নিয়ন্ত্রণ'),
  ('moving-in-city', 'نقل عفش داخل المدينة', 'Moving in city', 'شہر کے اندر سامان کی منتقلی', 'शहर के अंदर सामान की ढुलाई', 'শহরের মধ্যে মালামাল স্থানান্তর'),
  ('moving-between-cities', 'نقل عفش بين المدن', 'Moving between cities', 'شہروں کے درمیان سامان کی منتقلی', 'शहरों के बीच सामान की ढुलाई', 'শহরের মধ্যে দূরপাল্লার মালামাল স্থানান্তর'),
  ('assembly', 'فك وتركيب أثاث', 'Furniture assembly', 'فرنیچر کھولنا اور جوڑنا', 'फ़र्नीचर खोलना और जोड़ना', 'আসবাবপত্র খোলা ও জোড়া লাগানো'),
  ('electrical-repair', 'إصلاح أعطال كهربائية', 'Electrical repair', 'بجلی کی خرابیوں کی مرمت', 'बिजली की ख़राबी की मरम्मत', 'বৈদ্যুতিক ত্রুটি মেরামত'),
  ('electrical-wiring', 'تمديدات كهربائية', 'Electrical wiring', 'بجلی کی وائرنگ', 'बिजली की वायरिंग', 'বৈদ্যুতিক তার লাগানো'),
  ('leak-repair', 'إصلاح تسربات', 'Leak repair', 'پانی کے رساؤ کی مرمت', 'पानी के रिसाव की मरम्मत', 'পানির লিক মেরামত'),
  ('drain-cleaning', 'تسليك مجاري', 'Drain cleaning', 'نالی کی صفائی', 'नाली की सफ़ाई', 'নালা পরিষ্কার'),
  ('split-ac-service', 'صيانة مكيفات سبليت', 'Split AC service', 'اسپلٹ اے سی کی مرمت', 'स्प्लिट एसी की सर्विस', 'স্প্লিট এসি সার্ভিস'),
  ('central-ac-service', 'صيانة مكيفات مركزية', 'Central AC service', 'سنٹرل اے سی کی مرمت', 'सेंट्रल एसी की सर्विस', 'সেন্ট্রাল এসি সার্ভিস'),
  ('home-painting', 'دهان منازل', 'Home painting', 'گھر کی رنگائی', 'घर की पुताई', 'বাড়ির রং করা'),
  ('wallpaper', 'ورق جدران', 'Wallpaper', 'وال پیپر', 'वॉलपेपर', 'ওয়ালপেপার'),
  ('garden-landscaping', 'تنسيق حدائق', 'Garden landscaping', 'باغ کی آرائش', 'बाग़ का भूदृश्य', 'বাগান সাজানো'),
  ('private-tutoring', 'تدريس خصوصي', 'Private tutoring', 'نجی ٹیوشن', 'निजी ट्यूशन', 'প্রাইভেট পড়ানো'),
  ('computer-repair', 'صيانة كمبيوتر', 'Computer repair', 'کمپیوٹر کی مرمت', 'कंप्यूटर की मरम्मत', 'কম্পিউটার মেরামত'),
  ('web-design', 'تصميم مواقع', 'Web design', 'ویب سائٹ ڈیزائن', 'वेबसाइट डिज़ाइन', 'ওয়েবসাইট ডিজাইন'),
  ('event-planning', 'تنظيم حفلات', 'Event planning', 'تقریبات کی منصوبہ بندی', 'कार्यक्रम की योजना', 'অনুষ্ঠান আয়োজন'),
  ('curtain-installation', 'تركيب ستائر', 'Curtain installation', 'پردوں کی تنصیب', 'परदे लगाना', 'পর্দা লাগানো'),
  ('carpet-cleaning', 'غسيل سجاد', 'Carpet cleaning', 'قالین کی صفائی', 'कालीन की सफ़ाई', 'কার্পেট পরিষ্কার'),
  ('lighting-installation', 'تركيب إنارة', 'Lighting installation', 'روشنیوں کی تنصیب', 'बत्तियाँ लगाना', 'বাতি লাগানো'),
  ('heater-installation', 'تركيب سخانات', 'Heater installation', 'پانی کے ہیٹر کی تنصیب', 'पानी का हीटर लगाना', 'পানির হিটার লাগানো'),
  ('ac-installation', 'تركيب مكيفات', 'AC installation', 'ایئر کنڈیشنر کی تنصیب', 'एसी लगाना', 'এসি লাগানো'),
  ('gypsum-decor', 'ديكور جبس', 'Gypsum decor', 'جپسم کی سجاوٹ', 'जिप्सम की सजावट', 'জিপসামের সাজসজ্জা'),
  ('lawn-care', 'العناية بالعشب', 'Lawn care', 'لان کی دیکھ بھال', 'लॉन की देखभाल', 'লনের যত্ন'),
  ('quran-teaching', 'تحفيظ قرآن', 'Quran teaching', 'قرآن کی تعلیم', 'क़ुरआन की शिक्षा', 'কুরআন শিক্ষা'),
  ('language-tutoring', 'تدريس لغات', 'Language tutoring', 'زبانوں کی تعلیم', 'भाषाओं की शिक्षा', 'ভাষা শিক্ষা'),
  ('car-wash', 'غسيل سيارات', 'Car wash', 'گاڑی کی دھلائی', 'कार की धुलाई', 'গাড়ি ধোয়া'),
  ('car-polish', 'تلميع سيارات', 'Car polishing', 'گاڑی کی پالش', 'कार की पॉलिश', 'গাড়ি পালিশ'),
  ('oil-change', 'تغيير زيت', 'Oil change', 'انجن کا تیل تبدیل کرنا', 'इंजन का तेल बदलना', 'ইঞ্জিনের তেল বদলানো'),
  ('mobile-mechanic', 'ميكانيكا متنقلة', 'Mobile mechanic', 'موقع پر گاڑی کا مکینک', 'आपके पास आने वाला मैकेनिक', 'আপনার কাছে আসা মেকানিক'),
  ('tech-support', 'دعم تقني', 'Tech support', 'تکنیکی معاونت', 'तकनीकी सहायता', 'প্রযুক্তিগত সহায়তা'),
  ('network-installation', 'تركيب شبكات', 'Network installation', 'نیٹ ورک کی تنصیب', 'नेटवर्क लगाना', 'নেটওয়ার্ক স্থাপন'),
  ('camera-installation', 'تركيب كاميرات', 'Camera installation', 'کیمروں کی تنصیب', 'कैमरे लगाना', 'ক্যামেরা লাগানো'),
  ('app-development', 'تطوير تطبيقات', 'App development', 'ایپ کی تیاری', 'ऐप बनाना', 'অ্যাপ তৈরি'),
  ('wedding-stage', 'كوش وأفراح', 'Wedding stages', 'شادی کے اسٹیج کی سجاوٹ', 'शादी का मंच सजाना', 'বিয়ের মঞ্চ সাজানো'),
  ('event-photography', 'تصوير مناسبات', 'Event photography', 'تقریبات کی فوٹوگرافی', 'कार्यक्रम की फ़ोटोग्राफ़ी', 'অনুষ্ঠানের ফটোগ্রাফি'),
  ('chairs-tables-rental', 'تأجير كراسي وطاولات', 'Chair & table rental', 'کرسیوں اور میزوں کا کرایہ', 'कुर्सियाँ और मेज़ किराये पर देना', 'চেয়ার ও টেবিল ভাড়া'),
  ('home-cooking', 'طبخ منزلي', 'Home cooking', 'گھر کا کھانا', 'घर का खाना', 'ঘরোয়া রান্না'),
  ('coffee-sweets', 'قهوة وحلويات', 'Coffee & sweets', 'کافی اور مٹھائیاں', 'कॉफ़ी और मिठाइयाँ', 'কফি ও মিষ্টি'),
  ('catering-meat', 'ذبائح وولائم', 'Catering meat & feasts', 'گوشت اور دعوت کا انتظام', 'मांस और दावत का खानपान', 'মাংস ও ভোজের খাবার সরবরাহ'),
  ('traditional-foods', 'مأكولات شعبية', 'Traditional foods', 'روایتی کھانے', 'पारंपरिक भोजन', 'ঐতিহ্যবাহী খাবার'),
  ('bakery', 'مخبوزات', 'Bakery', 'بیکری', 'बेकरी', 'বেকারি'),
  ('product-photography', 'تصوير منتجات', 'Product photography', 'مصنوعات کی فوٹوگرافی', 'उत्पाद फ़ोटोग्राफ़ी', 'পণ্যের ফটোগ্রাফি'),
  ('video-shooting', 'تصوير فيديو', 'Video shooting', 'ویڈیو شوٹنگ', 'वीडियो शूटिंग', 'ভিডিও ধারণ'),
  ('design-printing', 'تصميم وطباعة', 'Design & printing', 'ڈیزائن اور طباعت', 'डिज़ाइन और प्रिंटिंग', 'ডিজাইন ও মুদ্রণ'),
  ('video-editing', 'مونتاج فيديو', 'Video editing', 'ویڈیو ایڈیٹنگ', 'वीडियो संपादन', 'ভিডিও সম্পাদনা'),
  ('drone-aerial', 'تصوير جوي بدرون', 'Drone aerial shoots', 'ڈرون سے فضائی عکس بندی', 'ड्रोन से हवाई फ़ोटोग्राफ़ी', 'ড্রোন দিয়ে আকাশ থেকে ছবি তোলা'),
  ('digital-marketing-svc', 'تسويق إلكتروني', 'Digital marketing', 'ڈیجیٹل مارکیٹنگ', 'डिजिटल मार्केटिंग', 'ডিজিটাল মার্কেটিং'),
  ('social-media-management', 'إدارة حسابات تواصل', 'Social media management', 'سوشل میڈیا اکاؤنٹس کا انتظام', 'सोशल मीडिया खाते प्रबंधन', 'সামাজিক মাধ্যম অ্যাকাউন্ট পরিচালনা'),
  ('paid-ads', 'إعلانات ممولة', 'Paid ads', 'معاوضے کے اشتہارات', 'सशुल्क विज्ञापन', 'অর্থপ্রদত্ত বিজ্ঞাপন'),
  ('seo', 'تحسين محركات بحث', 'SEO', 'سرچ انجن کی بہتری', 'खोज इंजन अनुकूलन', 'সার্চ ইঞ্জিন অপ্টিমাইজেশন'),
  ('influencer-marketing', 'تسويق مؤثرين', 'Influencer marketing', 'انفلوئنسر مارکیٹنگ', 'प्रभावशाली व्यक्तियों से प्रचार', 'ইনফ্লুয়েন্সার মার্কেটিং'),
  ('parcel-delivery', 'توصيل طلبات', 'Parcel delivery', 'پارسل کی ترسیل', 'पार्सल डिलीवरी', 'পার্সেল পৌঁছে দেওয়া'),
  ('local-shipping', 'شحن داخلي', 'Local shipping', 'ملک کے اندر شپنگ', 'देश के अंदर शिपिंग', 'দেশের মধ্যে শিপিং'),
  ('intercity-shipping', 'شحن بين المدن', 'Intercity shipping', 'شہروں کے درمیان شپنگ', 'शहरों के बीच शिपिंग', 'শহরের মধ্যে দূরপাল্লার শিপিং'),
  ('delivery-rep', 'مندوب توصيل', 'Delivery rep', 'ڈیلیوری کا نمائندہ', 'डिलीवरी प्रतिनिधि', 'ডেলিভারি প্রতিনিধি'),
  ('daily-rental', 'تأجير يومي', 'Daily rental', 'روزانہ کرایہ', 'दैनिक किराया', 'দৈনিক ভাড়া'),
  ('furnished-apartments', 'شقق مفروشة', 'Furnished apartments', 'فرنیچر والے اپارٹمنٹس', 'सुसज्जित अपार्टमेंट', 'সজ্জিত অ্যাপার্টমেন্ট'),
  ('chalets-resorts', 'شاليهات واستراحات', 'Chalets & resorts', 'شالے اور ریزورٹس', 'शैले और रिसॉर्ट', 'শালে ও রিসোর্ট'),
  ('property-management', 'إدارة عقارات', 'Property management', 'جائیداد کا انتظام', 'संपत्ति प्रबंधन', 'সম্পত্তি পরিচালনা'),
  ('finishing', 'تشطيبات', 'Finishing', 'تعمیر کے آخری کام', 'निर्माण का अंतिम काम', 'নির্মাণের শেষ পর্যায়ের কাজ'),
  ('carpentry', 'نجارة', 'Carpentry', 'بڑھئی کا کام', 'बढ़ई का काम', 'কাঠের কাজ'),
  ('welding', 'حدادة', 'Welding', 'ویلڈنگ', 'वेल्डिंग', 'ওয়েল্ডিং'),
  ('gypsum-work', 'جبس', 'Gypsum work', 'جپسم کا کام', 'जिप्सम का काम', 'জিপসামের কাজ'),
  ('renovation', 'ترميمات', 'Renovation', 'عمارت کی مرمت اور تجدید', 'भवन की मरम्मत और नवीनीकरण', 'ভবন মেরামত ও সংস্কার'),
  ('barbering', 'حلاقة', 'Barbering', 'حجامت', 'बाल काटना', 'চুল কাটা'),
  ('makeup', 'مكياج', 'Makeup', 'میک اپ', 'मेकअप', 'মেকআপ'),
  ('hair-care', 'عناية بالشعر', 'Hair care', 'بالوں کی دیکھ بھال', 'बालों की देखभाल', 'চুলের যত্ন'),
  ('nail-care', 'تجميل أظافر', 'Nail care', 'ناخنوں کی دیکھ بھال', 'नाख़ूनों की देखभाल', 'নখের যত্ন'),
  ('spa-massage', 'سبا ومساج', 'Spa & massage', 'اسپا اور مالش', 'स्पा और मालिश', 'স্পা ও ম্যাসাজ'),
  ('tour-organization', 'تنظيم رحلات', 'Tour organisation', 'سیاحتی دوروں کا انتظام', 'यात्रा आयोजन', 'ভ্রমণ আয়োজন'),
  ('hotel-booking', 'حجوزات فنادق', 'Hotel booking', 'ہوٹل کی بکنگ', 'होटल बुकिंग', 'হোটেল বুকিং'),
  ('tour-guide', 'مرشد سياحي', 'Tour guide', 'سیاحتی رہنما', 'पर्यटन गाइड', 'পর্যটন গাইড'),
  ('car-rental', 'تأجير سيارات', 'Car rental', 'گاڑی کرائے پر دینا', 'कार किराये पर लेना', 'গাড়ি ভাড়া'),
  ('management-consulting', 'استشارات إدارية', 'Management consulting', 'انتظامی مشاورت', 'प्रबंधन परामर्श', 'ব্যবস্থাপনা পরামর্শ'),
  ('legal-services', 'خدمات قانونية', 'Legal services', 'قانونی خدمات', 'कानूनी सेवाएँ', 'আইনি সেবা'),
  ('accounting', 'خدمات محاسبية', 'Accounting', 'حساب کتاب', 'लेखांकन', 'হিসাবরক্ষণ'),
  ('company-formation', 'تأسيس شركات', 'Company formation', 'کمپنی کی تشکیل', 'कंपनी की स्थापना', 'কোম্পানি প্রতিষ্ঠা'),
  ('feasibility-studies', 'دراسات جدوى', 'Feasibility studies', 'منصوبے کی عملی جانچ', 'परियोजना की व्यवहार्यता का अध्ययन', 'প্রকল্পের সম্ভাব্যতা যাচাই'),
  ('home-nursing', 'تمريض منزلي', 'Home nursing', 'گھر پر نرسنگ', 'घर पर नर्सिंग', 'বাড়িতে নার্সিং'),
  ('elderly-care', 'رعاية كبار السن', 'Elderly care', 'بزرگوں کی نگہداشت', 'बुज़ुर्गों की देखभाल', 'বয়স্কদের যত্ন'),
  ('babysitting', 'جليسة أطفال', 'Babysitting', 'بچوں کی دیکھ بھال', 'बच्चों की देखभाल', 'শিশুদের যত্ন'),
  ('physical-therapy', 'علاج طبيعي', 'Physical therapy', 'فزیوتھراپی', 'फ़िज़ियोथेरेपी', 'ফিজিওথেরাপি'),
  ('home-lab-tests', 'تحاليل منزلية', 'Home lab tests', 'گھر پر لیبارٹری ٹیسٹ', 'घर पर लैब जाँच', 'বাড়িতে ল্যাব পরীক্ষা'),
  ('professional-courses', 'دورات احترافية', 'Professional courses', 'پیشہ ورانہ کورسز', 'पेशेवर पाठ्यक्रम', 'পেশাগত কোর্স'),
  ('language-courses', 'دورات لغة', 'Language courses', 'زبان کے کورسز', 'भाषा पाठ्यक्रम', 'ভাষা কোর্স'),
  ('tech-courses', 'دورات تقنية', 'Tech courses', 'تکنیکی کورسز', 'तकनीकी पाठ्यक्रम', 'প্রযুক্তিগত কোর্স'),
  ('vocational-training', 'تدريب مهني', 'Vocational training', 'پیشہ ورانہ تربیت', 'व्यावसायिक प्रशिक्षण', 'পেশাগত প্রশিক্ষণ'),
  ('personal-training', 'تدريب شخصي', 'Personal training', 'ذاتی فٹنس تربیت', 'व्यक्तिगत फ़िटनेस प्रशिक्षण', 'ব্যক্তিগত ফিটনেস প্রশিক্ষণ'),
  ('group-fitness', 'تمارين جماعية', 'Group fitness', 'گروپ ورزش', 'समूह व्यायाम', 'দলগত ব্যায়াম'),
  ('sports-coaching', 'تدريب رياضي', 'Sports coaching', 'کھیلوں کی تربیت', 'खेल प्रशिक्षण', 'খেলাধুলার প্রশিক্ষণ'),
  ('nutrition-diet', 'تغذية وحمية', 'Nutrition & diet', 'غذائیت اور خوراک', 'पोषण और आहार', 'পুষ্টি ও খাদ্য'),
  ('yoga-meditation', 'يوغا وتأمل', 'Yoga & meditation', 'یوگا اور مراقبہ', 'योग और ध्यान', 'যোগ ও ধ্যান'),
  ('research-writing', 'كتابة بحوث', 'Research writing', 'تحقیقی تحریر', 'शोध लेखन', 'গবেষণা লেখা'),
  ('academic-translation', 'ترجمة أكاديمية', 'Academic translation', 'تعلیمی ترجمہ', 'शैक्षणिक अनुवाद', 'একাডেমিক অনুবাদ'),
  ('presentation-design', 'تصميم عروض', 'Presentation design', 'پریزنٹیشن کا ڈیزائن', 'प्रस्तुति डिज़ाइन', 'উপস্থাপনা ডিজাইন'),
  ('homework-help', 'حل واجبات', 'Homework help', 'ہوم ورک میں مدد', 'गृहकार्य में मदद', 'বাড়ির পড়ায় সাহায্য'),
  ('mens-tailoring', 'خياطة رجالية', 'Mens tailoring', 'مردانہ سلائی', 'पुरुषों की सिलाई', 'পুরুষদের পোশাক সেলাই'),
  ('womens-tailoring', 'خياطة نسائية', 'Womens tailoring', 'زنانہ سلائی', 'महिलाओं की सिलाई', 'নারীদের পোশাক সেলাই'),
  ('clothing-alteration', 'تعديل ملابس', 'Clothing alteration', 'کپڑوں کی ترمیم', 'कपड़ों में बदलाव', 'পোশাকের মাপ ঠিক করা'),
  ('curtain-tailoring', 'خياطة ستائر', 'Curtain tailoring', 'پردوں کی سلائی', 'परदों की सिलाई', 'পর্দা সেলাই'),
  ('passenger-transport', 'نقل ركاب', 'Passenger transport', 'مسافروں کی نقل و حمل', 'यात्री परिवहन', 'যাত্রী পরিবহন'),
  ('bus-rental', 'تأجير حافلات', 'Bus rental', 'بس کرایہ', 'बस किराया', 'বাস ভাড়া'),
  ('school-transport', 'نقل مدرسي', 'School transport', 'اسکول کی آمد و رفت', 'स्कूल परिवहन', 'স্কুলে যাতায়াত'),
  ('ayk-yard-cleaning', 'غسيل الأحواش', 'Yard cleaning', 'صحن کی صفائی', 'आँगन की सफ़ाई', 'উঠান পরিষ্কার')
)
UPDATE services AS item
SET name_translations = COALESCE(item.name_translations::jsonb, '{}'::jsonb)
  || COALESCE((SELECT jsonb_object_agg(translation.lang, translation.label)
    FROM (VALUES ('ur', labels.ur), ('hi', labels.hi), ('bn', labels.bn))
      AS translation(lang, label)
    WHERE NULLIF(btrim(item.name_translations::jsonb ->> translation.lang), '') IS NULL
  ), '{}'::jsonb)
FROM labels
WHERE item.slug = labels.slug
  AND item.name_ar = labels.name_ar
  AND item.name_en = labels.name_en
  AND (item.name_translations IS NULL OR jsonb_typeof(item.name_translations::jsonb) = 'object')
  AND (item.name_translations::jsonb ->> 'ar' IS NULL OR item.name_translations::jsonb ->> 'ar' = labels.name_ar)
  AND (item.name_translations::jsonb ->> 'en' IS NULL OR item.name_translations::jsonb ->> 'en' = labels.name_en)
  AND EXISTS (
    SELECT 1 FROM (VALUES ('ur'), ('hi'), ('bn')) AS missing(lang)
    WHERE NULLIF(btrim(item.name_translations::jsonb ->> missing.lang), '') IS NULL
  );
