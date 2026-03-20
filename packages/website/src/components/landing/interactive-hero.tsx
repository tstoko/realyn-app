import { useRef } from "react"
import { motion, useScroll, useTransform } from "framer-motion"
import { Button } from "@realyn/shared"
import { ArrowRightIcon } from "@radix-ui/react-icons"
import { LiveDataCounter } from "./LiveDataCounter"

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

  return (
    <section
      ref={containerRef}
      className="relative min-h-[100svh] flex flex-col justify-center overflow-hidden"
    >
      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent" />

      <motion.div
        className="container mx-auto px-4 sm:px-6 relative z-10 pt-32 pb-20"
        style={{ opacity: heroOpacity, y: heroY, scale: heroScale }}
      >
        <div className="max-w-5xl mx-auto">
          {/* Headline */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          >
            <h1 className="font-display font-bold leading-[0.92] tracking-tight">
              <span className="block text-4xl sm:text-5xl md:text-7xl lg:text-[5.5rem] text-white">
                Chargeback Operations,
              </span>
              <span className="block text-4xl sm:text-5xl md:text-7xl lg:text-[5.5rem] text-cyan-400 mt-1">
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
                className="h-14 px-10 text-base bg-cyan-500 text-black hover:bg-cyan-400 rounded-sm font-semibold tracking-wide tech-glow transition-all z-10 w-full sm:w-auto"
              >
                {buttonText}
                <ArrowRightIcon className="ml-2 w-5 h-5" />
              </Button>
            ) : (
              <Button
                asChild
                size="lg"
                className="h-14 px-10 text-base bg-cyan-500 text-black hover:bg-cyan-400 rounded-sm font-semibold tracking-wide tech-glow transition-all z-10 w-full sm:w-auto"
              >
                <a href="/contact">
                  {buttonText}
                  <ArrowRightIcon className="ml-2 w-5 h-5" />
                </a>
              </Button>
            )}
            <a
              href="#how-it-works"
              className="inline-flex items-center justify-center h-14 px-8 text-base text-slate-300 hover:text-white border border-slate-700 hover:border-slate-500 rounded-sm font-medium tracking-wide transition-all group w-full sm:w-auto"
            >
              See the workflow
              <ArrowRightIcon className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
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
