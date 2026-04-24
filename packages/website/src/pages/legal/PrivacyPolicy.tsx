import React from "react"
import { Logo, Button } from "@realyn/shared"
import { ArrowLeftIcon } from "@radix-ui/react-icons"
import { AnimatedGrid } from "../../components/landing/animated-grid"
import { COMPANY_ADDRESS, PRIVACY_EMAIL } from "../../config/companyInfo"

interface PrivacyPolicyProps {
  onBack: () => void
  onNavigateToSubProcessors?: () => void
}

export const PrivacyPolicy: React.FC<PrivacyPolicyProps> = ({ onBack, onNavigateToSubProcessors }) => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 overflow-x-hidden">
      <AnimatedGrid />
      
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo className="h-20 w-auto" />
          </div>
          <Button
            onClick={onBack}
            variant="ghost"
            size="sm"
            className="text-slate-400 hover:text-slate-50"
          >
            <ArrowLeftIcon className="mr-2 w-4 h-4" />
            Back
          </Button>
        </div>
      </nav>

      {/* Main Content */}
      <div className="relative pt-32 pb-20">
        <div className="container mx-auto px-6 max-w-4xl">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Privacy Policy</h1>
          <p className="text-slate-400 mb-8">Last updated: February 23, 2026</p>

          <div className="prose prose-invert max-w-none space-y-6 text-slate-300">
            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">1. Introduction</h2>
              <p>
                Realyn ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our chargeback management platform and services (the "Service"). Please read this Privacy Policy carefully. If you do not agree with the terms of this Privacy Policy, please do not access the Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">2. Information We Collect</h2>
              <h3 className="text-xl font-semibold text-slate-100 mb-3">2.1 Information You Provide</h3>
              <p>We collect information that you provide directly to us, including:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Account information (name, email address, phone number, job title)</li>
                <li>Organization information (company name, business details)</li>
                <li>Payment and billing information</li>
                <li>Integration credentials for Payment Service Providers (Stripe, Adyen)</li>
                <li>Evidence documents you upload for dispute responses</li>
                <li>Communications with our support team</li>
              </ul>

              <h3 className="text-xl font-semibold text-slate-100 mb-3 mt-6">2.2 Information We Collect Automatically</h3>
              <p>When you use our Service, we automatically collect:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Usage data (pages visited, features used, time spent)</li>
                <li>Device information (IP address, browser type, operating system)</li>
                <li>Log data (access times, error logs, performance data)</li>
                <li>Transaction and dispute data from connected Payment Service Providers</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">3. How We Use Your Information</h2>
              <p>We use the information we collect to:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Provide, maintain, and improve our Service</li>
                <li>Process transactions and manage disputes</li>
                <li>Send you technical notices, updates, and support messages</li>
                <li>Respond to your comments, questions, and requests</li>
                <li>Monitor and analyze trends, usage, and activities</li>
                <li>Detect, prevent, and address technical issues and security threats</li>
                <li>Comply with legal obligations and enforce our agreements</li>
              </ul>

              <h3 className="text-xl font-semibold text-slate-100 mb-3 mt-6">3.1 AI-Powered Services</h3>
              <p>We use artificial intelligence services to help analyze disputes and generate response recommendations. When you use our AI features:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Dispute data (amounts, dates, reason codes) is processed by our AI sub-processor</li>
                <li><strong>Personal identifiable information (PII) is redacted before AI processing</strong> - customer names, emails, phone numbers, and card details are sanitized</li>
                <li>AI outputs are recommendations only and require your review before submission</li>
                <li>You can choose not to use AI features and manage disputes manually</li>
              </ul>
              <p className="mt-4">
                <strong>Our AI Sub-processor:</strong>
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Provider:</strong> OpenAI, LLC</li>
                <li><strong>Location:</strong> United States</li>
                <li><strong>Purpose:</strong> Dispute analysis and response generation</li>
                <li><strong>Data Processing Agreement:</strong> In place</li>
              </ul>
              <p className="mt-4">
                For a complete list of our sub-processors, please see our{' '}
                <button 
                  onClick={onNavigateToSubProcessors}
                  className="text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
                >
                  Sub-Processors page
                </button>.
              </p>

              <h3 className="text-xl font-semibold text-slate-100 mb-3 mt-6">3.2 Legal Basis for Processing</h3>
              <p>Under GDPR Article 6, we process your personal data on the following legal bases:</p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li><strong>Performance of a Contract (Art. 6(1)(b)):</strong> Processing necessary to provide our chargeback management service, including dispute tracking, evidence management, and response submission.</li>
                <li><strong>Legitimate Interest (Art. 6(1)(f)):</strong> Processing necessary for security monitoring, fraud prevention, service improvement, and technical troubleshooting, where our interests do not override your data protection rights.</li>
                <li><strong>Consent (Art. 6(1)(a)):</strong> Where you have given explicit consent, such as for non-essential (analytics) cookies or optional marketing communications. You may withdraw consent at any time.</li>
                <li><strong>Legal Obligation (Art. 6(1)(c)):</strong> Processing necessary to comply with financial record-keeping requirements, anti-money laundering regulations, and other applicable laws.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">4. Information Sharing and Disclosure</h2>
              <p>We do not sell your personal information. We may share your information in the following circumstances:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Service Providers:</strong> With third-party vendors who perform services on our behalf (e.g., cloud hosting, payment processing)</li>
                <li><strong>Business Transfers:</strong> In connection with any merger, sale, or acquisition of assets</li>
                <li><strong>Legal Requirements:</strong> When required by law or to protect our rights and safety</li>
                <li><strong>With Your Consent:</strong> When you explicitly authorize us to share information</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">5. Data Security</h2>
              <p>
                We implement appropriate technical and organizational security measures to protect your information, including encryption, access controls, and regular security assessments. However, no method of transmission over the Internet or electronic storage is 100% secure.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">6. Your Rights</h2>
              <p>Depending on your location, you may have the following rights:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Access and receive a copy of your personal data</li>
                <li>Rectify inaccurate or incomplete data</li>
                <li>Request deletion of your personal data</li>
                <li>Object to processing of your personal data</li>
                <li>Request restriction of processing</li>
                <li>Data portability</li>
                <li>Withdraw consent where processing is based on consent</li>
              </ul>
              <p className="mt-4">To exercise these rights, please contact us at privacy@realyn.com.</p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">7. Data Retention</h2>
              <p>
                We retain your information for as long as necessary to provide the Service, comply with legal obligations, resolve disputes, and enforce our agreements. When we no longer need your information, we will securely delete or anonymize it.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">8. International Data Transfers</h2>
              <p>
                Your information may be transferred to and processed in countries other than your country of residence, including the United States. For transfers outside the European Economic Area (EEA), we rely on the following safeguards:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li><strong>Standard Contractual Clauses (SCCs):</strong> EU-approved contractual terms that bind our sub-processors to adequate data protection standards.</li>
                <li><strong>EU-US Data Privacy Framework:</strong> Where applicable, we transfer data to US-based sub-processors that have certified under the EU-US Data Privacy Framework.</li>
                <li><strong>Adequacy Decisions:</strong> Where the European Commission has determined that a country provides an adequate level of data protection.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">9. Data Breach Notification</h2>
              <p>
                In the event of a personal data breach that is likely to result in a risk to the rights and freedoms of individuals, we will:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li>Notify the relevant supervisory authority without undue delay, and where feasible, within 72 hours of becoming aware of the breach, in accordance with GDPR Article 33.</li>
                <li>Notify affected individuals without undue delay where the breach is likely to result in a high risk to their rights and freedoms, in accordance with GDPR Article 34.</li>
                <li>Document all breaches, including the facts, effects, and remedial actions taken.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">10. Children's Privacy</h2>
              <p>
                Our Service is not intended for individuals under the age of 18. We do not knowingly collect personal information from children.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">11. Changes to This Privacy Policy</h2>
              <p>
                We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date. You are advised to review this Privacy Policy periodically.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">12. Contact Us</h2>
              <p>
                If you have questions about this Privacy Policy, please contact us at:
              </p>
              <p className="mt-2">
                <strong>Email:</strong> {PRIVACY_EMAIL}<br />
                <strong>Address:</strong> {COMPANY_ADDRESS}
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}



