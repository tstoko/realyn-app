import React from "react"
import { Logo, Button } from "@realyn/shared"
import { ArrowLeftIcon } from "@radix-ui/react-icons"
import { AnimatedGrid } from "../../components/landing/animated-grid"

interface SubProcessorsProps {
  onBack: () => void
}

// Sub-processor data structure
interface SubProcessor {
  name: string
  purpose: string
  location: string
  dataProcessed: string[]
  dpaStatus: "In place" | "Pending" | "N/A"
  website: string
}

// List of all sub-processors
const subProcessors: SubProcessor[] = [
  {
    name: "OpenAI, LLC",
    purpose: "AI-powered dispute analysis and response generation",
    location: "United States",
    dataProcessed: [
      "Dispute amounts and dates",
      "Reason codes and categories",
      "Anonymized case summaries",
      "Evidence document text (with PII redacted)",
    ],
    dpaStatus: "In place",
    website: "https://openai.com",
  },
  {
    name: "Stripe, Inc.",
    purpose: "Payment processing and dispute webhook notifications",
    location: "United States / European Union",
    dataProcessed: [
      "Transaction data",
      "Dispute notifications",
      "Evidence submission",
      "Payment metadata",
    ],
    dpaStatus: "In place",
    website: "https://stripe.com",
  },
  {
    name: "Adyen N.V.",
    purpose: "Payment processing and dispute webhook notifications",
    location: "European Union (Netherlands)",
    dataProcessed: [
      "Transaction data",
      "Dispute notifications",
      "Evidence submission",
      "Payment metadata",
    ],
    dpaStatus: "In place",
    website: "https://adyen.com",
  },
  {
    name: "Google Cloud Platform (Firebase)",
    purpose: "Cloud infrastructure, database, authentication, and file storage",
    location: "European Union (configurable)",
    dataProcessed: [
      "User account data",
      "Organization data",
      "Dispute records",
      "Evidence files",
      "Application logs",
    ],
    dpaStatus: "In place",
    website: "https://firebase.google.com",
  },
]

export const SubProcessors: React.FC<SubProcessorsProps> = ({ onBack }) => {
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
        <div className="container mx-auto px-6 max-w-5xl">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Sub-Processors</h1>
          <p className="text-slate-400 mb-8">Last updated: February 23, 2026</p>

          <div className="prose prose-invert max-w-none space-y-6 text-slate-300">
            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">Overview</h2>
              <p>
                Realyn uses certain third-party service providers ("Sub-processors") to assist in 
                providing our services. This page lists all Sub-processors that may process personal 
                data on behalf of our customers.
              </p>
              <p className="mt-4">
                In accordance with GDPR Article 28, we have Data Processing Agreements (DPAs) in place 
                with all Sub-processors. We regularly review our Sub-processors to ensure they maintain 
                appropriate security measures and comply with applicable data protection regulations.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-6">Current Sub-Processors</h2>
              
              <div className="space-y-6">
                {subProcessors.map((processor, index) => (
                  <div 
                    key={index}
                    className="bg-slate-900/50 border border-slate-800 rounded-lg p-6"
                  >
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4">
                      <div>
                        <h3 className="text-xl font-semibold text-slate-50">
                          {processor.name}
                        </h3>
                        <p className="text-slate-400 text-sm mt-1">
                          {processor.purpose}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          processor.dpaStatus === "In place" 
                            ? "bg-green-500/20 text-green-400" 
                            : processor.dpaStatus === "Pending"
                            ? "bg-yellow-500/20 text-yellow-400"
                            : "bg-slate-500/20 text-slate-400"
                        }`}>
                          DPA: {processor.dpaStatus}
                        </span>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                      <div>
                        <h4 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-2">
                          Location
                        </h4>
                        <p className="text-slate-300">{processor.location}</p>
                      </div>
                      
                      <div>
                        <h4 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-2">
                          Website
                        </h4>
                        <a 
                          href={processor.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-400 hover:text-indigo-300 underline"
                        >
                          {processor.website}
                        </a>
                      </div>
                    </div>

                    <div className="mt-4">
                      <h4 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-2">
                        Data Processed
                      </h4>
                      <ul className="list-disc list-inside text-slate-300 space-y-1">
                        {processor.dataProcessed.map((data, dataIndex) => (
                          <li key={dataIndex}>{data}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">Data Protection Measures</h2>
              <p>For all Sub-processors, we ensure:</p>
              <ul className="list-disc pl-6 space-y-2 mt-4">
                <li>
                  <strong>Data Processing Agreements:</strong> Binding contracts that specify data 
                  protection obligations in accordance with GDPR Article 28
                </li>
                <li>
                  <strong>Data Minimization:</strong> Only necessary data is shared with each 
                  Sub-processor for their specific purpose
                </li>
                <li>
                  <strong>PII Sanitization:</strong> Personal identifiable information is redacted 
                  before being processed by AI services
                </li>
                <li>
                  <strong>Encryption:</strong> Data is encrypted in transit (TLS) and at rest 
                  (AES-256)
                </li>
                <li>
                  <strong>Access Controls:</strong> Sub-processors have access only to the minimum 
                  data required for their services
                </li>
                <li>
                  <strong>Regular Audits:</strong> We periodically review Sub-processor security 
                  practices and compliance
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">Changes to Sub-Processors</h2>
              <p>
                We may update our list of Sub-processors from time to time. When we add a new 
                Sub-processor or make material changes to how we use existing Sub-processors, we will:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-4">
                <li>Update this page with the new information</li>
                <li>Ensure appropriate DPAs are in place before processing begins</li>
                <li>Notify affected customers via email for material changes (if required by contract)</li>
              </ul>
              <p className="mt-4">
                Customers may object to new Sub-processors in accordance with the terms of their 
                service agreement.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-50 mb-4">Questions</h2>
              <p>
                If you have questions about our Sub-processors or data processing practices, 
                please contact us:
              </p>
              <p className="mt-2">
                <strong>Email:</strong> privacy@realyn.com<br />
                <strong>Data Protection:</strong> dpo@realyn.com
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
