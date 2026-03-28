import { motion } from "framer-motion"
import { Building2, RefreshCw, ShoppingCart, CreditCard } from "lucide-react"
import { EditorialSectionHeader } from "./EditorialSectionHeader"

export function UseCaseCards() {
  const segments = [
    {
      icon: Building2,
      segment: "Hospitality",
      title: "PMS-Connected Defense",
      description: "Guest disputes matched to PMS folio data. Check-in logs, signed agreements, and service records assembled automatically.",
    },
    {
      icon: RefreshCw,
      segment: "Subscriptions & SaaS",
      title: "Recurring Billing Defense",
      description: "Recurring billing disputes countered with usage logs, cancellation policy evidence, and communication history.",
    },
    {
      icon: ShoppingCart,
      segment: "E-Commerce & Marketplaces",
      title: "Order-Level Evidence",
      description: "Shipping confirmations, delivery proofs, and refund policy documentation compiled per order.",
    },
    {
      icon: CreditCard,
      segment: "Card-Not-Present",
      title: "Authentication Evidence",
      description: "3DS authentication records, AVS/CVV verification, and IP geolocation evidence packaged for issuer review.",
    },
  ]

  return (
    <section className="relative border-t border-white/10">
      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        <EditorialSectionHeader
          number="04"
          label="SEGMENTS"
          title="Configured for your dispute model"
          subtitle="Industry-specific evidence strategies, not generic templates"
        />

        <div className="max-w-5xl mx-auto border-y border-white/10 divide-y divide-white/10">
          {segments.map((seg, index) => {
            const Icon = seg.icon
            return (
              <motion.div
                key={seg.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.08 }}
                className="py-8 md:py-10 flex flex-col sm:flex-row gap-6 hover:bg-white/[0.02] transition-colors"
              >
                <div className="w-12 h-12 rounded-none border border-white/10 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-6 h-6 text-cyan-400" />
                </div>
                <div className="flex-1">
                  <div className="text-xs font-mono text-cyan-400 mb-1 tracking-widest uppercase">
                    {seg.segment}
                  </div>
                  <h3 className="text-xl font-bold text-white font-display mb-3">
                    {seg.title}
                  </h3>
                  <p className="text-slate-400 leading-relaxed">{seg.description}</p>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
