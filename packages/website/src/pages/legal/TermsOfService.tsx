import React from "react"
import { Logo, Button } from "@realyn/shared"
import { ArrowLeftIcon } from "@radix-ui/react-icons"
import { AnimatedGrid } from "../../components/landing/animated-grid"
import { COMPANY_ADDRESS, GOVERNING_JURISDICTION, LEGAL_EMAIL } from "../../config/companyInfo"

interface TermsOfServiceProps {
  onBack: () => void
  onNavigateToSubProcessors?: () => void
}

export const TermsOfService: React.FC<TermsOfServiceProps> = ({ onBack }) => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 overflow-x-hidden">
      <AnimatedGrid />
      
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

      <div className="relative pt-32 pb-20">
        <div className="container mx-auto px-6 max-w-4xl">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Terms of Service</h1>
          <p className="text-slate-400 mb-8">Last updated: February 23, 2026</p>

          <div className="prose prose-invert max-w-none space-y-6 text-slate-300">
            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">1. Agreement to Terms</h2>
              <p>
                By accessing or using Realyn's chargeback management platform (the "Service"), you agree to be bound by these Terms of Service ("Terms"). If you disagree with any part of these Terms, you may not access the Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">2. Description of Service</h2>
              <p>
                Realyn provides a cloud-based chargeback and dispute management platform designed for the hospitality industry. The Service includes automated dispute matching, AI-powered response generation, evidence collection, and integration with Payment Service Providers and Property Management Systems.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">3. Account Registration</h2>
              <p>To use the Service, you must:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Provide accurate, current, and complete information</li>
                <li>Maintain and update your account information</li>
                <li>Maintain the security of your account credentials</li>
                <li>Accept responsibility for all activities under your account</li>
                <li>Be at least 18 years old and have authority to bind your organization</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">4. Use of Service</h2>
              <h3 className="text-xl font-semibold text-slate-100 mb-3">4.1 Permitted Use</h3>
              <p>You may use the Service solely for lawful business purposes in accordance with these Terms.</p>

              <h3 className="text-xl font-semibold text-slate-100 mb-3 mt-6">4.2 Prohibited Use</h3>
              <p>You agree not to:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Violate any applicable laws or regulations</li>
                <li>Infringe on intellectual property rights</li>
                <li>Transmit malicious code, viruses, or harmful data</li>
                <li>Attempt to gain unauthorized access to the Service</li>
                <li>Interfere with or disrupt the Service</li>
                <li>Use the Service to process fraudulent transactions</li>
                <li>Reverse engineer or attempt to extract source code</li>
                <li>Resell or sublicense the Service without authorization</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">5. Fees and Payment</h2>
              <p>
                Access to the Service is subject to payment of fees as specified in your subscription plan. Fees are billed in advance on a monthly or annual basis. All fees are non-refundable except as required by law. We reserve the right to change our pricing with 30 days' notice.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">6. Intellectual Property</h2>
              <p>
                The Service, including all content, features, and functionality, is owned by Realyn and protected by copyright, trademark, and other intellectual property laws. You are granted a limited, non-exclusive, non-transferable license to use the Service in accordance with these Terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">7. Data and Privacy</h2>
              <p>
                Your use of the Service is also governed by our Privacy Policy. You retain ownership of your data. By using the Service, you grant us a license to use, store, and process your data as necessary to provide the Service. We implement appropriate security measures to protect your data.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">8. Third-Party Integrations</h2>
              <p>
                The Service integrates with third-party services (PSPs, PMS systems). Your use of these integrations is subject to the terms and conditions of those third parties. We are not responsible for the availability, accuracy, or functionality of third-party services.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">9. Disclaimers</h2>
              <p>
                THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. WE DO NOT GUARANTEE THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE. WE DO NOT WARRANT THE ACCURACY, COMPLETENESS, OR USEFULNESS OF ANY INFORMATION PROVIDED BY THE SERVICE.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">10. Limitation of Liability</h2>
              <p>
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, REALYN SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">11. Indemnification</h2>
              <p>
                You agree to indemnify and hold harmless Realyn from any claims, damages, losses, liabilities, and expenses (including legal fees) arising from your use of the Service, violation of these Terms, or infringement of any rights of another.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">12. Termination</h2>
              <p>
                Either party may terminate this agreement at any time. Upon termination, your right to use the Service will immediately cease. We may terminate or suspend your account immediately for breach of these Terms. Sections that by their nature should survive termination will survive.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">13. Changes to Terms</h2>
              <p>
                We reserve the right to modify these Terms at any time. We will notify you of material changes via email or through the Service. Your continued use of the Service after such modifications constitutes acceptance of the updated Terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">14. Governing Law</h2>
              <p>
                These Terms shall be governed by and construed in accordance with the laws of {GOVERNING_JURISDICTION}, without regard to its conflict of law provisions. Any disputes arising from these Terms shall be subject to the exclusive jurisdiction of the courts in {GOVERNING_JURISDICTION}.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">15. Contact Information</h2>
              <p>
                If you have questions about these Terms, please contact us at:
              </p>
              <p className="mt-2">
                <strong>Email:</strong> {LEGAL_EMAIL}<br />
                <strong>Address:</strong> {COMPANY_ADDRESS}
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}



