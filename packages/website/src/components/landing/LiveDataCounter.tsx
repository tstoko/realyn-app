import { motion } from "framer-motion"

interface StatItemProps {
  value: string
  label: string
  delay?: number
}

function StatItem({ value, label, delay = 0 }: StatItemProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex flex-col px-5 py-3 font-mono"
    >
      <div className="font-mono text-xl md:text-2xl font-bold text-white tabular-nums leading-tight antialiased">{value}</div>
      <div className="font-mono text-xs text-slate-500 uppercase tracking-widest">{label}</div>
    </motion.div>
  )
}

export function LiveDataCounter() {
  const stats = [
    { value: "< 5 min", label: "AI evidence assembly" },
    { value: "AI", label: "Review pipeline" },
    { value: "Direct", label: "Processor submission" },
    { value: "Full", label: "Decision audit trail" },
  ]

  return (
    <div className="flex flex-wrap gap-2 md:gap-0 md:divide-x md:divide-white/10">
      {stats.map((stat, i) => (
        <StatItem
          key={stat.label}
          value={stat.value}
          label={stat.label}
          delay={0.8 + i * 0.1}
        />
      ))}
    </div>
  )
}
