import React from "react"
import { motion } from "framer-motion"
import { Eye, ListChecks, Settings2, RefreshCw, FileSearch } from "lucide-react"
import {
  SiStripe,
  SiAdyen,
  SiBraintree,
  SiSquare,
  SiPaypal,
  SiShopify,
  SiSalesforce,
  SiVisa,
  SiMastercard,
  SiAmericanexpress,
  SiElavon,
  SiKlarna,
  SiVenmo,
  SiRevolut,
  SiWise,
  SiCashapp,
  SiAfterpay,
  SiWoocommerce,
  SiBigcommerce,
  SiXero,
  SiZendesk,
  SiHubspot,
} from "react-icons/si"
import { WorldpayIcon, CheckoutDotComIcon, MewsIcon, CloudbedsIcon } from "@realyn/shared"
import { EditorialSectionHeader } from "./EditorialSectionHeader"

const OracleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M7.95 4.5C3.58 4.5 0 8.03 0 12.33S3.58 20.18 7.95 20.18h8.1C20.42 20.18 24 16.63 24 12.33S20.42 4.5 16.05 4.5zm8.03 12.9H7.98c-2.8 0-5.07-2.23-5.07-4.98s2.27-5 5.07-5h8c2.8 0 5.07 2.24 5.07 5s-2.27 4.98-5.07 4.98z"/>
  </svg>
)

const integrations: { name: string; icon: any; wide?: boolean }[] = [
  // Card networks
  { name: "Visa", icon: SiVisa },
  { name: "Mastercard", icon: SiMastercard },
  { name: "American Express", icon: SiAmericanexpress },
  // PSPs
  { name: "Stripe", icon: SiStripe },
  { name: "Adyen", icon: SiAdyen },
  { name: "Braintree", icon: SiBraintree },
  { name: "Square", icon: SiSquare },
  { name: "Worldpay", icon: WorldpayIcon, wide: true },
  { name: "Checkout.com", icon: CheckoutDotComIcon },
  { name: "PayPal", icon: SiPaypal },
  { name: "Elavon", icon: SiElavon },
  { name: "Klarna", icon: SiKlarna },
  { name: "Venmo", icon: SiVenmo },
  { name: "Revolut", icon: SiRevolut },
  { name: "Wise", icon: SiWise },
  { name: "Cash App", icon: SiCashapp },
  { name: "Afterpay", icon: SiAfterpay },
  // E-commerce
  { name: "Shopify", icon: SiShopify },
  { name: "WooCommerce", icon: SiWoocommerce },
  { name: "BigCommerce", icon: SiBigcommerce },
  // Platforms
  { name: "Salesforce", icon: SiSalesforce },
  { name: "HubSpot", icon: SiHubspot },
  { name: "Zendesk", icon: SiZendesk },
  // PMS
  { name: "Oracle", icon: OracleIcon },
  { name: "Mews", icon: MewsIcon, wide: true },
  { name: "Cloudbeds", icon: CloudbedsIcon },
  // Accounting
  { name: "Xero", icon: SiXero },
]

export function TrustIndicators() {
  const operationalTrust = [
    { icon: Eye, label: "GDPR Ready", description: "Data processing compliant with EU privacy regulations" },
    { icon: ListChecks, label: "Auditability", description: "Immutable action log for every dispute decision" },
    { icon: Settings2, label: "Governance", description: "Configurable approval policies before submission" },
    { icon: RefreshCw, label: "Reliability", description: "Automatic retry with processor receipt confirmation" },
    { icon: FileSearch, label: "Traceability", description: "Every response mapped to source evidence records" },
  ]

  return (
    <section id="trust" className="relative py-16 overflow-hidden border-t border-white/10">
      <div className="container mx-auto px-4 sm:px-6">
        {/* Integration belt */}
        <div className="mb-12 md:mb-20">
          <EditorialSectionHeader
            number="05"
            label="INTEGRATIONS"
            title="Integrates with your stack"
            subtitle="Don't see your stack? We integrate with any PSP, PMS, or platform you need."
          />
          <div className="relative flex overflow-hidden w-full [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)] py-4">
            <motion.div
              className="flex flex-none"
              animate={{ x: "-50%" }}
              transition={{
                repeat: Infinity,
                ease: "linear",
                duration: 30, // Adjust this to make it spin faster/slower
              }}
            >
              {[...Array(2)].map((_, setIndex) => (
                <div key={setIndex} className="flex flex-none gap-x-10 md:gap-x-14 items-center px-5 md:px-7">
                  {integrations.map((item) => {
                    const Icon = item.icon
                    return (
                      <div
                        key={item.name}
                        className="flex flex-col items-center gap-2.5 group cursor-default min-w-max"
                      >
                        <Icon className={`${item.wide ? "h-5 w-auto max-w-[5rem]" : "h-7 w-7"} text-slate-600 group-hover:text-white transition-colors duration-300`} />
                      </div>
                    )
                  })}
                </div>
              ))}
            </motion.div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto border-t border-white/10 pt-12">
          <EditorialSectionHeader
            number="06"
            label="SECURITY & GOVERNANCE"
            title="Security, governance, and auditability"
            subtitle="Enterprise compliance plus operational integrity for revenue-critical workflows."
          />

          <div className="border border-white/10 divide-y divide-white/10">
            {operationalTrust.map((item, i) => {
              const Icon = item.icon
              return (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className={`flex items-start gap-4 p-5 rounded-none bg-white/[0.02] transition-all hover:bg-white/[0.04] ${i === 0 ? "border-l-2 border-l-cyan-500" : ""}`}
                >
                  <div className="w-10 h-10 rounded-none border border-white/10 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-slate-300" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white mb-0.5">{item.label}</div>
                    <div className="text-sm text-slate-400">{item.description}</div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
