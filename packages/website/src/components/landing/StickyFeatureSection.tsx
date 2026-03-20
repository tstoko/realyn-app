import { useRef } from "react"
import { motion, useScroll, useTransform } from "framer-motion"
import { Shield, FileText, CheckCircle, Clock, TrendingUp, User } from "lucide-react"

interface Feature {
  id: string
  title: string
  description: string
  icon: React.ElementType
  color: string
}

const features: Feature[] = [
  {
    id: "intake",
    title: "Dispute Intake",
    description: "Instantly detect and categorize incoming disputes the moment they arrive. The system identifies the reason code, matches it to your transaction data, and prioritizes based on deadline and recovery potential.",
    icon: Shield,
    color: "cyan",
  },
  {
    id: "evidence",
    title: "Evidence Assembly",
    description: "Automatically gather and compile relevant evidence from your business systems — transaction records, customer communications, authentication data, and supporting documents. Everything organized and scored for completeness.",
    icon: FileText,
    color: "purple",
  },
  {
    id: "submit",
    title: "Review and Submit",
    description: "Review the AI-generated response, approve evidence, and submit directly to your processor with a full audit trail.",
    icon: CheckCircle,
    color: "emerald",
  },
]

function DashboardMockup({ progress }: { progress: number }) {
  const activeIndex = Math.min(Math.floor(progress * 3), 2)

  return (
    <div className="relative w-full aspect-[4/3] glass-intense rounded-2xl overflow-hidden">
      {/* Window chrome */}
      <div className="absolute top-0 left-0 right-0 h-12 bg-slate-900/50 border-b border-white/5 flex items-center px-4 gap-2">
        <div className="w-3 h-3 rounded-full bg-red-500/60" />
        <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
        <div className="w-3 h-3 rounded-full bg-green-500/60" />
        <span className="ml-4 text-xs text-slate-500 font-mono">realyn.app/dashboard</span>
      </div>

      <div className="pt-16 px-6 pb-6 h-full">
        {/* Stage 1: Dispute Intake */}
        {activeIndex === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <motion.div
              animate={{ scale: [1, 1.01, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                    <Shield className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">New Dispute Detected</div>
                    <div className="text-xs text-slate-400">$487.50 &middot; Transaction #TXN-78234</div>
                  </div>
                </div>
                <span className="px-2 py-1 bg-cyan-500/20 text-cyan-400 text-xs rounded-full font-mono">Processing</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-900/50 rounded-md p-2">
                  <span className="text-slate-500 block">Reason Code</span>
                  <span className="text-white font-mono">13.1 — Merchandise Not Received</span>
                </div>
                <div className="bg-slate-900/50 rounded-md p-2">
                  <span className="text-slate-500 block">Match Confidence</span>
                  <span className="text-emerald-400 font-semibold">High — 96%</span>
                </div>
              </div>
            </motion.div>

            <div className="flex items-center justify-between bg-white/5 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-slate-400">SLA Deadline</span>
              </div>
              <span className="text-xs font-mono text-amber-400">6d 14h remaining</span>
            </div>

            {[1, 2].map((i) => (
              <div key={i} className="h-10 bg-white/[0.03] rounded-lg border border-white/5" />
            ))}
          </motion.div>
        )}

        {/* Stage 2: Evidence Assembly */}
        {activeIndex === 1 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-slate-400">Assembling Evidence</span>
              <span className="text-xs font-mono text-purple-400">94% complete</span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mb-4">
              <motion.div
                className="h-full bg-gradient-to-r from-purple-500 to-cyan-500 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: "94%" }}
                transition={{ duration: 1.5 }}
              />
            </div>

            {[
              { name: "Transaction Record", size: "2.4 KB", status: "Collected" },
              { name: "Customer Communication", size: "8.1 KB", status: "Collected" },
              { name: "Service Agreement", size: "124 KB", status: "Collected" },
              { name: "3DS Authentication", size: "1.2 KB", status: "Collected" },
            ].map((item, i) => (
              <motion.div
                key={item.name}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.15 }}
                className="flex items-center gap-3 py-2 px-3 bg-white/[0.03] rounded-lg border border-white/5"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: i * 0.15 + 0.1 }}
                >
                  <CheckCircle className="w-4 h-4 text-purple-400" />
                </motion.div>
                <span className="text-sm text-white flex-1">{item.name}</span>
                <span className="text-xs text-slate-500 font-mono">{item.size}</span>
                <span className="text-xs text-emerald-400">{item.status}</span>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Stage 3: Review and Submit */}
        {activeIndex === 2 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="h-full flex flex-col items-center justify-center text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
              className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mb-4"
            >
              <CheckCircle className="w-8 h-8 text-emerald-400" />
            </motion.div>
            <div className="text-lg font-semibold text-white mb-1">Response Submitted</div>
            <div className="text-sm text-slate-400 mb-4">Dispute #78234 &middot; $487.50</div>

            <div className="space-y-2 text-xs w-full max-w-xs">
              <div className="flex items-center justify-between py-2 px-3 bg-white/[0.03] rounded-lg border border-white/5">
                <span className="text-slate-500">Processor Receipt</span>
                <span className="text-white font-mono">dp_3R4xK9...mNq</span>
              </div>
              <div className="flex items-center justify-between py-2 px-3 bg-white/[0.03] rounded-lg border border-white/5">
                <div className="flex items-center gap-1.5">
                  <User className="w-3 h-3 text-slate-500" />
                  <span className="text-slate-500">Reviewed by</span>
                </div>
                <span className="text-white">Sarah M.</span>
              </div>
              <div className="flex items-center justify-between py-2 px-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-3 h-3 text-emerald-400" />
                  <span className="text-emerald-400">Win probability</span>
                </div>
                <span className="text-emerald-400 font-semibold">94%</span>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}

export function StickyFeatureSection() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  })

  return (
    <section ref={containerRef} className="relative">
      <div className="flex items-center py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            {/* Left: Dashboard mockup (desktop only) */}
            <div className="relative order-2 lg:order-1 hidden lg:block">
              <DashboardMockup progress={scrollYProgress.get()} />
              <div className="absolute -inset-10 bg-gradient-to-r from-cyan-500/10 via-purple-500/10 to-emerald-500/10 rounded-3xl blur-3xl -z-10 opacity-40" />
            </div>

            {/* Right: Feature steps */}
            <div className="order-1 lg:order-2 space-y-8">
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
              >
                <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 font-display">
                  The dispute workflow
                </h2>
                <p className="text-slate-400 text-base sm:text-lg">
                  Three seamless stages to protect your revenue
                </p>
              </motion.div>

              <div className="space-y-4 sm:space-y-6">
                {features.map((feature, index) => {
                  const Icon = feature.icon
                  const colorClasses = {
                    cyan: "bg-cyan-500/10 border-cyan-500/20 text-cyan-400",
                    purple: "bg-purple-500/10 border-purple-500/20 text-purple-400",
                    emerald: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
                  }
                  const colors = colorClasses[feature.color as keyof typeof colorClasses]
                  const [bgColor, borderColor, textColor] = colors.split(' ')

                  return (
                    <motion.div
                      key={feature.id}
                      initial={{ opacity: 0, x: 20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.5, delay: index * 0.1 }}
                      className={`p-4 sm:p-6 rounded-xl border ${bgColor} ${borderColor} transition-all duration-300`}
                    >
                      <div className="flex items-start gap-3 sm:gap-4">
                        <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl ${bgColor} flex items-center justify-center flex-shrink-0`}>
                          <Icon className={`w-5 h-5 sm:w-6 sm:h-6 ${textColor}`} />
                        </div>
                        <div>
                          <h3 className="text-lg sm:text-xl font-semibold text-white mb-2">
                            {index + 1}. {feature.title}
                          </h3>
                          <p className="text-slate-400 text-sm leading-relaxed">
                            {feature.description}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
