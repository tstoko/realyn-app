import { motion } from "framer-motion"
import { Building2, RefreshCw, ShoppingCart, CreditCard } from "lucide-react"

export function UseCaseCards() {
  const segments = [
    {
      icon: Building2,
      segment: "Hospitality",
      title: "PMS-Connected Defense",
      description: "Guest disputes matched to PMS folio data. Check-in logs, signed agreements, and service records assembled automatically.",
      color: "cyan",
    },
    {
      icon: RefreshCw,
      segment: "Subscriptions & SaaS",
      title: "Recurring Billing Defense",
      description: "Recurring billing disputes countered with usage logs, cancellation policy evidence, and communication history.",
      color: "purple",
    },
    {
      icon: ShoppingCart,
      segment: "E-Commerce & Marketplaces",
      title: "Order-Level Evidence",
      description: "Shipping confirmations, delivery proofs, and refund policy documentation compiled per order.",
      color: "emerald",
    },
    {
      icon: CreditCard,
      segment: "Card-Not-Present",
      title: "Authentication Evidence",
      description: "3DS authentication records, AVS/CVV verification, and IP geolocation evidence packaged for issuer review.",
      color: "amber",
    },
  ]

  const colorMap: Record<string, { bg: string; border: string; text: string; iconBg: string }> = {
    cyan: { bg: "bg-cyan-500/5", border: "border-cyan-500/15", text: "text-cyan-400", iconBg: "bg-cyan-500/10" },
    purple: { bg: "bg-purple-500/5", border: "border-purple-500/15", text: "text-purple-400", iconBg: "bg-purple-500/10" },
    emerald: { bg: "bg-emerald-500/5", border: "border-emerald-500/15", text: "text-emerald-400", iconBg: "bg-emerald-500/10" },
    amber: { bg: "bg-amber-500/5", border: "border-amber-500/15", text: "text-amber-400", iconBg: "bg-amber-500/10" },
  }

  return (
    <section className="relative">
      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-10 md:mb-16">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 font-display text-balance">
            Configured for your <span className="text-gradient">dispute model</span>
          </h2>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto">
            Industry-specific evidence strategies, not generic templates
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-5 max-w-5xl mx-auto">
          {segments.map((seg, index) => {
            const Icon = seg.icon
            const colors = colorMap[seg.color]
            return (
              <motion.div
                key={seg.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.08 }}
                className={`group relative p-5 sm:p-8 md:p-10 rounded-2xl border ${colors.border} bg-white/[0.02] hover:bg-white/[0.05] transition-all duration-300`}
              >
                <div className="relative z-10">
                  <div className="flex items-start gap-4 mb-5">
                    <div className={`w-12 h-12 rounded-xl ${colors.iconBg} border ${colors.border} flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`w-6 h-6 ${colors.text}`} />
                    </div>
                    <div>
                      <div className={`text-xs font-mono ${colors.text} mb-1 tracking-wider uppercase`}>
                        {seg.segment}
                      </div>
                      <h3 className="text-xl font-bold text-white">
                        {seg.title}
                      </h3>
                    </div>
                  </div>

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
