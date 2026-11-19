-- Auto-generated from database/migrations/092_catalog_names_review.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'

UPDATE categories SET name_translations = jsonb_set(name_translations::jsonb, '{bn}', to_jsonb('পরিচ্ছন্নতা'::text))
  WHERE slug = 'cleaning' AND name_translations::jsonb ->> 'bn' = 'পরিষ্কার';
UPDATE categories SET name_translations = jsonb_set(name_translations::jsonb, '{ur}', to_jsonb('باغبانی اور لینڈ اسکیپنگ'::text))
  WHERE slug = 'gardens' AND name_translations::jsonb ->> 'ur' = 'باغات اور زمین کی آرائش';
UPDATE categories SET name_translations = jsonb_set(name_translations::jsonb, '{hi}', to_jsonb('बाग़बानी और लैंडस्केपिंग'::text))
  WHERE slug = 'gardens' AND name_translations::jsonb ->> 'hi' = 'बाग़ और भूदृश्य';
UPDATE categories SET name_translations = jsonb_set(name_translations::jsonb, '{ur}', to_jsonb('تعلیم اور ٹیوشن'::text))
  WHERE slug = 'education' AND name_translations::jsonb ->> 'ur' = 'ٹیوشن';
UPDATE categories SET name_translations = jsonb_set(name_translations::jsonb, '{hi}', to_jsonb('शिक्षा और ट्यूशन'::text))
  WHERE slug = 'education' AND name_translations::jsonb ->> 'hi' = 'ट्यूशन';
UPDATE categories SET name_translations = jsonb_set(name_translations::jsonb, '{bn}', to_jsonb('শিক্ষা ও টিউশন'::text))
  WHERE slug = 'education' AND name_translations::jsonb ->> 'bn' = 'প্রাইভেট পড়ানো';
UPDATE services SET name_translations = jsonb_set(name_translations::jsonb, '{bn}', to_jsonb('শহরের ভেতরে মালামাল স্থানান্তর'::text))
  WHERE slug = 'moving-in-city' AND name_translations::jsonb ->> 'bn' = 'শহরের মধ্যে মালামাল স্থানান্তর';
UPDATE services SET name_translations = jsonb_set(name_translations::jsonb, '{bn}', to_jsonb('আন্তঃশহর মালামাল স্থানান্তর'::text))
  WHERE slug = 'moving-between-cities' AND name_translations::jsonb ->> 'bn' = 'শহরের মধ্যে দূরপাল্লার মালামাল স্থানান্তর';
UPDATE services SET name_translations = jsonb_set(name_translations::jsonb, '{hi}', to_jsonb('बग़ीचे की लैंडस्केपिंग'::text))
  WHERE slug = 'garden-landscaping' AND name_translations::jsonb ->> 'hi' = 'बाग़ का भूदृश्य';
UPDATE services SET name_translations = jsonb_set(name_translations::jsonb, '{ur}', to_jsonb('حفظِ قرآن'::text))
  WHERE slug = 'quran-teaching' AND name_translations::jsonb ->> 'ur' = 'قرآن کی تعلیم';
UPDATE services SET name_translations = jsonb_set(name_translations::jsonb, '{hi}', to_jsonb('क़ुरआन हिफ़्ज़'::text))
  WHERE slug = 'quran-teaching' AND name_translations::jsonb ->> 'hi' = 'क़ुरआन की शिक्षा';
UPDATE services SET name_translations = jsonb_set(name_translations::jsonb, '{bn}', to_jsonb('কুরআন হিফজ'::text))
  WHERE slug = 'quran-teaching' AND name_translations::jsonb ->> 'bn' = 'কুরআন শিক্ষা';
UPDATE services SET name_translations = jsonb_set(name_translations::jsonb, '{ur}', to_jsonb('سپانسرڈ اشتہارات'::text))
  WHERE slug = 'paid-ads' AND name_translations::jsonb ->> 'ur' = 'معاوضے کے اشتہارات';
UPDATE services SET name_translations = jsonb_set(name_translations::jsonb, '{hi}', to_jsonb('इन्फ़्लुएंसर मार्केटिंग'::text))
  WHERE slug = 'influencer-marketing' AND name_translations::jsonb ->> 'hi' = 'प्रभावशाली व्यक्तियों से प्रचार';
UPDATE services SET name_translations = jsonb_set(name_translations::jsonb, '{ur}', to_jsonb('آرڈرز کی ترسیل'::text))
  WHERE slug = 'parcel-delivery' AND name_translations::jsonb ->> 'ur' = 'پارسل کی ترسیل';
UPDATE services SET name_translations = jsonb_set(name_translations::jsonb, '{hi}', to_jsonb('ऑर्डर डिलीवरी'::text))
  WHERE slug = 'parcel-delivery' AND name_translations::jsonb ->> 'hi' = 'पार्सल डिलीवरी';
UPDATE services SET name_translations = jsonb_set(name_translations::jsonb, '{bn}', to_jsonb('অর্ডার ডেলিভারি'::text))
  WHERE slug = 'parcel-delivery' AND name_translations::jsonb ->> 'bn' = 'পার্সেল পৌঁছে দেওয়া';
UPDATE services SET name_translations = jsonb_set(name_translations::jsonb, '{bn}', to_jsonb('আন্তঃশহর শিপিং'::text))
  WHERE slug = 'intercity-shipping' AND name_translations::jsonb ->> 'bn' = 'শহরের মধ্যে দূরপাল্লার শিপিং';
UPDATE services SET name_translations = jsonb_set(name_translations::jsonb, '{ur}', to_jsonb('ڈیلیوری ڈرائیور'::text))
  WHERE slug = 'delivery-rep' AND name_translations::jsonb ->> 'ur' = 'ڈیلیوری کا نمائندہ';
UPDATE services SET name_translations = jsonb_set(name_translations::jsonb, '{hi}', to_jsonb('डिलीवरी ड्राइवर'::text))
  WHERE slug = 'delivery-rep' AND name_translations::jsonb ->> 'hi' = 'डिलीवरी प्रतिनिधि';
UPDATE services SET name_translations = jsonb_set(name_translations::jsonb, '{bn}', to_jsonb('ডেলিভারি ম্যান'::text))
  WHERE slug = 'delivery-rep' AND name_translations::jsonb ->> 'bn' = 'ডেলিভারি প্রতিনিধি';
UPDATE services SET name_translations = jsonb_set(name_translations::jsonb, '{ur}', to_jsonb('کار کرایہ پر'::text))
  WHERE slug = 'car-rental' AND name_translations::jsonb ->> 'ur' = 'گاڑی کرائے پر دینا';
UPDATE services SET name_translations = jsonb_set(name_translations::jsonb, '{hi}', to_jsonb('कार किराया'::text))
  WHERE slug = 'car-rental' AND name_translations::jsonb ->> 'hi' = 'कार किराये पर लेना';
UPDATE services SET name_translations = jsonb_set(name_translations::jsonb, '{ur}', to_jsonb('غذائیت اور ڈائٹ'::text))
  WHERE slug = 'nutrition-diet' AND name_translations::jsonb ->> 'ur' = 'غذائیت اور خوراک';
UPDATE services SET name_translations = jsonb_set(name_translations::jsonb, '{bn}', to_jsonb('পুষ্টি ও ডায়েট'::text))
  WHERE slug = 'nutrition-diet' AND name_translations::jsonb ->> 'bn' = 'পুষ্টি ও খাদ্য';
UPDATE services SET name_translations = jsonb_set(name_translations::jsonb, '{hi}', to_jsonb('कपड़ों की ऑल्टरेशन'::text))
  WHERE slug = 'clothing-alteration' AND name_translations::jsonb ->> 'hi' = 'कपड़ों में बदलाव';
UPDATE services SET name_translations = jsonb_set(name_translations::jsonb, '{ur}', to_jsonb('صحن کی دھلائی'::text))
  WHERE slug = 'ayk-yard-cleaning' AND name_translations::jsonb ->> 'ur' = 'صحن کی صفائی';
UPDATE services SET name_translations = jsonb_set(name_translations::jsonb, '{hi}', to_jsonb('आँगन की धुलाई'::text))
  WHERE slug = 'ayk-yard-cleaning' AND name_translations::jsonb ->> 'hi' = 'आँगन की सफ़ाई';
UPDATE services SET name_translations = jsonb_set(name_translations::jsonb, '{bn}', to_jsonb('উঠান ধোয়া'::text))
  WHERE slug = 'ayk-yard-cleaning' AND name_translations::jsonb ->> 'bn' = 'উঠান পরিষ্কার';
UPDATE services SET name_translations = jsonb_set(name_translations::jsonb, '{ur}', to_jsonb('اسپلٹ اے سی سروس'::text))
  WHERE slug = 'split-ac-service' AND name_translations::jsonb ->> 'ur' = 'اسپلٹ اے سی کی مرمت';
UPDATE services SET name_translations = jsonb_set(name_translations::jsonb, '{ur}', to_jsonb('سنٹرل اے سی سروس'::text))
  WHERE slug = 'central-ac-service' AND name_translations::jsonb ->> 'ur' = 'سنٹرل اے سی کی مرمت';
