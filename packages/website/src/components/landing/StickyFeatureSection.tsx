import { useRef } from "react"
import { motion, useScroll, useTransform } from "framer-motion"
import { Shield, FileText, CheckCircle, Clock, TrendingUp, User } from "lucide-react"
import { EditorialSectionHeader } from "./EditorialSectionHeader"

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
    <div className="relative w-full aspect-[4/3] bg-slate-950 border border-white/10 rounded-none overflow-hidden">
      {/* Subtle tech background */}
      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.15) 1px, transparent 0)', backgroundSize: '24px 24px' }} />
      
      <div className="relative p-6 h-full flex flex-col">
        {/* Header / Status Bar */}
        <div className="flex justify-between items-center mb-6 pb-4 border-b border-white/10 font-mono text-[10px] uppercase tracking-widest text-slate-500">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse" />
            <span>System Active</span>
          </div>
          <span>realyn_ops_terminal_v1.2</span>
        </div>
        {/* Stage 1: Dispute Intake */}
        {activeIndex === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex-1 grid grid-cols-[1fr_2fr] gap-6"
          >
            {/* Left: Live Feed */}
            <div className="border-r border-white/10 pr-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-slate-950 to-transparent z-10" />
              <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-slate-950 to-transparent z-10" />
              <motion.div 
                animate={{ y: [0, -100] }}
                transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                className="space-y-3 font-mono text-[8px] text-slate-600 opacity-50"
              >
                {[...Array(10)].map((_, i) => (
                  <div key={i}>
                    <div>{`[${new Date().toISOString().split('T')[1].slice(0, 8)}] RECV POST /webhook`}</div>
                    <div>{`> evt_3L9x${Math.floor(Math.random()*10000)}... status: ignored`}</div>
                  </div>
                ))}
              </motion.div>
            </div>

            {/* Right: Match Details */}
            <div className="flex flex-col justify-center">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="border border-cyan-500/30 bg-cyan-500/[0.02] p-5 relative"
              >
                <div className="absolute -top-px -left-px w-2 h-2 border-t border-l border-cyan-400" />
                <div className="absolute -top-px -right-px w-2 h-2 border-t border-r border-cyan-400" />
                <div className="absolute -bottom-px -left-px w-2 h-2 border-b border-l border-cyan-400" />
                <div className="absolute -bottom-px -right-px w-2 h-2 border-b border-r border-cyan-400" />
                
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2 text-cyan-400">
                    <Shield className="w-4 h-4" />
                    <span className="font-mono text-[10px] uppercase tracking-widest animate-pulse">Target Locked</span>
                  </div>
                  <span className="font-mono text-[10px] text-slate-500">Confidence: <span className="text-emerald-400">99.8%</span></span>
                </div>

                <div className="space-y-3 font-mono text-xs">
                  <div>
                    <div className="text-slate-500 text-[10px] uppercase mb-1">Dispute ID</div>
                    <div className="text-white text-lg">dp_1MowQ...</div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-3 border-t border-white/10">
                    <div>
                      <div className="text-slate-500 text-[10px] uppercase mb-1">Amount</div>
                      <div className="text-cyan-400">$487.50</div>
                    </div>
                    <div>
                      <div className="text-slate-500 text-[10px] uppercase mb-1">Reason</div>
                      <div className="text-white truncate">13.1 - Not Received</div>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-white/10 flex justify-between items-center">
                    <span className="text-slate-500 text-[10px] uppercase">SLA Deadline</span>
                    <span className="text-amber-400">6d 14h 22m</span>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}

        {/* Stage 2: Evidence Assembly */}
        {activeIndex === 1 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex-1 flex flex-col justify-center"
          >
            <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-4">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-purple-400" />
                <span className="font-mono text-[10px] uppercase tracking-widest text-white">Compiling Evidence</span>
              </div>
              <span className="font-mono text-[10px] text-purple-400">94% COMPLETE</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { name: "Transaction Record", hash: "0x8f...3a2", status: "VERIFIED", color: "text-emerald-400" },
                { name: "Customer Comms", hash: "0x2b...9c1", status: "VERIFIED", color: "text-emerald-400" },
                { name: "Service Agreement", hash: "0x7d...4e5", status: "VERIFIED", color: "text-emerald-400" },
                { name: "3DS Auth Data", hash: "pending...", status: "FETCHING", color: "text-amber-400" },
              ].map((item, i) => (
                <motion.div
                  key={item.name}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.15 }}
                  className="p-3 border border-white/5 bg-white/[0.02] font-mono"
                >
                  <div className="text-white text-xs mb-2 truncate">{item.name}</div>
                  <div className="flex justify-between items-end">
                    <div className="text-[8px] text-slate-500">
                      <div>HASH</div>
                      <div>{item.hash}</div>
                    </div>
                    <div className={`text-[8px] uppercase tracking-wider ${item.color}`}>
                      {item.status}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
            
            {/* Technical progress bar */}
            <div className="mt-6 space-y-1">
              <div className="flex justify-between text-[8px] font-mono text-slate-500">
                <span>[||||||||||||||||||||||||||||||||||||||||||||||  ]</span>
                <span>4/5 NODES</span>
              </div>
            </div>
          </motion.div>
        )}

        {/* Stage 3: Review and Submit */}
        {activeIndex === 2 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex-1 grid grid-cols-[3fr_2fr] gap-6"
          >
            {/* Left: AI Draft */}
            <div className="border-r border-white/10 pr-6 flex flex-col justify-center">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span className="font-mono text-[10px] uppercase tracking-widest text-white">Generated Response</span>
              </div>
              <div className="font-mono text-[10px] text-slate-400 leading-relaxed space-y-2 bg-white/[0.02] border border-white/5 p-4 relative">
                <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-emerald-500/50 to-transparent" />
                <p>{"{"}</p>
                <p className="pl-4">"argument": "The customer claims the merchandise was not received. However, we have attached tracking information showing delivery to the billing address...",</p>
                <p className="pl-4">"attachments": ["tracking_proof.pdf", "tos_agreed.pdf"]</p>
                <p>{"}"}</p>
              </div>
            </div>

            {/* Right: Execution Metadata */}
            <div className="flex flex-col justify-center font-mono text-[10px] space-y-6">
              <div>
                <div className="text-slate-500 uppercase mb-1">Execution Status</div>
                <div className="text-emerald-400 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                  SUBMITTED
                </div>
              </div>
              
              <div>
                <div className="text-slate-500 uppercase mb-1">Processor Receipt</div>
                <div className="text-white truncate">dp_3R4xK9...mNq</div>
              </div>

              <div>
                <div className="text-slate-500 uppercase mb-1">Win Probability</div>
                <div className="text-emerald-400 text-2xl font-display">94.2%</div>
              </div>

              <div className="pt-4 border-t border-white/10">
                <div className="text-slate-500 uppercase mb-1">Authorized By</div>
                <div className="text-white flex items-center gap-2">
                  <User className="w-3 h-3 text-slate-400" />
                  Sarah M. (Auto-Rule #4)
                </div>
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
          <EditorialSectionHeader
            number="03"
            label="WORKFLOW"
            title="The dispute workflow"
            subtitle="Three seamless stages to protect your revenue"
          />
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            {/* Left: Dashboard mockup (desktop only) */}
            <div className="relative order-2 lg:order-1 hidden lg:block">
              <DashboardMockup progress={scrollYProgress.get()} />
            </div>

            {/* Right: Feature steps */}
            <div className="order-1 lg:order-2 space-y-8">
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
                      className={`p-4 sm:p-6 rounded-none border ${bgColor} ${borderColor} transition-all duration-300`}
                    >
                      <div className="flex items-start gap-3 sm:gap-4">
                        <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-none border ${borderColor} flex items-center justify-center flex-shrink-0`}>
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
