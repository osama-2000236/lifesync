import { Shield, Lock, Eye, Trash2, Mail, Globe } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import FullScreenLoader from '../components/common/FullScreenLoader';
import { PublicPageNavBar, PublicPageFooter } from '../components/public/PublicPageChrome';

const LAST_UPDATED = 'March 2026';
const CONTACT_EMAIL = 'lifesync.birzeit@gmail.com';
const APP_NAME = 'LifeSync';
const ORG_NAME = 'Birzeit University — LifeSync Project Team';

function Section({ icon: Icon, title, children, id }) {
  return (
    <section id={id} className="mb-10">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-emerald-600" />
        </div>
        <h2 className="font-display text-xl font-bold text-navy-900">{title}</h2>
      </div>
      <div className="text-navy-600 text-sm leading-7 space-y-3 pl-11">{children}</div>
    </section>
  );
}

function SectionTitle({ children }) {
  return <h3 className="font-semibold text-navy-800 mt-4 mb-1">{children}</h3>;
}

export default function PrivacyPolicyPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return <FullScreenLoader />;
  }

  return (
    <div className="min-h-screen bg-surface">
      <PublicPageNavBar activePage="privacy" user={user} />

      <div className="bg-gradient-to-br from-navy-900 to-navy-800 py-16 px-6 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium mb-4">
          <Shield className="w-3.5 h-3.5" />
          Your privacy matters
        </div>
        <h1 className="font-display text-4xl font-bold text-white mb-3">Privacy Policy</h1>
        <p className="text-navy-300 text-sm">Last updated: {LAST_UPDATED}</p>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-14">
        <div className="bg-white rounded-2xl border border-navy-100 p-8 mb-10 shadow-sm">
          <p className="text-navy-600 text-sm leading-7">
            Welcome to
            {' '}
            <strong className="text-navy-900">{APP_NAME}</strong>
            , developed by
            {' '}
            <strong className="text-navy-900">{ORG_NAME}</strong>
            . This Privacy Policy explains how we collect, use, disclose, and protect your personal information when you use our application.
            By creating an account or using
            {' '}
            {APP_NAME}
            , you agree to the practices described in this policy.
          </p>
          <p className="text-navy-500 text-xs mt-3">
            If you have questions, email us at
            {' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-emerald-600 underline">{CONTACT_EMAIL}</a>
            .
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-navy-100 p-8 shadow-sm space-y-2">
          <Section icon={Eye} title="1. Information We Collect" id="collect">
            <SectionTitle>Account Information</SectionTitle>
            <p>When you register, we collect your email address, username, and optionally your full name and profile picture. If you sign in with Google, we receive your Google profile information such as name, email, and profile photo from Google&apos;s OAuth service.</p>

            <SectionTitle>Health Data</SectionTitle>
            <p>We collect health-related information you choose to log, including step counts, sleep duration, mood ratings, water intake, nutrition, and exercise records. This data is entered voluntarily by you.</p>

            <SectionTitle>Financial Data</SectionTitle>
            <p>We collect financial transaction information you manually enter or log through our natural language interface, including amounts, categories, and descriptions. We do not connect to your bank accounts or payment providers.</p>

            <SectionTitle>Usage &amp; Technical Data</SectionTitle>
            <p>We automatically collect limited technical information including your IP address for security and rate limiting, browser type, operating system, and usage patterns to improve the service.</p>

            <SectionTitle>Chat &amp; AI Interactions</SectionTitle>
            <p>Conversations with our AI assistant may be stored to provide context and continuity. These messages are used to generate insights and improve your in-app experience.</p>
          </Section>

          <Section icon={Globe} title="2. How We Use Your Information" id="use">
            <p>We use your information to:</p>
            <ul className="list-disc list-inside space-y-1.5 mt-2">
              <li>Provide, personalize, and improve the {APP_NAME} service</li>
              <li>Generate AI-powered health and financial insights tailored to you</li>
              <li>Authenticate your identity and keep your account secure</li>
              <li>Send transactional emails such as OTP codes and account alerts</li>
              <li>Analyze aggregate, anonymized usage patterns to improve the product</li>
              <li>Comply with legal obligations</li>
            </ul>
            <p className="mt-3">
              We do
              {' '}
              <strong>not</strong>
              {' '}
              use your data for advertising, and we do not sell your personal information to third parties.
            </p>
          </Section>

          <Section icon={Shield} title="3. Google Sign-In & OAuth" id="google">
            <p>
              {APP_NAME}
              {' '}
              offers Sign in with Google using Google&apos;s OAuth 2.0 service. When you authenticate with Google, we receive:
            </p>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li>Your Google account email address</li>
              <li>Your display name</li>
              <li>Your Google profile picture URL</li>
              <li>A unique Google user ID</li>
            </ul>
            <p className="mt-3">We do not receive your Google password, access to your Google Drive, Gmail, or any other Google services. The only data we access is the profile information listed above.</p>
            <p className="mt-3">
              Your Google credentials are never stored on our servers. We verify the authenticity of your Google ID token and then issue our own JWT session tokens.
              {' '}
              <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-emerald-600 underline">Google&apos;s Privacy Policy</a>
              {' '}
              governs Google&apos;s handling of your data.
            </p>
          </Section>

          <Section icon={Lock} title="4. Data Sharing & Third Parties" id="sharing">
            <p>We share your data only with the following third parties, solely to operate the service:</p>
            <ul className="list-disc list-inside space-y-1.5 mt-2">
              <li><strong>Railway</strong> — backend hosting and database infrastructure</li>
              <li><strong>Cloudflare</strong> — frontend hosting and content delivery</li>
              <li><strong>Firebase (Google)</strong> — real-time chat message synchronization</li>
              <li><strong>Google Gemini</strong> — natural-language logging and generated summaries through the Gemini API</li>
              <li><strong>Nodemailer / SMTP provider</strong> — transactional email delivery such as OTP codes</li>
            </ul>
            <p className="mt-3">We do not share your personal information with advertisers or data brokers.</p>
          </Section>

          <Section icon={Lock} title="5. Data Security" id="security">
            <p>We take data security seriously and implement protections including:</p>
            <ul className="list-disc list-inside space-y-1.5 mt-2">
              <li>Passwords are hashed using bcrypt before storage and are never stored in plaintext</li>
              <li>API communication is encrypted via HTTPS/TLS</li>
              <li>Authentication uses short-lived JWT access tokens with refresh token rotation</li>
              <li>Sensitive fields in the database are encrypted at rest</li>
              <li>Rate limiting protects against brute-force attacks</li>
              <li>Email verification is required for new local accounts</li>
            </ul>
            <p className="mt-3">While we take reasonable measures, no system is 100% secure. Please use a strong, unique password or Google Sign-In for stronger account protection.</p>
          </Section>

          <Section icon={Trash2} title="6. Data Retention & Deletion" id="retention">
            <p>
              We retain your account and associated data for as long as your account is active or as needed to provide the service. You may request deletion of your account through profile settings or by contacting
              {' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-emerald-600 underline">{CONTACT_EMAIL}</a>
              .
            </p>
            <p className="mt-3">Upon account deletion, we will permanently delete your personal data within a reasonable time except where retention is required by law or for legitimate security purposes such as fraud prevention records.</p>
          </Section>

          <Section icon={Eye} title="7. Your Rights" id="rights">
            <p>Depending on your jurisdiction, you may have the following rights:</p>
            <ul className="list-disc list-inside space-y-1.5 mt-2">
              <li><strong>Access</strong> — request a copy of the personal data we hold about you</li>
              <li><strong>Correction</strong> — request correction of inaccurate data</li>
              <li><strong>Deletion</strong> — request deletion of your personal data</li>
              <li><strong>Portability</strong> — request your data in a portable format</li>
              <li><strong>Objection</strong> — object to certain types of processing</li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, contact us at
              {' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-emerald-600 underline">{CONTACT_EMAIL}</a>
              .
            </p>
          </Section>

          <Section icon={Shield} title="8. Children&apos;s Privacy" id="children">
            <p>{APP_NAME} is not intended for use by children under 13 years of age. We do not knowingly collect personal information from children under 13. If you believe we have inadvertently collected such data, contact us immediately and we will delete it.</p>
          </Section>

          <Section icon={Globe} title="9. Changes to This Policy" id="changes">
            <p>We may update this Privacy Policy from time to time. When we do, we will update the last updated date at the top of this page. For material changes, we will notify you via email or in-app messaging where practical. Continued use of {APP_NAME} after changes are posted constitutes your acceptance of the revised policy.</p>
          </Section>

          <Section icon={Mail} title="10. Contact Us" id="contact">
            <p>If you have questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact:</p>
            <div className="mt-3 p-4 rounded-xl bg-navy-50 border border-navy-100">
              <p className="font-semibold text-navy-800">{ORG_NAME}</p>
              <p>
                Email:
                {' '}
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-emerald-600 underline">{CONTACT_EMAIL}</a>
              </p>
              <p>Birzeit, West Bank, Palestine</p>
            </div>
          </Section>
        </div>
      </div>

      <PublicPageFooter user={user} />
    </div>
  );
}
