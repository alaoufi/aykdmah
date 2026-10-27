-- Terms & Conditions acceptance tracking. We need to record WHEN a user
-- agreed (for audit) and WHICH version they agreed to (so we can prompt
-- re-acceptance if the text changes materially).
--
-- The terms text itself lives in the `settings` table — admin-editable
-- via /admin/settings. Default copy includes the privacy clause that
-- tells users their conversations may be reviewed for trust verification.

SET NAMES utf8mb4;

-- Individually idempotent columns also recover partially applied older schemas.
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP NULL DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_version VARCHAR(20) DEFAULT NULL;

INSERT IGNORE INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description) VALUES
('terms_version', '1.0', 'string', 'legal', 1, 'إصدار وثيقة الشروط الحالي'),
('terms_text',
'<h3>الشروط والأحكام — منصة ريزا</h3>

<p><b>١. قبول الاستخدام</b><br>
بتسجيلك في منصة ريزا فإنك توافق على هذه الشروط وتقر بأنك تجاوزت سن الرشد وفقاً للأنظمة المعمول بها في بلدك.</p>

<p><b>٢. صدق المعلومات</b><br>
تتعهد بأن جميع البيانات التي تقدمها (الاسم، الجوال، البريد، الموقع، الوثائق) صحيحة. أي معلومات مضللة قد تؤدي إلى تعليق حسابك فوراً.</p>

<p><b>٣. الخدمة والدفع</b><br>
المنصة وسيط بين العملاء ومقدمي الخدمة. تتفقون على تفاصيل العمل والسعر بشكل مباشر. تتحمل المنصة دور التحكيم عند النزاع وفق سجلات المحادثة والاتفاق.</p>

<p><b>٤. مراجعة المحادثات للاطمئنان على الجودة والمصداقية</b><br>
<u>تقر بعلمك وموافقتك</u> على أن إدارة المنصة قد تطّلع على المحادثات النصية والصوتية وسجلات مشاركة المواقع بينك وبين الطرف الآخر، وذلك حصراً في الحالات التالية:
</p>
<ul style="padding-inline-start:20px">
  <li>عند فتح نزاع أو شكوى من أحد الطرفين</li>
  <li>للتحقق من تنفيذ الاتفاق وحماية الحقوق</li>
  <li>للتأكد من عدم وجود محتوى مخالف للنظام أو الآداب العامة</li>
  <li>لضمان مصداقية مقدمي الخدمة الجدد قبل اعتمادهم</li>
</ul>
<p>كل عملية اطلاع تُسجَّل في نظام تدقيق داخلي مع وقتها وهوية الموظف، ولا تُستخدم لأي غرض تسويقي أو خارج هذه الحالات.</p>

<p><b>٥. حماية البيانات الشخصية</b><br>
لن تُشارك بياناتك مع أي طرف ثالث دون إذنك إلا بأمر قضائي. يحق لك طلب حذف حسابك وكل بياناتك في أي وقت.</p>

<p><b>٦. السلوك المقبول</b><br>
يُمنع منعاً باتاً: التحايل، الإهانة، نشر محتوى مسيء، طلب أو دفع مبالغ خارج المنصة، انتحال صفة شخص آخر. المخالفة تؤدي إلى إيقاف نهائي.</p>

<p><b>٧. تعديل الشروط</b><br>
يحق للمنصة تحديث هذه الوثيقة. عند أي تعديل جوهري سيُطلب منك القبول مرة أخرى عند تسجيل الدخول التالي.</p>

<p><b>٨. القانون المعمول به</b><br>
تخضع هذه الشروط لأنظمة المملكة العربية السعودية والدول الأعضاء حسب موقعك.</p>',
'text', 'legal', 1, 'نص الشروط والأحكام المعروض عند التسجيل');
