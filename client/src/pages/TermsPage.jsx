import {
  FileText,
  AlertCircle,
  CheckCircle,
  XCircle,
  Scale,
  Mail,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import FullScreenLoader from '../components/common/FullScreenLoader';
import { PublicPageNavBar, PublicPageFooter } from '../components/public/PublicPageChrome';

const CONTACT_EMAIL = 'lifesync.birzeit@gmail.com';
const APP_NAME = 'LifeSync';

// Full bilingual legal copy — the whole page follows the app locale, not just
// the headings. Text lives here (not in the i18n dictionaries) because legal
// paragraphs are long-form content, not UI strings.
const COPY = {
  en: {
    lastUpdated: 'March 2026',
    orgName: 'Birzeit University — LifeSync Project Team',
    intro: (org) => (
      <>These Terms of Service govern your access to and use of <strong className="text-navy-900">{APP_NAME}</strong>, operated by <strong className="text-navy-900">{org}</strong>. By creating an account or using {APP_NAME}, you agree to be bound by these Terms.</>
    ),
    academicTitle: 'Academic Project Notice:',
    academicBody: `${APP_NAME} is a graduation project developed at Birzeit University. It is provided as-is for educational and demonstration purposes and is not a regulated commercial service.`,
    sections: {
      acceptance: {
        title: '1. Acceptance of Terms',
        paras: [
          `By accessing or using ${APP_NAME}, you confirm that you are at least 13 years old, have read and understood these Terms, and agree to be bound by them. If you do not agree, you must not use the service.`,
          `We may update these Terms from time to time. Continued use of ${APP_NAME} after changes are posted constitutes your acceptance of the revised Terms.`,
        ],
      },
      account: {
        title: '2. Account Registration',
        blocks: [
          { sub: 'Creating an Account', text: `To use ${APP_NAME}, you must create an account by providing a valid email address or signing in with Google and choosing a username. You are responsible for maintaining the confidentiality of your login credentials.` },
          { sub: 'Account Responsibility', text: 'You are responsible for all activity that occurs under your account. You agree to notify us immediately of any unauthorized access. We are not liable for losses arising from unauthorized use of your account.' },
          { sub: 'Accurate Information', text: 'You agree to provide accurate and complete information during registration and to keep it up to date.' },
        ],
      },
      acceptableUse: {
        title: '3. Acceptable Use',
        lead: `You agree to use ${APP_NAME} only for lawful purposes. You must not:`,
        items: [
          'Violate any applicable law or regulation',
          'Attempt to gain unauthorized access to any part of the service or its infrastructure',
          'Introduce malware, viruses, or malicious code',
          'Use the service to harass, abuse, or harm others',
          'Scrape, crawl, or systematically extract data from the service',
          'Reverse-engineer or attempt to derive the source code of the service',
          'Use the service for commercial purposes without our express written permission',
          'Create multiple accounts to circumvent restrictions',
        ],
      },
      disclaimer: {
        title: '4. Health & Financial Data Disclaimer',
        alertTitle: 'Important:',
        alertBody: `${APP_NAME} is not a medical service, financial advisor, or regulated health application.`,
        paras: [
          `The health tracking, financial analysis, and AI-generated insights provided by ${APP_NAME} are for informational and personal tracking purposes only. They are not medical advice, diagnoses, treatment recommendations, or financial advice.`,
          `Always consult a qualified healthcare professional, doctor, or licensed financial advisor before making decisions based on information in the app. ${APP_NAME} and its creators are not liable for health or financial decisions made based on the service.`,
        ],
      },
      ip: {
        title: '5. Intellectual Property',
        blocks: [
          { sub: 'Our Content', text: `The ${APP_NAME} application, including its design, code, branding, and AI features, is the intellectual property of the LifeSync Project Team at Birzeit University. Nothing in these Terms grants you ownership of any part of the service.` },
          { sub: 'Your Content', text: `You retain ownership of all personal data and content you input into ${APP_NAME}, such as health logs, financial records, and chat messages. By using the service, you grant us a limited, non-exclusive license to process and store your content solely to provide the service to you.` },
        ],
      },
      privacy: {
        title: '6. Privacy',
        linkPre: `Your use of ${APP_NAME} is also governed by our `,
        linkLabel: 'Privacy Policy',
        linkPost: ', which is incorporated into these Terms by reference.',
      },
      liability: {
        title: '7. Limitation of Liability',
        paras: [
          `To the fullest extent permitted by applicable law, ${APP_NAME} and its creators shall not be liable for indirect, incidental, special, consequential, or punitive damages arising from your use of or inability to use the service, including any loss of data, health decisions, or financial decisions.`,
          'The service is provided "as is" and "as available" without warranties of any kind, whether express or implied, including merchantability, fitness for a particular purpose, or non-infringement.',
          `Since ${APP_NAME} is an academic project, we provide no service-level guarantees, uptime commitments, or support obligations.`,
        ],
      },
      termination: {
        title: '8. Termination',
        paras: [
          'We reserve the right to suspend or terminate your account at any time for violation of these Terms, illegal activity, or at our discretion, without prior notice.',
        ],
        contactPre: 'You may delete your account through profile settings or by contacting ',
        contactPost: '. Upon termination, your data will be handled per our Privacy Policy.',
      },
      law: {
        title: '9. Governing Law',
        paras: [
          'These Terms shall be governed by and construed in accordance with the laws applicable in the jurisdiction of Birzeit University, West Bank, Palestine, without regard to conflict of law principles.',
          `Any disputes arising from these Terms or your use of ${APP_NAME} should first be attempted to be resolved informally by contacting us.`,
        ],
      },
      contact: {
        title: '10. Contact',
        lead: 'For questions about these Terms, please contact us:',
        emailLabel: 'Email: ',
        address: 'Birzeit, West Bank, Palestine',
      },
    },
  },
  ar: {
    lastUpdated: 'آذار 2026',
    orgName: 'جامعة بيرزيت — فريق مشروع LifeSync',
    intro: (org) => (
      <>تحكم شروط الخدمة هذه وصولك إلى تطبيق <strong className="text-navy-900">{APP_NAME}</strong> واستخدامك له، والذي يديره <strong className="text-navy-900">{org}</strong>. بإنشائك حسابًا أو استخدامك {APP_NAME} فإنك توافق على الالتزام بهذه الشروط.</>
    ),
    academicTitle: 'تنويه مشروع أكاديمي:',
    academicBody: `${APP_NAME} مشروع تخرّج طُوِّر في جامعة بيرزيت، ويُقدَّم كما هو لأغراض تعليمية وعرضية، وليس خدمة تجارية خاضعة للتنظيم.`,
    sections: {
      acceptance: {
        title: '1. قبول الشروط',
        paras: [
          `بوصولك إلى ${APP_NAME} أو استخدامك له، فإنك تؤكد أن عمرك 13 عامًا على الأقل، وأنك قرأت هذه الشروط وفهمتها وتوافق على الالتزام بها. إذا لم توافق، فيجب عليك عدم استخدام الخدمة.`,
          `قد نحدّث هذه الشروط من وقت لآخر، ويُعدّ استمرارك في استخدام ${APP_NAME} بعد نشر التغييرات قبولًا منك للشروط المعدّلة.`,
        ],
      },
      account: {
        title: '2. تسجيل الحساب',
        blocks: [
          { sub: 'إنشاء حساب', text: `لاستخدام ${APP_NAME} يجب إنشاء حساب عبر تقديم بريد إلكتروني صالح أو تسجيل الدخول بواسطة Google واختيار اسم مستخدم. أنت مسؤول عن الحفاظ على سرية بيانات الدخول الخاصة بك.` },
          { sub: 'مسؤولية الحساب', text: 'أنت مسؤول عن كل نشاط يحدث عبر حسابك، وتوافق على إخطارنا فورًا بأي وصول غير مصرّح به. لسنا مسؤولين عن الخسائر الناجمة عن الاستخدام غير المصرّح به لحسابك.' },
          { sub: 'دقة المعلومات', text: 'توافق على تقديم معلومات دقيقة وكاملة عند التسجيل وعلى إبقائها محدّثة.' },
        ],
      },
      acceptableUse: {
        title: '3. الاستخدام المقبول',
        lead: `توافق على استخدام ${APP_NAME} للأغراض المشروعة فقط. يُحظر عليك:`,
        items: [
          'انتهاك أي قانون أو لائحة سارية',
          'محاولة الوصول غير المصرّح به إلى أي جزء من الخدمة أو بنيتها التحتية',
          'إدخال برمجيات خبيثة أو فيروسات أو شيفرات ضارة',
          'استخدام الخدمة لمضايقة الآخرين أو الإساءة إليهم أو إيذائهم',
          'كشط البيانات أو الزحف عليها أو استخراجها بشكل منهجي من الخدمة',
          'إجراء هندسة عكسية أو محاولة استخراج الشيفرة المصدرية للخدمة',
          'استخدام الخدمة لأغراض تجارية دون إذن كتابي صريح منا',
          'إنشاء حسابات متعددة للتحايل على القيود',
        ],
      },
      disclaimer: {
        title: '4. إخلاء المسؤولية عن البيانات الصحية والمالية',
        alertTitle: 'مهم:',
        alertBody: `${APP_NAME} ليس خدمة طبية ولا مستشارًا ماليًا ولا تطبيقًا صحيًا خاضعًا للتنظيم.`,
        paras: [
          `إن تتبّع الصحة والتحليل المالي والرؤى المولّدة بالذكاء الاصطناعي في ${APP_NAME} هي لأغراض المعلومات والتتبّع الشخصي فقط، وليست نصيحة طبية أو تشخيصًا أو توصية علاجية أو استشارة مالية.`,
          `استشر دائمًا مختصًا صحيًا مؤهلًا أو طبيبًا أو مستشارًا ماليًا مرخّصًا قبل اتخاذ قرارات بناءً على معلومات التطبيق. ${APP_NAME} وصنّاعه غير مسؤولين عن القرارات الصحية أو المالية المتخذة بناءً على الخدمة.`,
        ],
      },
      ip: {
        title: '5. الملكية الفكرية',
        blocks: [
          { sub: 'محتوانا', text: `تطبيق ${APP_NAME}، بما في ذلك تصميمه وشيفرته وعلامته وميزات الذكاء الاصطناعي فيه، ملكية فكرية لفريق مشروع LifeSync في جامعة بيرزيت. لا يمنحك أي شيء في هذه الشروط ملكية أي جزء من الخدمة.` },
          { sub: 'محتواك', text: `تحتفظ بملكية جميع البيانات الشخصية والمحتوى الذي تدخله في ${APP_NAME}، مثل سجلات الصحة والمعاملات المالية ورسائل المحادثة. باستخدامك الخدمة، تمنحنا ترخيصًا محدودًا غير حصري لمعالجة محتواك وتخزينه فقط بغرض تقديم الخدمة لك.` },
        ],
      },
      privacy: {
        title: '6. الخصوصية',
        linkPre: `يخضع استخدامك لـ ${APP_NAME} أيضًا إلى `,
        linkLabel: 'سياسة الخصوصية',
        linkPost: ' الخاصة بنا، وهي جزء لا يتجزأ من هذه الشروط.',
      },
      liability: {
        title: '7. حدود المسؤولية',
        paras: [
          `إلى أقصى حد يسمح به القانون الساري، لا يتحمل ${APP_NAME} وصنّاعه المسؤولية عن أي أضرار غير مباشرة أو عرضية أو خاصة أو تبعية أو عقابية تنشأ عن استخدامك الخدمة أو تعذّر استخدامها، بما في ذلك فقدان البيانات أو القرارات الصحية أو المالية.`,
          'تُقدَّم الخدمة "كما هي" و"حسب توفرها" دون أي ضمانات من أي نوع، صريحة كانت أو ضمنية، بما في ذلك الصلاحية للتسويق أو الملاءمة لغرض معيّن أو عدم الانتهاك.',
          `ولأن ${APP_NAME} مشروع أكاديمي، فإننا لا نقدّم أي ضمانات لمستوى الخدمة أو التزامات بوقت التشغيل أو الدعم.`,
        ],
      },
      termination: {
        title: '8. إنهاء الحساب',
        paras: [
          'نحتفظ بالحق في تعليق حسابك أو إنهائه في أي وقت عند انتهاك هذه الشروط أو ممارسة نشاط غير قانوني أو وفق تقديرنا، دون إشعار مسبق.',
        ],
        contactPre: 'يمكنك حذف حسابك من إعدادات الملف الشخصي أو بالتواصل معنا عبر ',
        contactPost: '. عند الإنهاء، تُعالَج بياناتك وفق سياسة الخصوصية.',
      },
      law: {
        title: '9. القانون الناظم',
        paras: [
          'تخضع هذه الشروط وتُفسَّر وفقًا للقوانين السارية في نطاق جامعة بيرزيت، الضفة الغربية، فلسطين، بصرف النظر عن مبادئ تنازع القوانين.',
          `يُستحسن أولًا محاولة حل أي نزاع ينشأ عن هذه الشروط أو عن استخدامك ${APP_NAME} وديًا عبر التواصل معنا.`,
        ],
      },
      contact: {
        title: '10. التواصل',
        lead: 'للاستفسار عن هذه الشروط، تواصل معنا:',
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
        <div className="w-8 h-8 rounded-lg bg-navy-50 flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-navy-600" />
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

export default function TermsPage() {
  const { user, loading } = useAuth();
  const { t, locale, isRTL } = useSettings();
  const L = COPY[locale] || COPY.en;
  const S = L.sections;

  if (loading) {
    return <FullScreenLoader />;
  }

  return (
    <div className="min-h-screen bg-surface" dir={isRTL ? 'rtl' : 'ltr'}>
      <PublicPageNavBar activePage="terms" user={user} />

      <div className="bg-gradient-to-br from-ink-900 to-ink-800 py-16 px-6 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 border border-white/20 text-white/80 text-sm font-medium mb-4">
          <Scale className="w-3.5 h-3.5" />
          {t('legal.termsBadge')}
        </div>
        <h1 className="font-display text-4xl font-bold text-white mb-3">{t('legal.termsTitle')}</h1>
        <p className="text-white/60 text-sm">{t('legal.lastUpdated', { date: L.lastUpdated })}</p>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-14">
        <div className="bg-white rounded-2xl border border-navy-100 p-8 mb-10 shadow-sm">
          <p className="text-navy-600 text-sm leading-7">{L.intro(L.orgName)}</p>
          <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200 flex gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-amber-700 text-sm">
              <strong>{L.academicTitle}</strong> {L.academicBody}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-navy-100 p-8 shadow-sm">
          <Section icon={CheckCircle} title={S.acceptance.title} id="acceptance">
            {S.acceptance.paras.map((p) => <p key={p.slice(0, 24)}>{p}</p>)}
          </Section>

          <Section icon={FileText} title={S.account.title} id="account">
            {S.account.blocks.map((b) => (
              <div key={b.sub}>
                <SectionTitle>{b.sub}</SectionTitle>
                <p>{b.text}</p>
              </div>
            ))}
          </Section>

          <Section icon={CheckCircle} title={S.acceptableUse.title} id="acceptable-use">
            <p>{S.acceptableUse.lead}</p>
            <ul className="list-disc list-inside space-y-1.5 mt-2">
              {S.acceptableUse.items.map((li) => <li key={li}>{li}</li>)}
            </ul>
          </Section>

          <Section icon={AlertCircle} title={S.disclaimer.title} id="disclaimer">
            <div className="p-4 rounded-xl bg-coral-50 border border-coral-200 flex gap-3">
              <AlertCircle className="w-5 h-5 text-coral-500 flex-shrink-0 mt-0.5" />
              <p className="text-coral-700 text-sm">
                <strong>{S.disclaimer.alertTitle}</strong> {S.disclaimer.alertBody}
              </p>
            </div>
            {S.disclaimer.paras.map((p) => <p key={p.slice(0, 24)} className="mt-3">{p}</p>)}
          </Section>

          <Section icon={Scale} title={S.ip.title} id="ip">
            {S.ip.blocks.map((b) => (
              <div key={b.sub}>
                <SectionTitle>{b.sub}</SectionTitle>
                <p>{b.text}</p>
              </div>
            ))}
          </Section>

          <Section icon={FileText} title={S.privacy.title} id="privacy">
            <p>
              {S.privacy.linkPre}
              <Link to="/privacy" className="text-emerald-600 underline font-medium">{S.privacy.linkLabel}</Link>
              {S.privacy.linkPost}
            </p>
          </Section>

          <Section icon={XCircle} title={S.liability.title} id="liability">
            {S.liability.paras.map((p) => <p key={p.slice(0, 24)}>{p}</p>)}
          </Section>

          <Section icon={XCircle} title={S.termination.title} id="termination">
            {S.termination.paras.map((p) => <p key={p.slice(0, 24)}>{p}</p>)}
            <p>
              {S.termination.contactPre}
              <EmailLink />
              {S.termination.contactPost}
            </p>
          </Section>

          <Section icon={Scale} title={S.law.title} id="governing-law">
            {S.law.paras.map((p) => <p key={p.slice(0, 24)}>{p}</p>)}
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
