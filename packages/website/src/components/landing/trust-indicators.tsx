import { motion } from "framer-motion"
import { Eye, ListChecks, Settings2, RefreshCw, FileSearch, Plus } from "lucide-react"
import { SiStripe, SiAdyen, SiBraintree, SiSquare, SiPaypal, SiShopify, SiSalesforce, SiOracle } from "react-icons/si"
import { WorldpayIcon, CheckoutDotComIcon, MewsIcon, CloudbedsIcon } from "@realyn/shared"

const integrations: { name: string; icon: any; wide?: boolean }[] = [
  { name: "Stripe", icon: SiStripe },
  { name: "Adyen", icon: SiAdyen },
  { name: "Braintree", icon: SiBraintree },
  { name: "Square", icon: SiSquare },
  { name: "Worldpay", icon: WorldpayIcon, wide: true },
  { name: "Checkout.com", icon: CheckoutDotComIcon },
  { name: "PayPal", icon: SiPaypal },
  { name: "Shopify", icon: SiShopify },
  { name: "Salesforce", icon: SiSalesforce },
  { name: "Oracle", icon: SiOracle },
  { name: "Mews", icon: MewsIcon, wide: true },
  { name: "Cloudbeds", icon: CloudbedsIcon },
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
    <section id="trust" className="relative py-16 overflow-hidden border-t border-white/5 data-grid">
      <div className="container mx-auto px-4 sm:px-6">
        {/* Integration belt */}
        <div className="mb-12 md:mb-20">
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center text-sm font-mono text-slate-500 uppercase tracking-[0.2em] mb-10"
          >
            Integrates with your stack
          </motion.p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-8 md:gap-x-14">
            {integrations.map((item, index) => {
              const Icon = item.icon
              return (
                <motion.div
                  key={item.name}
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.04 }}
                  className="flex flex-col items-center gap-2.5 group cursor-default"
                >
                  <Icon className={`${item.wide ? "h-5 w-auto max-w-[5rem]" : "h-7 w-7"} text-slate-600 group-hover:text-white transition-colors duration-300`} />
                  <span className="text-[10px] font-mono text-slate-600 group-hover:text-slate-400 tracking-wider uppercase transition-colors duration-300">
                    {item.name}
                  </span>
                </motion.div>
              )
            })}
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: integrations.length * 0.04 }}
              className="flex flex-col items-center gap-2.5 group cursor-default"
            >
              <div className="h-7 w-7 rounded-full border border-dashed border-slate-600 group-hover:border-white flex items-center justify-center transition-colors duration-300">
                <Plus className="h-4 w-4 text-slate-600 group-hover:text-white transition-colors duration-300" />
              </div>
              <span className="text-[10px] font-mono text-slate-600 group-hover:text-slate-400 tracking-wider uppercase transition-colors duration-300">
                & More
              </span>
            </motion.div>
          </div>
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5 }}
            className="text-center text-xs text-slate-500 mt-6"
          >
            Don&apos;t see your stack? We integrate with any PSP, PMS, or platform you need.
          </motion.p>
        </div>

        <div className="max-w-6xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-8 md:mb-12">
            <h3 className="text-3xl md:text-4xl font-bold mb-4 font-display">
              Security, governance, and <span className="text-gradient">auditability</span>
            </h3>
            <p className="text-slate-400 text-lg max-w-xl mx-auto">
              Enterprise compliance plus operational integrity for revenue-critical workflows.
            </p>
          </motion.div>

          {/* Trust grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {operationalTrust.map((item, i) => {
              const Icon = item.icon
              return (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className={`flex items-start gap-4 p-5 rounded-xl border border-white/8 bg-white/[0.02] transition-all hover:bg-white/[0.04]${i === 0 ? " md:col-span-2 border-l-2 border-l-cyan-500/40" : ""}`}
                >
                  <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
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
