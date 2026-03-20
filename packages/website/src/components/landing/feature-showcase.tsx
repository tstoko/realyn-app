import { Webhook, Tags, FileStack, Send } from "lucide-react"
import { motion } from "framer-motion"
import { ScrollRevealSection } from "./ScrollRevealSection"

interface PipelineStage {
  icon: React.ElementType
  title: string
  description: string
  input: string
  output: string
  color: string
}

const stages: PipelineStage[] = [
  {
    icon: Webhook,
    title: "Ingest",
    description: "Disputes detected from PSP webhooks in real time",
    input: "Stripe / Adyen webhook",
    output: "Categorized dispute record",
    color: "cyan",
  },
  {
    icon: Tags,
    title: "Classify",
    description: "Reason code mapped, deadline set, evidence requirements identified",
    input: "Dispute record",
    output: "Evidence checklist + SLA timer",
    color: "purple",
  },
  {
    icon: FileStack,
    title: "Assemble",
    description: "Transaction data, communications, and documents compiled automatically",
    input: "Evidence checklist",
    output: "Evidence packet with confidence score",
    color: "emerald",
  },
  {
    icon: Send,
    title: "Submit",
    description: "AI-drafted response reviewed by your team, submitted to processor",
    input: "Evidence packet",
    output: "Processor confirmation",
    color: "amber",
  },
]

const colorMap: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  cyan: { bg: "bg-cyan-500/10", border: "border-cyan-500/20", text: "text-cyan-400", dot: "bg-cyan-400" },
  purple: { bg: "bg-purple-500/10", border: "border-purple-500/20", text: "text-purple-400", dot: "bg-purple-400" },
  emerald: { bg: "bg-emerald-500/10", border: "border-emerald-500/20", text: "text-emerald-400", dot: "bg-emerald-400" },
  amber: { bg: "bg-amber-500/10", border: "border-amber-500/20", text: "text-amber-400", dot: "bg-amber-400" },
}

function StageNode({ stage, index }: { stage: PipelineStage; index: number }) {
  const Icon = stage.icon
  const colors = colorMap[stage.color]

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.12 }}
      viewport={{ once: true }}
      className="relative flex-1"
    >
      <div className={`relative p-6 rounded-xl border ${colors.border} bg-white/[0.03] backdrop-blur-sm h-full transition-all hover:bg-white/[0.06] hover:border-opacity-40`}>
        {/* Step number + icon */}
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-10 h-10 rounded-lg ${colors.bg} flex items-center justify-center`}>
            <Icon className={`w-5 h-5 ${colors.text}`} />
          </div>
          <div>
            <span className="text-xs font-mono text-slate-500 uppercase tracking-wider">Step {index + 1}</span>
            <h3 className="text-lg font-bold text-white font-display">{stage.title}</h3>
          </div>
        </div>

        <p className="text-sm text-slate-400 leading-relaxed mb-4">{stage.description}</p>

        {/* Input / Output */}
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-600 font-mono w-8 flex-shrink-0">IN</span>
            <span className="text-slate-400">{stage.input}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`font-mono w-8 flex-shrink-0 ${colors.text}`}>OUT</span>
            <span className="text-slate-300">{stage.output}</span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export function FeatureShowcase() {
  return (
    <section className="relative overflow-hidden data-grid">
      <div className="container mx-auto px-4 sm:px-6">
        <ScrollRevealSection className="text-center mb-10 md:mb-16">
          <h2 className="text-4xl md:text-6xl font-bold mb-6 font-display">
            How the system works
          </h2>
          <p className="text-slate-400 max-w-2xl mx-auto text-xl">
            Four stages from dispute detection to processor submission
          </p>
        </ScrollRevealSection>

        {/* Pipeline */}
        <div className="max-w-7xl mx-auto">
          {/* Connection line (desktop) */}
          <div className="hidden md:block relative mb-8">
            <div className="absolute top-1/2 left-[10%] right-[10%] h-[1px] bg-gradient-to-r from-cyan-500/30 via-purple-500/30 to-amber-500/30" />
            <div className="flex justify-between px-[8%]">
              {stages.map((stage, i) => (
                <motion.div
                  key={stage.title}
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  transition={{ delay: i * 0.15, type: "spring", stiffness: 300 }}
                  viewport={{ once: true }}
                  className={`w-3 h-3 rounded-full ${colorMap[stage.color].dot} relative z-10`}
                />
              ))}
            </div>
          </div>

          {/* Stage cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {stages.map((stage, index) => (
              <StageNode key={stage.title} stage={stage} index={index} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
