import React from "react"

interface EditorialSectionHeaderProps {
  number: string
  label: string
  title: string
  subtitle?: string
}

export function EditorialSectionHeader({ number, label, title, subtitle }: EditorialSectionHeaderProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8 border-t border-white/10 pt-8 md:pt-12 mb-10 md:mb-16">
      <div className="md:col-span-3 font-mono text-slate-500 text-sm tracking-widest">
        {number}
      </div>
      <div className="md:col-span-9">
        <div className="font-mono text-cyan-400 text-sm uppercase tracking-[0.2em] mb-4">
          {label}
        </div>
        <h2 className="font-display text-4xl md:text-6xl leading-tight text-white mb-4">
          {title}
        </h2>
        {subtitle && (
          <p className="text-slate-400 text-lg max-w-2xl">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  )
}
