import { Shield, Lock, Eye, Trash2, Mail, Globe } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import FullScreenLoader from '../components/common/FullScreenLoader';
import { PublicPageNavBar, PublicPageFooter } from '../components/public/PublicPageChrome';

const CONTACT_EMAIL = 'lifesync.birzeit@gmail.com';
const APP_NAME = 'LifeSync';

// Full bilingual policy copy — long-form legal content keyed by locale (kept
// out of the i18n dictionaries, which hold short UI strings).
const COPY = {
  en: {
    lastUpdated: 'March 2026',
    orgName: 'Birzeit University — LifeSync Project Team',
    intro: (org) => (
      <>Welcome to <strong className="text-navy-900">{APP_NAME}</strong>, developed by <strong className="text-navy-900">{org}</strong>. This Privacy Policy explains how we collect, use, disclose, and protect your personal information when you use our application. By creating an account or using {APP_NAME}, you agree to the practices described in this policy.</>
    ),
    introContactPre: 'If you have questions, email us at ',
    sections: {
      collect: {
        title: '1. Information We Collect',
        blocks: [
          { sub: 'Account Information', text: "When you register, we collect your email address, username, and optionally your full name and profile picture. If you sign in with Google, we receive your Google profile information such as name, email, and profile photo from Google's OAuth service." },
          { sub: 'Health Data', text: 'We collect health-related information you choose to log, including step counts, sleep duration, mood ratings, water intake, nutrition, and exercise records. This data is entered voluntarily by you.' },
          { sub: 'Financial Data', text: 'We collect financial transaction information you manually enter or log through our natural language interface, including amounts, categories, and descriptions. We do not connect to your bank accounts or payment providers.' },
          { sub: 'Usage & Technical Data', text: 'We automatically collect limited technical information including your IP address for security and rate limiting, browser type, operating system, and usage patterns to improve the service.' },
          { sub: 'Chat & AI Interactions', text: 'Conversations with our AI assistant may be stored to provide context and continuity. These messages are used to generate insights and improve your in-app experience.' },
        ],
      },
      use: {
        title: '2. How We Use Your Information',
        lead: 'We use your information to:',
        items: [
          `Provide, personalize, and improve the ${APP_NAME} service`,
          'Generate AI-powered health and financial insights tailored to you',
          'Authenticate your identity and keep your account secure',
          'Send transactional emails such as OTP codes and account alerts',
          'Analyze aggregate, anonymized usage patterns to improve the product',
          'Comply with legal obligations',
        ],
        after: 'We do not use your data for advertising, and we do not sell your personal information to third parties.',
      },
      google: {
        title: '3. Google Sign-In & OAuth',
        lead: `${APP_NAME} offers Sign in with Google using Google's OAuth 2.0 service. When you authenticate with Google, we receive:`,
        items: [
          'Your Google account email address',
          'Your display name',
          'Your Google profile picture URL',
          'A unique Google user ID',
        ],
        after1: 'We do not receive your Google password, access to your Google Drive, Gmail, or any other Google services. The only data we access is the profile information listed above.',
        after2Pre: "Your Google credentials are never stored on our servers. We verify the authenticity of your Google ID token and then issue our own JWT session tokens. ",
        after2LinkLabel: "Google's Privacy Policy",
        after2Post: " governs Google's handling of your data.",
      },
      sharing: {
        title: '4. Data Sharing & Third Parties',
        lead: 'We share your data only with the following third parties, solely to operate the service:',
        items: [
          ['Railway', ' — backend hosting and database infrastructure'],
          ['Cloudflare', ' — frontend hosting and content delivery'],
          ['Firebase (Google)', ' — real-time chat message synchronization'],
          ['Google Gemini', ' — natural-language logging and generated summaries through the Gemini API'],
          ['Nodemailer / SMTP provider', ' — transactional email delivery such as OTP codes'],
        ],
        after: 'We do not share your personal information with advertisers or data brokers.',
      },
      security: {
        title: '5. Data Security',
        lead: 'We take data security seriously and implement protections including:',
        items: [
          'Passwords are hashed using bcrypt before storage and are never stored in plaintext',
          'API communication is encrypted via HTTPS/TLS',
          'Authentication uses short-lived JWT access tokens with refresh token rotation',
          'Sensitive fields in the database are encrypted at rest',
          'Rate limiting protects against brute-force attacks',
          'Email verification is required for new local accounts',
        ],
        after: 'While we take reasonable measures, no system is 100% secure. Please use a strong, unique password or Google Sign-In for stronger account protection.',
      },
      retention: {
        title: '6. Data Retention & Deletion',
        pre: 'We retain your account and associated data for as long as your account is active or as needed to provide the service. You may request deletion of your account through profile settings or by contacting ',
        post: '.',
        after: 'Upon account deletion, we will permanently delete your personal data within a reasonable time except where retention is required by law or for legitimate security purposes such as fraud prevention records.',
      },
      rights: {
        title: '7. Your Rights',
        lead: 'Depending on your jurisdiction, you may have the following rights:',
        items: [
          ['Access', ' — request a copy of the personal data we hold about you'],
          ['Correction', ' — request correction of inaccurate data'],
          ['Deletion', ' — request deletion of your personal data'],
          ['Portability', ' — request your data in a portable format'],
          ['Objection', ' — object to certain types of processing'],
        ],
        afterPre: 'To exercise any of these rights, contact us at ',
        afterPost: '.',
      },
      children: {
        title: "8. Children's Privacy",
        text: `${APP_NAME} is not intended for use by children under 13 years of age. We do not knowingly collect personal information from children under 13. If you believe we have inadvertently collected such data, contact us immediately and we will delete it.`,
      },
      changes: {
        title: '9. Changes to This Policy',
        text: `We may update this Privacy Policy from time to time. When we do, we will update the last updated date at the top of this page. For material changes, we will notify you via email or in-app messaging where practical. Continued use of ${APP_NAME} after changes are posted constitutes your acceptance of the revised policy.`,
      },
      contact: {
        title: '10. Contact Us',
        lead: 'If you have questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact:',
        emailLabel: 'Email: ',
        address: 'Birzeit, West Bank, Palestine',
      },
    },
  },
  ar: {
    lastUpdated: 'آذار 2026',
    orgName: 'جامعة بيرزيت — فريق مشروع LifeSync',
    intro: (org) => (
      <>مرحبًا بك في <strong className="text-navy-900">{APP_NAME}</strong>، الذي طوّره <strong className="text-navy-900">{org}</strong>. توضّح سياسة الخصوصية هذه كيف نجمع معلوماتك الشخصية ونستخدمها ونفصح عنها ونحميها عند استخدامك تطبيقنا. بإنشائك حسابًا أو استخدامك {APP_NAME} فإنك توافق على الممارسات الموضّحة في هذه السياسة.</>
    ),
    introContactPre: 'إذا كانت لديك أسئلة، راسلنا على ',
    sections: {
      collect: {
        title: '1. المعلومات التي نجمعها',
        blocks: [
          { sub: 'معلومات الحساب', text: 'عند التسجيل نجمع بريدك الإلكتروني واسم المستخدم، واختياريًا اسمك الكامل وصورتك الشخصية. وإذا سجّلت الدخول بواسطة Google، نستلم معلومات ملفك في Google مثل الاسم والبريد والصورة عبر خدمة OAuth من Google.' },
          { sub: 'البيانات الصحية', text: 'نجمع المعلومات الصحية التي تختار تسجيلها، مثل عدد الخطوات ومدة النوم وتقييمات المزاج وكمية الماء والتغذية وسجلات التمارين. تُدخل هذه البيانات طوعًا من جانبك.' },
          { sub: 'البيانات المالية', text: 'نجمع معلومات المعاملات المالية التي تدخلها يدويًا أو تسجّلها عبر واجهة اللغة الطبيعية، بما في ذلك المبالغ والفئات والأوصاف. نحن لا نتصل بحساباتك البنكية أو مزوّدي الدفع.' },
          { sub: 'بيانات الاستخدام والبيانات التقنية', text: 'نجمع تلقائيًا معلومات تقنية محدودة تشمل عنوان IP لأغراض الأمان وتحديد المعدّل، ونوع المتصفح ونظام التشغيل وأنماط الاستخدام لتحسين الخدمة.' },
          { sub: 'المحادثات وتفاعلات الذكاء الاصطناعي', text: 'قد تُخزَّن محادثاتك مع المساعد الذكي لتوفير السياق والاستمرارية، وتُستخدم هذه الرسائل لتوليد الرؤى وتحسين تجربتك داخل التطبيق.' },
        ],
      },
      use: {
        title: '2. كيف نستخدم معلوماتك',
        lead: 'نستخدم معلوماتك من أجل:',
        items: [
          `تقديم خدمة ${APP_NAME} وتخصيصها وتحسينها`,
          'توليد رؤى صحية ومالية مدعومة بالذكاء الاصطناعي مخصّصة لك',
          'التحقق من هويتك والحفاظ على أمان حسابك',
          'إرسال رسائل بريد إلكتروني تشغيلية مثل رموز التحقق وتنبيهات الحساب',
          'تحليل أنماط استخدام مجمّعة ومجهولة الهوية لتحسين المنتج',
          'الامتثال للالتزامات القانونية',
        ],
        after: 'نحن لا نستخدم بياناتك للإعلانات، ولا نبيع معلوماتك الشخصية لأطراف ثالثة.',
      },
      google: {
        title: '3. تسجيل الدخول بواسطة Google وبروتوكول OAuth',
        lead: `يوفّر ${APP_NAME} تسجيل الدخول بواسطة Google عبر خدمة OAuth 2.0. عند مصادقتك بواسطة Google نستلم:`,
        items: [
          'عنوان بريدك الإلكتروني في حساب Google',
          'اسم العرض الخاص بك',
          'رابط صورتك الشخصية في Google',
          'معرّف مستخدم Google فريد',
        ],
        after1: 'نحن لا نستلم كلمة مرور Google الخاصة بك ولا نصل إلى Google Drive أو Gmail أو أي خدمات Google أخرى. البيانات الوحيدة التي نصل إليها هي معلومات الملف الشخصي المذكورة أعلاه.',
        after2Pre: 'لا تُخزَّن بيانات اعتماد Google الخاصة بك على خوادمنا أبدًا؛ نتحقق من صحة رمز معرّف Google ثم نُصدر رموز جلسات JWT خاصة بنا. ',
        after2LinkLabel: 'سياسة خصوصية Google',
        after2Post: ' هي التي تحكم تعامل Google مع بياناتك.',
      },
      sharing: {
        title: '4. مشاركة البيانات والأطراف الثالثة',
        lead: 'نشارك بياناتك فقط مع الأطراف الثالثة التالية، وحصريًا لتشغيل الخدمة:',
        items: [
          ['Railway', ' — استضافة الخادم الخلفي وبنية قاعدة البيانات'],
          ['Cloudflare', ' — استضافة الواجهة الأمامية وتوصيل المحتوى'],
          ['Firebase (Google)', ' — مزامنة رسائل المحادثة الفورية'],
          ['Google Gemini', ' — التسجيل باللغة الطبيعية والملخّصات المولّدة عبر واجهة Gemini'],
          ['Nodemailer / مزوّد SMTP', ' — إرسال رسائل البريد التشغيلية مثل رموز التحقق'],
        ],
        after: 'نحن لا نشارك معلوماتك الشخصية مع المعلنين أو وسطاء البيانات.',
      },
      security: {
        title: '5. أمان البيانات',
        lead: 'نأخذ أمان البيانات على محمل الجد ونطبّق حمايات تشمل:',
        items: [
          'تُشفَّر كلمات المرور بخوارزمية bcrypt قبل التخزين ولا تُخزَّن نصًا صريحًا أبدًا',
          'اتصالات الواجهة البرمجية مشفّرة عبر HTTPS/TLS',
          'تعتمد المصادقة على رموز JWT قصيرة العمر مع تدوير رموز التحديث',
          'الحقول الحسّاسة في قاعدة البيانات مشفّرة أثناء التخزين',
          'تحديد معدّل الطلبات يحمي من هجمات التخمين',
          'التحقق من البريد الإلكتروني مطلوب للحسابات المحلية الجديدة',
        ],
        after: 'رغم اتخاذنا تدابير معقولة، لا يوجد نظام آمن بنسبة 100٪. استخدم كلمة مرور قوية وفريدة أو تسجيل الدخول بواسطة Google لحماية أقوى لحسابك.',
      },
      retention: {
        title: '6. الاحتفاظ بالبيانات وحذفها',
        pre: 'نحتفظ بحسابك وبياناته ما دام حسابك نشطًا أو بقدر ما يلزم لتقديم الخدمة. يمكنك طلب حذف حسابك من إعدادات الملف الشخصي أو بالتواصل معنا عبر ',
        post: '.',
        after: 'عند حذف الحساب، سنحذف بياناتك الشخصية نهائيًا خلال مدة معقولة، إلا حيث يُلزم القانون بالاحتفاظ بها أو لأغراض أمنية مشروعة مثل سجلات منع الاحتيال.',
      },
      rights: {
        title: '7. حقوقك',
        lead: 'وفقًا لولايتك القضائية، قد تتمتع بالحقوق التالية:',
        items: [
          ['الوصول', ' — طلب نسخة من البيانات الشخصية التي نحتفظ بها عنك'],
          ['التصحيح', ' — طلب تصحيح البيانات غير الدقيقة'],
          ['الحذف', ' — طلب حذف بياناتك الشخصية'],
          ['قابلية النقل', ' — طلب بياناتك بصيغة قابلة للنقل'],
          ['الاعتراض', ' — الاعتراض على أنواع معيّنة من المعالجة'],
        ],
        afterPre: 'لممارسة أي من هذه الحقوق، تواصل معنا على ',
        afterPost: '.',
      },
      children: {
        title: '8. خصوصية الأطفال',
        text: `${APP_NAME} غير موجّه للأطفال دون سن 13 عامًا، ولا نجمع عن قصد معلومات شخصية منهم. إذا كنت تعتقد أننا جمعنا مثل هذه البيانات عن غير قصد، فتواصل معنا فورًا وسنحذفها.`,
      },
      changes: {
        title: '9. التغييرات على هذه السياسة',
        text: `قد نحدّث سياسة الخصوصية هذه من وقت لآخر، وسنحدّث حينها تاريخ آخر تحديث أعلى هذه الصفحة. وفي حال التغييرات الجوهرية سنخطرك عبر البريد الإلكتروني أو داخل التطبيق حيثما أمكن. استمرارك في استخدام ${APP_NAME} بعد نشر التغييرات يُعدّ قبولًا للسياسة المعدّلة.`,
      },
      contact: {
        title: '10. تواصل معنا',
        lead: 'إذا كانت لديك أسئلة أو مخاوف أو طلبات بشأن سياسة الخصوصية هذه أو ممارساتنا في التعامل مع البيانات، تواصل مع:',
        emailLabel: 'البريد الإلكتروني: ',
        address: 'بيرزيت، الضفة الغربية، فلسطين',
      },
    },
  },
};

function Section({ icon: Icon, title, children, id }) {
  return (
    <section id={id} className="mb-10">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-emerald-600" />
        </div>
        <h2 className="font-display text-xl font-bold text-navy-900">{title}</h2>
      </div>
      <div className="text-navy-600 text-sm leading-7 space-y-3 ps-11">{children}</div>
    </section>
  );
}

function SectionTitle({ children }) {
  return <h3 className="font-semibold text-navy-800 mt-4 mb-1">{children}</h3>;
}

const EmailLink = () => (
  <a href={`mailto:${CONTACT_EMAIL}`} className="text-emerald-600 underline">{CONTACT_EMAIL}</a>
);

const StrongList = ({ items }) => (
  <ul className="list-disc list-inside space-y-1.5 mt-2">
    {items.map(([head, rest]) => (
      <li key={head}><strong>{head}</strong>{rest}</li>
    ))}
  </ul>
);

export default function PrivacyPolicyPage() {
  const { user, loading } = useAuth();
  const { t, locale, isRTL } = useSettings();
  const L = COPY[locale] || COPY.en;
  const S = L.sections;

  if (loading) {
    return <FullScreenLoader />;
  }

  return (
    <div className="min-h-screen bg-surface" dir={isRTL ? 'rtl' : 'ltr'}>
      <PublicPageNavBar activePage="privacy" user={user} />

      <div className="bg-gradient-to-br from-ink-900 to-ink-800 py-16 px-6 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium mb-4">
          <Shield className="w-3.5 h-3.5" />
          {t('legal.privacyBadge')}
        </div>
        <h1 className="font-display text-4xl font-bold text-white mb-3">{t('legal.privacyTitle')}</h1>
        <p className="text-white/60 text-sm">{t('legal.lastUpdated', { date: L.lastUpdated })}</p>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-14">
        <div className="bg-white rounded-2xl border border-navy-100 p-8 mb-10 shadow-sm">
          <p className="text-navy-600 text-sm leading-7">{L.intro(L.orgName)}</p>
          <p className="text-navy-500 text-xs mt-3">
            {L.introContactPre}
            <EmailLink />
            .
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-navy-100 p-8 shadow-sm space-y-2">
          <Section icon={Eye} title={S.collect.title} id="collect">
            {S.collect.blocks.map((b) => (
              <div key={b.sub}>
                <SectionTitle>{b.sub}</SectionTitle>
                <p>{b.text}</p>
              </div>
            ))}
          </Section>

          <Section icon={Globe} title={S.use.title} id="use">
            <p>{S.use.lead}</p>
            <ul className="list-disc list-inside space-y-1.5 mt-2">
              {S.use.items.map((li) => <li key={li}>{li}</li>)}
            </ul>
            <p className="mt-3">{S.use.after}</p>
          </Section>

          <Section icon={Shield} title={S.google.title} id="google">
            <p>{S.google.lead}</p>
            <ul className="list-disc list-inside space-y-1 mt-2">
              {S.google.items.map((li) => <li key={li}>{li}</li>)}
            </ul>
            <p className="mt-3">{S.google.after1}</p>
            <p className="mt-3">
              {S.google.after2Pre}
              <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-emerald-600 underline">{S.google.after2LinkLabel}</a>
              {S.google.after2Post}
            </p>
          </Section>

          <Section icon={Lock} title={S.sharing.title} id="sharing">
            <p>{S.sharing.lead}</p>
            <StrongList items={S.sharing.items} />
            <p className="mt-3">{S.sharing.after}</p>
          </Section>

          <Section icon={Lock} title={S.security.title} id="security">
            <p>{S.security.lead}</p>
            <ul className="list-disc list-inside space-y-1.5 mt-2">
              {S.security.items.map((li) => <li key={li}>{li}</li>)}
            </ul>
            <p className="mt-3">{S.security.after}</p>
          </Section>

          <Section icon={Trash2} title={S.retention.title} id="retention">
            <p>
              {S.retention.pre}
              <EmailLink />
              {S.retention.post}
            </p>
            <p className="mt-3">{S.retention.after}</p>
          </Section>

          <Section icon={Eye} title={S.rights.title} id="rights">
            <p>{S.rights.lead}</p>
            <StrongList items={S.rights.items} />
            <p className="mt-3">
              {S.rights.afterPre}
              <EmailLink />
              {S.rights.afterPost}
            </p>
          </Section>

          <Section icon={Shield} title={S.children.title} id="children">
            <p>{S.children.text}</p>
          </Section>

          <Section icon={Globe} title={S.changes.title} id="changes">
            <p>{S.changes.text}</p>
          </Section>

          <Section icon={Mail} title={S.contact.title} id="contact">
            <p>{S.contact.lead}</p>
            <div className="mt-3 p-4 rounded-xl bg-navy-50 border border-navy-100">
              <p className="font-semibold text-navy-800">{L.orgName}</p>
              <p>
                {S.contact.emailLabel}
                <EmailLink />
              </p>
              <p>{S.contact.address}</p>
            </div>
          </Section>
        </div>
      </div>

      <PublicPageFooter user={user} />
    </div>
  );
}
