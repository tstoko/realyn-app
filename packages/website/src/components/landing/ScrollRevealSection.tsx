import { useRef } from "react"
import { motion, useInView, useScroll, useTransform } from "framer-motion"

interface ScrollRevealSectionProps {
  children: React.ReactNode
  className?: string
  delay?: number
  direction?: "up" | "down" | "left" | "right"
  scale?: boolean
  blur?: boolean
  once?: boolean
}

export function ScrollRevealSection({
  children,
  className = "",
  delay = 0,
  direction = "up",
  scale = false,
  blur = false,
  once = true,
}: ScrollRevealSectionProps) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once, margin: "-100px" })

  const directionOffset = {
    up: { y: 60, x: 0 },
    down: { y: -60, x: 0 },
    left: { y: 0, x: 60 },
    right: { y: 0, x: -60 },
  }

  const offset = directionOffset[direction]

  return (
    <motion.div
      ref={ref}
      initial={{
        opacity: 0,
        y: offset.y,
        x: offset.x,
        scale: scale ? 0.95 : 1,
        filter: blur ? "blur(10px)" : "blur(0px)",
      }}
      animate={
        isInView
          ? {
              opacity: 1,
              y: 0,
              x: 0,
              scale: 1,
              filter: "blur(0px)",
            }
          : {
              opacity: 0,
              y: offset.y,
              x: offset.x,
              scale: scale ? 0.95 : 1,
              filter: blur ? "blur(10px)" : "blur(0px)",
            }
      }
      transition={{
        duration: 0.8,
        delay,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// Parallax wrapper for scroll-linked movement
interface ParallaxSectionProps {
  children: React.ReactNode
  className?: string
  speed?: number // -1 to 1, negative = opposite direction
  offset?: [number, number]
}

export function ParallaxSection({
  children,
  className = "",
  speed = 0.5,
  offset = [0, 300],
}: ParallaxSectionProps) {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  })

  const y = useTransform(scrollYProgress, [0, 1], [offset[0], offset[1] * speed])

  return (
    <motion.div ref={ref} style={{ y }} className={className}>
      {children}
    </motion.div>
  )
}

// Staggered children reveal
interface StaggerRevealProps {
  children: React.ReactNode[]
  className?: string
  staggerDelay?: number
  containerDelay?: number
}

export function StaggerReveal({
  children,
  className = "",
  staggerDelay = 0.1,
  containerDelay = 0,
}: StaggerRevealProps) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: "-50px" })

  return (
    <div ref={ref} className={className}>
      {children.map((child, index) => (
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{
            duration: 0.6,
            delay: containerDelay + index * staggerDelay,
            ease: [0.25, 0.46, 0.45, 0.94],
          }}
        >
          {child}
        </motion.div>
      ))}
    </div>
  )
}

// Fade section that responds to scroll position
interface ScrollFadeSectionProps {
  children: React.ReactNode
  className?: string
  fadeStart?: number // 0 to 1, when to start fading
  fadeEnd?: number // 0 to 1, when to be fully faded
}

export function ScrollFadeSection({
  children,
  className = "",
  fadeStart = 0.3,
  fadeEnd = 0.7,
}: ScrollFadeSectionProps) {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  })

  const opacity = useTransform(
    scrollYProgress,
    [0, fadeStart, fadeEnd, 1],
    [0, 1, 1, 0]
  )
  const y = useTransform(scrollYProgress, [0, fadeStart, fadeEnd, 1], [50, 0, 0, -50])
  const scale = useTransform(
    scrollYProgress,
    [0, fadeStart, fadeEnd, 1],
    [0.95, 1, 1, 0.95]
  )

  return (
    <motion.div ref={ref} style={{ opacity, y, scale }} className={className}>
      {children}
    </motion.div>
  )
}

