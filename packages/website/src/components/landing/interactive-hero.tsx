import { useRef } from "react"
import { motion, useScroll, useTransform } from "framer-motion"
import { Button } from "@realyn/shared"
import { LiveDataCounter } from "./LiveDataCounter"
import { ShootingStarsBackground } from "./ShootingStarsBackground"

interface InteractiveHeroProps {
  onButtonClick?: () => void
  buttonText?: string
}

export function InteractiveHero({ onButtonClick, buttonText = "Book a live walkthrough" }: InteractiveHeroProps) {
  const containerRef = useRef<HTMLElement>(null)
  const { scrollY } = useScroll()

  const heroOpacity = useTransform(scrollY, [0, 600], [1, 0])
  const heroY = useTransform(scrollY, [0, 600], [0, 150])
  const heroScale = useTransform(scrollY, [0, 600], [1, 0.95])
  const bgY = useTransform(scrollY, [0, 1000], [0, 300])

  return (
    <section
      ref={containerRef}
      className="relative min-h-[100svh] flex flex-col justify-center overflow-hidden bg-black"
    >
      {/* Background Layer */}
      <motion.div 
        className="absolute inset-0 z-0 overflow-hidden h-[120svh] -top-[10svh]"
        style={{ y: bgY }}
      >
        <ShootingStarsBackground />
        {/* Radial gradient vignette for text contrast */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.7)_100%)] pointer-events-none" />
      </motion.div>

      <div className="absolute bottom-0 left-0 right-0 h-px bg-white/10 z-10" />

      <motion.div
        className="container mx-auto px-4 sm:px-6 relative z-10 pt-32 pb-20"
        style={{ opacity: heroOpacity, y: heroY, scale: heroScale }}
      >
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="font-mono text-cyan-400 text-sm uppercase tracking-[0.2em] mb-10"
          >
            01 — MEET REALYN
          </motion.div>
          {/* Headline */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <h1 className="font-display font-bold leading-[1.25] tracking-tight">
              <span className="block text-4xl sm:text-5xl md:text-7xl lg:text-[5.5rem] text-white">
                Chargeback Operations,
              </span>
              <span className="block text-4xl sm:text-5xl md:text-7xl lg:text-[5.5rem] text-cyan-400 mt-6">
                Automated.
              </span>
            </h1>
          </motion.div>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.35 }}
            className="mt-8 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-4"
          >
            {onButtonClick ? (
              <Button
                onClick={onButtonClick}
                size="lg"
                className="rounded-none font-mono text-xs uppercase tracking-[0.2em] px-8 py-4 bg-white text-black hover:bg-cyan-400 transition-colors z-10 w-full sm:w-auto"
              >
                {buttonText}
              </Button>
            ) : (
              <Button
                asChild
                size="lg"
                className="rounded-none font-mono text-xs uppercase tracking-[0.2em] px-8 py-4 bg-white text-black hover:bg-cyan-400 transition-colors z-10 w-full sm:w-auto"
              >
                <a href="/contact">
                  {buttonText}
                </a>
              </Button>
            )}
            <a
              href="#how-it-works"
              className="inline-flex items-center justify-center rounded-none font-mono text-xs uppercase tracking-widest text-slate-400 hover:text-white border border-white/20 hover:border-white/40 px-6 py-4 transition-colors w-full sm:w-auto"
            >
              See the workflow
            </a>
          </motion.div>

          {/* Stats Strip */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.7 }}
            className="mt-10 md:mt-16"
          >
            <LiveDataCounter />
          </motion.div>
        </div>
      </motion.div>
    </section>
  )
}
