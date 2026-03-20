import { motion } from "framer-motion"
import { Clock, Sparkles, TrendingUp, CheckCircle2 } from "lucide-react"

interface StatItemProps {
  icon: React.ElementType
  value: string
  label: string
  delay?: number
}

function StatItem({ icon: Icon, value, label, delay = 0 }: StatItemProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex items-center gap-3 px-5 py-3"
    >
      <Icon className="w-4 h-4 text-cyan-400 flex-shrink-0" />
      <div>
        <div className="text-xl md:text-2xl font-bold text-white tabular-nums leading-tight">{value}</div>
        <div className="text-xs text-slate-500 uppercase tracking-wider">{label}</div>
      </div>
    </motion.div>
  )
}

export function LiveDataCounter() {
  const stats = [
    { icon: Clock, value: "< 5 min", label: "AI evidence assembly" },
    { icon: Sparkles, value: "AI", label: "Review pipeline" },
    { icon: TrendingUp, value: "Direct", label: "Processor submission" },
    { icon: CheckCircle2, value: "Full", label: "Decision audit trail" },
  ]

  return (
    <div className="flex flex-wrap gap-2 md:gap-0 md:divide-x md:divide-white/10">
      {stats.map((stat, i) => (
        <StatItem
          key={stat.label}
          icon={stat.icon}
          value={stat.value}
          label={stat.label}
          delay={0.8 + i * 0.1}
        />
      ))}
    </div>
  )
}
