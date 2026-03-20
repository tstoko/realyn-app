import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"

interface Particle {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
  life: number
  maxLife: number
}

interface ButtonParticlesProps {
  isHovered: boolean
  isClicked: boolean
}

const colors = ["#00e5ff", "#a855f7", "#ffffff"]

export function ButtonParticles({ isHovered, isClicked }: ButtonParticlesProps) {
  const [particles, setParticles] = useState<Particle[]>([])
  const particleIdRef = useRef(0)
  const hoverIntervalRef = useRef<NodeJS.Timeout>(null as unknown as NodeJS.Timeout)

  // Hover effect - continuous subtle particles
  useEffect(() => {
    if (isHovered) {
      hoverIntervalRef.current = setInterval(() => {
        const newParticles: Particle[] = []
        const particleCount = 3 + Math.floor(Math.random() * 3) // 3-5 particles

        for (let i = 0; i < particleCount; i++) {
          newParticles.push({
            id: particleIdRef.current++,
            x: 50 + (Math.random() - 0.5) * 20, // Center of button with slight variation
            y: 50 + (Math.random() - 0.5) * 10,
            vx: (Math.random() - 0.5) * 0.5, // Slow horizontal drift
            vy: -0.5 - Math.random() * 0.5, // Upward float
            size: 4 + Math.random() * 4, // 4-8px
            color: colors[Math.floor(Math.random() * colors.length)],
            life: 1,
            maxLife: 1,
          })
        }

        setParticles((prev) => {
          const combined = [...prev, ...newParticles]
          // Limit to 20 particles max
          return combined.slice(-20)
        })
      }, 200) // Spawn every 200ms
    } else {
      if (hoverIntervalRef.current) {
        clearInterval(hoverIntervalRef.current)
      }
    }

    return () => {
      if (hoverIntervalRef.current) {
        clearInterval(hoverIntervalRef.current)
      }
    }
  }, [isHovered])

  // Click effect - dramatic explosion
  useEffect(() => {
    if (isClicked) {
      const newParticles: Particle[] = []
      const particleCount = 15 + Math.floor(Math.random() * 6) // 15-20 particles

      for (let i = 0; i < particleCount; i++) {
        const angle = (Math.PI * 2 * i) / particleCount + Math.random() * 0.5
        const speed = 1 + Math.random() * 1.5 // 1-2.5 speed
        newParticles.push({
          id: particleIdRef.current++,
          x: 50, // Center of button
          y: 50,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: 5 + Math.random() * 3, // 5-8px
          color: colors[Math.floor(Math.random() * colors.length)],
          life: 1,
          maxLife: 1,
        })
      }

      setParticles((prev) => {
        const combined = [...prev, ...newParticles]
        return combined.slice(-20) // Limit to 20 particles max
      })
    }
  }, [isClicked])

  // Animate and cleanup particles
  useEffect(() => {
    const interval = setInterval(() => {
      setParticles((prev) => {
        return prev
          .map((p) => ({
            ...p,
            x: p.x + p.vx,
            y: p.y + p.vy,
            life: Math.max(0, p.life - 0.02), // Fade out
          }))
          .filter((p) => p.life > 0) // Remove dead particles
      })
    }, 16) // ~60fps

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="absolute inset-0 pointer-events-none overflow-visible" style={{ zIndex: 0 }}>
      <AnimatePresence>
        {particles.map((particle) => (
          <motion.div
            key={particle.id}
            className="absolute rounded-full"
            style={{
              left: `${particle.x}%`,
              top: `${particle.y}%`,
              width: `${particle.size}px`,
              height: `${particle.size}px`,
              backgroundColor: particle.color,
              opacity: particle.life * 0.8,
              boxShadow: `0 0 ${particle.size * 2}px ${particle.color}`,
              transform: "translate(-50%, -50%)",
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              scale: 1,
              opacity: particle.life * 0.8,
            }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}

