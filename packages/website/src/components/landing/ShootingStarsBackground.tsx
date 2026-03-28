import { useEffect, useRef } from 'react'

interface Star {
  x: number
  y: number
  vx: number
  vy: number
  length: number
  life: number
  maxLife: number
  opacity: number
}

export function ShootingStarsBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationFrameRef = useRef<number>(0)
  const starsRef = useRef<Star[]>([])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let width = window.innerWidth
    let height = window.innerHeight
    
    // Mouse parallax state
    let mouseX = width / 2
    let mouseY = height / 2
    let currentOffsetX = 0
    let currentOffsetY = 0
    const targetOffsetMultiplier = 0.03

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX
      mouseY = e.clientY
    }
    
    window.addEventListener('mousemove', handleMouseMove)

    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = width
      canvas.height = height
    }

    resize()
    window.addEventListener('resize', resize)

    if (prefersReducedMotion) {
      // Just draw a static dark background with some faint dots if reduced motion is preferred
      ctx.fillStyle = '#000000'
      ctx.fillRect(0, 0, width, height)
      
      ctx.fillStyle = 'rgba(6, 182, 212, 0.2)'
      for (let i = 0; i < 50; i++) {
        ctx.beginPath()
        ctx.arc(Math.random() * width, Math.random() * height, Math.random() * 1.5, 0, Math.PI * 2)
        ctx.fill()
      }
      return () => window.removeEventListener('resize', resize)
    }

    const spawnStar = () => {
      // Spawn from top or right edge to move diagonally down-left
      const isTop = Math.random() > 0.5
      
      let x, y
      if (isTop) {
        x = Math.random() * (width + height) // Allow spawning further right to cover the whole screen diagonally
        y = -50
      } else {
        x = width + 50
        y = Math.random() * height
      }

      // Speed: deliberate, very slow for a premium ambient feel
      const speed = 0.8 + Math.random() * 1.5
      // Direction: top-right to bottom-left (approx 45 degrees)
      const angle = Math.PI * 0.75 + (Math.random() * 0.05 - 0.025) // Very slight variation in angle
      const vx = Math.cos(angle) * speed
      const vy = Math.sin(angle) * speed

      const maxLife = 1.0 + Math.random() * 2.0
      
      starsRef.current.push({
        x,
        y,
        vx,
        vy,
        length: 150 + Math.random() * 200, // Very long tails
        life: maxLife,
        maxLife,
        opacity: 0.15 + Math.random() * 0.4 // Subtle opacity
      })
    }

    // Initial stars
    for (let i = 0; i < 15; i++) {
      spawnStar()
      // Fast forward their positions so they aren't all at the edge
      const star = starsRef.current[i]
      const advance = Math.random() * 800
      star.x += star.vx * advance
      star.y += star.vy * advance
    }

    const animate = () => {
      // Clear with a slight fade for a trailing effect, though we are drawing explicit tails
      ctx.clearRect(0, 0, width, height)

      // Calculate parallax offset
      const targetOffsetX = (mouseX - width / 2) * targetOffsetMultiplier
      const targetOffsetY = (mouseY - height / 2) * targetOffsetMultiplier
      
      // Lerp current offset towards target
      currentOffsetX += (targetOffsetX - currentOffsetX) * 0.05
      currentOffsetY += (targetOffsetY - currentOffsetY) * 0.05

      ctx.save()
      // Translate canvas for parallax effect
      // We draw slightly outside bounds so edges don't clip
      ctx.translate(currentOffsetX, currentOffsetY)

      // Draw faint data grid
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.03)'
      ctx.lineWidth = 1
      const gridSize = 50
      
      // Draw vertical lines (extended bounds for parallax)
      for (let x = -100; x <= width + 100; x += gridSize) {
        ctx.beginPath()
        ctx.moveTo(x, -100)
        ctx.lineTo(x, height + 100)
        ctx.stroke()
      }
      
      // Draw horizontal lines (extended bounds for parallax)
      for (let y = -100; y <= height + 100; y += gridSize) {
        ctx.beginPath()
        ctx.moveTo(-100, y)
        ctx.lineTo(width + 100, y)
        ctx.stroke()
      }

      // Optional: Draw some static faint stars for depth
      ctx.fillStyle = 'rgba(6, 182, 212, 0.1)'
      for (let i = 0; i < 50; i++) {
        // We use a pseudo-random based on index so they don't move
        const sx = (Math.sin(i * 123.45) * 0.5 + 0.5) * (width + 200) - 100
        const sy = (Math.cos(i * 321.12) * 0.5 + 0.5) * (height + 200) - 100
        ctx.beginPath()
        ctx.arc(sx, sy, 0.8, 0, Math.PI * 2)
        ctx.fill()
      }

      // Spawn new stars
      if (Math.random() < 0.015 && starsRef.current.length < 30) {
        spawnStar()
      }

      const stars = starsRef.current
      for (let i = stars.length - 1; i >= 0; i--) {
        const star = stars[i]
        
        star.x += star.vx
        star.y += star.vy
        star.life -= 0.005

        // Remove if off screen or dead
        if (
          star.life <= 0 || 
          star.x < -star.length - 100 || 
          star.y > height + star.length + 100
        ) {
          stars.splice(i, 1)
          continue
        }

        // Calculate tail end
        const tailX = star.x - (star.vx / Math.hypot(star.vx, star.vy)) * star.length
        const tailY = star.y - (star.vy / Math.hypot(star.vx, star.vy)) * star.length

        // Fade in/out based on life
        let currentOpacity = star.opacity
        if (star.life > star.maxLife - 0.2) {
          currentOpacity *= (star.maxLife - star.life) / 0.2 // Fade in
        } else if (star.life < 0.3) {
          currentOpacity *= star.life / 0.3 // Fade out
        }

        // Draw the tail (gradient)
        const grad = ctx.createLinearGradient(tailX, tailY, star.x, star.y)
        grad.addColorStop(0, 'rgba(6, 182, 212, 0)')
        grad.addColorStop(0.7, `rgba(6, 182, 212, ${currentOpacity * 0.3})`)
        grad.addColorStop(0.95, `rgba(6, 182, 212, ${currentOpacity * 0.8})`)
        grad.addColorStop(1, `rgba(255, 255, 255, ${currentOpacity})`) // Bright head

        ctx.strokeStyle = grad
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(tailX, tailY)
        ctx.lineTo(star.x, star.y)
        ctx.stroke()

        // Draw the bright head dot
        ctx.fillStyle = `rgba(255, 255, 255, ${currentOpacity})`
        ctx.beginPath()
        ctx.arc(star.x, star.y, 1.5, 0, Math.PI * 2)
        ctx.fill()
        
        // Optional: Draw a subtle glow around the head
        ctx.fillStyle = `rgba(6, 182, 212, ${currentOpacity * 0.4})`
        ctx.beginPath()
        ctx.arc(star.x, star.y, 4, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.restore()
      animationFrameRef.current = requestAnimationFrame(animate)
    }

    const runLoop = () => {
      animationFrameRef.current = requestAnimationFrame(animate)
    }

    runLoop()

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current)
          animationFrameRef.current = 0
        }
      } else {
        runLoop()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', handleMouseMove)
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ display: 'block' }}
    />
  )
}
