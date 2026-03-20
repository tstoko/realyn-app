import React from "react"
import { Logo, Button } from "@realyn/shared"
import { ArrowLeftIcon } from "@radix-ui/react-icons"
import { AnimatedGrid } from "../../components/landing/animated-grid"

interface CookiePolicyProps {
  onBack: () => void
}

export const CookiePolicy: React.FC<CookiePolicyProps> = ({ onBack }) => {
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
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Cookie Policy</h1>
          <p className="text-slate-400 mb-8">Last updated: February 23, 2026</p>

          <div className="prose prose-invert max-w-none space-y-6 text-slate-300">
            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">1. What Are Cookies</h2>
              <p>
                Cookies are small text files that are placed on your device when you visit a website. They are widely used to make websites work more efficiently and provide information to website owners.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">2. How We Use Cookies</h2>
              <p>We use cookies for the following purposes:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Essential Cookies:</strong> Required for the Service to function properly (e.g., authentication, security)</li>
                <li><strong>Performance Cookies:</strong> Help us understand how visitors interact with the Service (e.g., analytics)</li>
                <li><strong>Functionality Cookies:</strong> Remember your preferences and settings</li>
                <li><strong>Targeting Cookies:</strong> Used to deliver relevant content and advertisements</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">3. Types of Cookies We Use</h2>
              <h3 className="text-xl font-semibold text-slate-100 mb-3">3.1 Session Cookies</h3>
              <p>These cookies are temporary and are deleted when you close your browser. They are essential for the Service to function.</p>

              <h3 className="text-xl font-semibold text-slate-100 mb-3 mt-6">3.2 Persistent Cookies</h3>
              <p>These cookies remain on your device for a set period or until you delete them. They help us remember your preferences.</p>

              <h3 className="text-xl font-semibold text-slate-100 mb-3 mt-6">3.3 Third-Party Cookies</h3>
              <p>We may use third-party services that set cookies, such as analytics providers. These are subject to the third party's privacy policy.</p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">4. Managing Cookies</h2>
              <p>
                Most web browsers allow you to control cookies through their settings. You can set your browser to refuse cookies or alert you when cookies are being sent. However, disabling cookies may affect the functionality of the Service.
              </p>
              <p className="mt-4">
                You can manage cookie preferences through your browser settings:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li>Chrome: Settings → Privacy and Security → Cookies</li>
                <li>Firefox: Options → Privacy & Security → Cookies and Site Data</li>
                <li>Safari: Preferences → Privacy → Cookies</li>
                <li>Edge: Settings → Privacy, Search, and Services → Cookies</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">5. Changes to This Cookie Policy</h2>
              <p>
                We may update this Cookie Policy from time to time. We will notify you of any changes by posting the new Cookie Policy on this page and updating the "Last updated" date.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">6. Contact Us</h2>
              <p>
                If you have questions about our use of cookies, please contact us at:
              </p>
              <p className="mt-2">
                <strong>Email:</strong> privacy@realyn.com
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}



