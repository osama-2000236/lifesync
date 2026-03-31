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
        <div className="w-8 h-8 rounded-lg bg-navy-50 flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-navy-600" />
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

export default function TermsPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return <FullScreenLoader />;
  }

  return (
    <div className="min-h-screen bg-surface">
      <PublicPageNavBar activePage="terms" user={user} />

      <div className="bg-gradient-to-br from-navy-900 to-navy-800 py-16 px-6 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-navy-700/60 border border-navy-600 text-navy-300 text-sm font-medium mb-4">
          <Scale className="w-3.5 h-3.5" />
          Legal agreement
        </div>
        <h1 className="font-display text-4xl font-bold text-white mb-3">Terms of Service</h1>
        <p className="text-navy-300 text-sm">Last updated: {LAST_UPDATED}</p>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-14">
        <div className="bg-white rounded-2xl border border-navy-100 p-8 mb-10 shadow-sm">
          <p className="text-navy-600 text-sm leading-7">
            These Terms of Service govern your access to and use of
            {' '}
            <strong className="text-navy-900">{APP_NAME}</strong>
            , operated by
            {' '}
            <strong className="text-navy-900">{ORG_NAME}</strong>
            . By creating an account or using
            {' '}
            {APP_NAME}
            , you agree to be bound by these Terms.
          </p>
          <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200 flex gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-amber-700 text-sm">
              <strong>Academic Project Notice:</strong>
              {' '}
              {APP_NAME}
              {' '}
              is a graduation project developed at Birzeit University. It is provided as-is for educational and demonstration purposes and is not a regulated commercial service.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-navy-100 p-8 shadow-sm">
          <Section icon={CheckCircle} title="1. Acceptance of Terms" id="acceptance">
            <p>By accessing or using {APP_NAME}, you confirm that you are at least 13 years old, have read and understood these Terms, and agree to be bound by them. If you do not agree, you must not use the service.</p>
            <p>We may update these Terms from time to time. Continued use of {APP_NAME} after changes are posted constitutes your acceptance of the revised Terms.</p>
          </Section>

          <Section icon={FileText} title="2. Account Registration" id="account">
            <SectionTitle>Creating an Account</SectionTitle>
            <p>To use {APP_NAME}, you must create an account by providing a valid email address or signing in with Google and choosing a username. You are responsible for maintaining the confidentiality of your login credentials.</p>

            <SectionTitle>Account Responsibility</SectionTitle>
            <p>You are responsible for all activity that occurs under your account. You agree to notify us immediately of any unauthorized access. We are not liable for losses arising from unauthorized use of your account.</p>

            <SectionTitle>Accurate Information</SectionTitle>
            <p>You agree to provide accurate and complete information during registration and to keep it up to date.</p>
          </Section>

          <Section icon={CheckCircle} title="3. Acceptable Use" id="acceptable-use">
            <p>You agree to use {APP_NAME} only for lawful purposes. You must not:</p>
            <ul className="list-disc list-inside space-y-1.5 mt-2">
              <li>Violate any applicable law or regulation</li>
              <li>Attempt to gain unauthorized access to any part of the service or its infrastructure</li>
              <li>Introduce malware, viruses, or malicious code</li>
              <li>Use the service to harass, abuse, or harm others</li>
              <li>Scrape, crawl, or systematically extract data from the service</li>
              <li>Reverse-engineer or attempt to derive the source code of the service</li>
              <li>Use the service for commercial purposes without our express written permission</li>
              <li>Create multiple accounts to circumvent restrictions</li>
            </ul>
          </Section>

          <Section icon={AlertCircle} title="4. Health & Financial Data Disclaimer" id="disclaimer">
            <div className="p-4 rounded-xl bg-coral-50 border border-coral-200 flex gap-3">
              <AlertCircle className="w-5 h-5 text-coral-500 flex-shrink-0 mt-0.5" />
              <p className="text-coral-700 text-sm">
                <strong>Important:</strong>
                {' '}
                {APP_NAME}
                {' '}
                is not a medical service, financial advisor, or regulated health application.
              </p>
            </div>
            <p className="mt-3">The health tracking, financial analysis, and AI-generated insights provided by {APP_NAME} are for informational and personal tracking purposes only. They are not medical advice, diagnoses, treatment recommendations, or financial advice.</p>
            <p>Always consult a qualified healthcare professional, doctor, or licensed financial advisor before making decisions based on information in the app. {APP_NAME} and its creators are not liable for health or financial decisions made based on the service.</p>
          </Section>

          <Section icon={Scale} title="5. Intellectual Property" id="ip">
            <SectionTitle>Our Content</SectionTitle>
            <p>The {APP_NAME} application, including its design, code, branding, and AI features, is the intellectual property of {ORG_NAME}. Nothing in these Terms grants you ownership of any part of the service.</p>

            <SectionTitle>Your Content</SectionTitle>
            <p>You retain ownership of all personal data and content you input into {APP_NAME}, such as health logs, financial records, and chat messages. By using the service, you grant us a limited, non-exclusive license to process and store your content solely to provide the service to you.</p>
          </Section>

          <Section icon={FileText} title="6. Privacy" id="privacy">
            <p>
              Your use of
              {' '}
              {APP_NAME}
              {' '}
              is also governed by our
              {' '}
              <Link to="/privacy" className="text-emerald-600 underline font-medium">Privacy Policy</Link>
              , which is incorporated into these Terms by reference.
            </p>
          </Section>

          <Section icon={XCircle} title="7. Limitation of Liability" id="liability">
            <p>To the fullest extent permitted by applicable law, {APP_NAME} and {ORG_NAME} shall not be liable for indirect, incidental, special, consequential, or punitive damages arising from your use of or inability to use the service, including any loss of data, health decisions, or financial decisions.</p>
            <p>The service is provided <strong>as is</strong> and <strong>as available</strong> without warranties of any kind, whether express or implied, including merchantability, fitness for a particular purpose, or non-infringement.</p>
            <p>Since {APP_NAME} is an academic project, we provide no service-level guarantees, uptime commitments, or support obligations.</p>
          </Section>

          <Section icon={XCircle} title="8. Termination" id="termination">
            <p>We reserve the right to suspend or terminate your account at any time for violation of these Terms, illegal activity, or at our discretion, without prior notice.</p>
            <p>
              You may delete your account through profile settings or by contacting
              {' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-emerald-600 underline">{CONTACT_EMAIL}</a>
              . Upon termination, your data will be handled per our Privacy Policy.
            </p>
          </Section>

          <Section icon={Scale} title="9. Governing Law" id="governing-law">
            <p>These Terms shall be governed by and construed in accordance with the laws applicable in the jurisdiction of Birzeit University, West Bank, Palestine, without regard to conflict of law principles.</p>
            <p>Any disputes arising from these Terms or your use of {APP_NAME} should first be attempted to be resolved informally by contacting us.</p>
          </Section>

          <Section icon={Mail} title="10. Contact" id="contact">
            <p>For questions about these Terms, please contact us:</p>
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
