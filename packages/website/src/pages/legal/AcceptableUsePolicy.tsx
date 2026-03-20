import React from "react"
import { Logo, Button } from "@realyn/shared"
import { ArrowLeftIcon } from "@radix-ui/react-icons"
import { AnimatedGrid } from "../../components/landing/animated-grid"

interface AcceptableUsePolicyProps {
  onBack: () => void
}

export const AcceptableUsePolicy: React.FC<AcceptableUsePolicyProps> = ({ onBack }) => {
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
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Acceptable Use Policy</h1>
          <p className="text-slate-400 mb-8">Last updated: {new Date().toLocaleDateString()}</p>

          <div className="prose prose-invert max-w-none space-y-6 text-slate-300">
            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">1. Introduction</h2>
              <p>
                This Acceptable Use Policy ("Policy") outlines the acceptable use of Realyn's chargeback management platform (the "Service"). By using the Service, you agree to comply with this Policy. Violations may result in suspension or termination of your account.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">2. Prohibited Activities</h2>
              <p>You agree not to use the Service to:</p>
              
              <h3 className="text-xl font-semibold text-slate-100 mb-3 mt-4">2.1 Illegal Activities</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Violate any applicable local, state, national, or international law</li>
                <li>Engage in fraud, money laundering, or other financial crimes</li>
                <li>Process transactions for illegal goods or services</li>
                <li>Facilitate any illegal activity</li>
              </ul>

              <h3 className="text-xl font-semibold text-slate-100 mb-3 mt-6">2.2 Security Violations</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Attempt to gain unauthorized access to the Service or other accounts</li>
                <li>Interfere with or disrupt the integrity or performance of the Service</li>
                <li>Introduce viruses, malware, or other harmful code</li>
                <li>Attempt to reverse engineer, decompile, or disassemble the Service</li>
                <li>Bypass or circumvent security measures</li>
              </ul>

              <h3 className="text-xl font-semibold text-slate-100 mb-3 mt-6">2.3 Abuse and Harassment</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Harass, abuse, or harm other users</li>
                <li>Transmit offensive, defamatory, or discriminatory content</li>
                <li>Impersonate others or provide false information</li>
              </ul>

              <h3 className="text-xl font-semibold text-slate-100 mb-3 mt-6">2.4 Data Misuse</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Access, collect, or use data from the Service without authorization</li>
                <li>Scrape, crawl, or harvest data from the Service</li>
                <li>Use automated systems to access the Service in violation of rate limits</li>
                <li>Share account credentials or allow unauthorized access</li>
              </ul>

              <h3 className="text-xl font-semibold text-slate-100 mb-3 mt-6">2.5 Commercial Misuse</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Resell or sublicense the Service without authorization</li>
                <li>Use the Service to compete with Realyn</li>
                <li>Use the Service for benchmarking or competitive analysis</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">3. Content Standards</h2>
              <p>You are responsible for all content you submit through the Service. Content must:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Be accurate and truthful</li>
                <li>Comply with all applicable laws and regulations</li>
                <li>Not infringe on intellectual property rights</li>
                <li>Not contain confidential information of third parties without authorization</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">4. Compliance with Payment Industry Standards</h2>
              <p>
                When using the Service to manage chargebacks and disputes, you must comply with all applicable payment industry standards, including but not limited to PCI DSS requirements, card network rules, and regulations from Payment Service Providers.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">5. Monitoring and Enforcement</h2>
              <p>
                We reserve the right to monitor your use of the Service to ensure compliance with this Policy. We may investigate violations and take appropriate action, including:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Issuing warnings</li>
                <li>Suspending or terminating your account</li>
                <li>Removing or disabling access to content</li>
                <li>Reporting violations to law enforcement</li>
                <li>Pursuing legal remedies</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">6. Reporting Violations</h2>
              <p>
                If you become aware of any violation of this Policy, please report it to us immediately at abuse@realyn.com. We will investigate all reports promptly.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">7. Changes to This Policy</h2>
              <p>
                We may update this Policy from time to time. We will notify you of material changes via email or through the Service. Your continued use of the Service after such changes constitutes acceptance of the updated Policy.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">8. Contact Information</h2>
              <p>
                If you have questions about this Policy, please contact us at:
              </p>
              <p className="mt-2">
                <strong>Email:</strong> legal@realyn.com<br />
                <strong>Abuse Reports:</strong> abuse@realyn.com
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}



