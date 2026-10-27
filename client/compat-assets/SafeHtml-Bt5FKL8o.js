import{j as s}from"./index-CCtC-ekh.js";import{r as b}from"./react-vendor-Ct9Yxb50.js";const a=`<h3>الشروط والأحكام — منصة ريزا</h3>

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
تخضع هذه الشروط لأنظمة المملكة العربية السعودية والدول الأعضاء حسب موقعك.</p>`,l=n=>String(n||"").replace(/منصة (?:ريزا|خدمات أوتاد|أوتاد|RIZA|RYZA|AWTAD SERVICES)/g,"منصة").replace(/\s+/g," ").trim(),u=l(a);function h(n,e,r){const o=(e||"ar").toLowerCase().slice(0,2),i=n?.[`terms_text_${o}`];if(typeof i=="string"&&i.trim())return i;const t=n?.terms_text;return typeof t!="string"||!t.trim()?"":l(t)===u?r("policy.default_terms_html"):t}const m=new Set(["p","h2","h3","h4","strong","b","em","i","u","ul","ol","li","br"]),f=new Set(["script","style","iframe","object","embed","svg","math","template"]);function p(n,e){if(n.nodeType===3)return n.textContent;if(n.nodeType!==1)return null;const r=n.tagName.toLowerCase();if(f.has(r))return null;const o=Array.from(n.childNodes,(t,c)=>p(t,`${e}-${c}`));if(!m.has(r))return o;if(r==="br")return s.jsx("br",{},e);const i=r;return s.jsx(i,{children:o},e)}function x({html:n,className:e=""}){const r=b.useMemo(()=>{const o=new DOMParser().parseFromString(String(n||""),"text/html");return Array.from(o.body.childNodes,(i,t)=>p(i,String(t)))},[n]);return s.jsx("div",{className:e,children:r})}export{x as S,h as l};
