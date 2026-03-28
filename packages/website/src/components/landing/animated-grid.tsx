import { useEffect, useRef } from 'react'

interface DataPacket {
  x: number
  y: number
  axis: 'x' | 'y'
  speed: number
  life: number
  maxLife: number
  length: number
}

export function AnimatedGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationFrameRef = useRef<number>(0)
  const packetsRef = useRef<DataPacket[]>([])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let width = window.innerWidth
    let height = window.innerHeight
    const gridSize = 48

    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = width
      canvas.height = height
    }

    resize()
    window.addEventListener('resize', resize)

    const drawStaticGrid = () => {
      ctx.clearRect(0, 0, width, height)
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.35)'
      ctx.lineWidth = 1
      for (let x = 0; x <= width; x += gridSize) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
        ctx.stroke()
      }
      for (let y = 0; y <= height; y += gridSize) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()
      }
      ctx.fillStyle = 'rgba(30, 41, 59, 0.5)'
      for (let x = 0; x <= width; x += gridSize) {
        for (let y = 0; y <= height; y += gridSize) {
          ctx.beginPath()
          ctx.arc(x, y, 1, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }

    if (prefersReducedMotion) {
      drawStaticGrid()
      const handleResize = () => {
        resize()
        drawStaticGrid()
      }
      window.addEventListener('resize', handleResize)
      return () => window.removeEventListener('resize', handleResize)
    }

    const spawnPacket = () => {
      const axis = Math.random() > 0.5 ? 'x' as const : 'y' as const
      const maxLife = 0.8 + Math.random() * 0.6
      const gridLine = Math.floor(Math.random() * (axis === 'x' ? height / gridSize : width / gridSize)) * gridSize

      packetsRef.current.push({
        x: axis === 'x' ? (Math.random() > 0.5 ? -60 : width + 60) : gridLine,
        y: axis === 'y' ? (Math.random() > 0.5 ? -60 : height + 60) : gridLine,
        axis,
        speed: (1.5 + Math.random() * 2.5) * (Math.random() > 0.5 ? 1 : -1),
        life: maxLife,
        maxLife,
        length: 30 + Math.random() * 50,
      })
    }

    const animate = () => {
      ctx.clearRect(0, 0, width, height)

      // Static grid
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.35)'
      ctx.lineWidth = 1
      for (let x = 0; x <= width; x += gridSize) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
        ctx.stroke()
      }
      for (let y = 0; y <= height; y += gridSize) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()
      }

      // Intersection dots
      ctx.fillStyle = 'rgba(30, 41, 59, 0.5)'
      for (let x = 0; x <= width; x += gridSize) {
        for (let y = 0; y <= height; y += gridSize) {
          ctx.beginPath()
          ctx.arc(x, y, 1, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // Spawn new packets
      if (Math.random() < 0.06) spawnPacket()

      // Update and draw data packets
      const packets = packetsRef.current
      for (let i = packets.length - 1; i >= 0; i--) {
        const p = packets[i]
        p.life -= 0.005

        if (p.life <= 0) {
          packets.splice(i, 1)
          continue
        }

        if (p.axis === 'x') p.x += p.speed
        else p.y += p.speed

        // Cull off-screen packets
        if (p.x < -100 || p.x > width + 100 || p.y < -100 || p.y > height + 100) {
          packets.splice(i, 1)
          continue
        }

        const alpha = Math.min(p.life / p.maxLife, 1) * 0.7
        const halfLen = p.length / 2

        const x0 = p.axis === 'x' ? p.x - halfLen * Math.sign(p.speed) : p.x
        const y0 = p.axis === 'y' ? p.y - halfLen * Math.sign(p.speed) : p.y
        const x1 = p.axis === 'x' ? p.x + halfLen * Math.sign(p.speed) : p.x
        const y1 = p.axis === 'y' ? p.y + halfLen * Math.sign(p.speed) : p.y

        const grad = ctx.createLinearGradient(x0, y0, x1, y1)
        grad.addColorStop(0, `rgba(6, 182, 212, 0)`)
        grad.addColorStop(0.4, `rgba(6, 182, 212, ${alpha})`)
        grad.addColorStop(1, `rgba(6, 182, 212, 0)`)

        ctx.strokeStyle = grad
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(x0, y0)
        ctx.lineTo(x1, y1)
        ctx.stroke()

        // Bright head dot
        ctx.fillStyle = `rgba(6, 182, 212, ${alpha})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2)
        ctx.fill()
      }

      // Vignette
      const vignette = ctx.createRadialGradient(
        width / 2, height / 2, height * 0.5,
        width / 2, height / 2, height * 0.9
      )
      vignette.addColorStop(0, 'rgba(2, 6, 23, 0)')
      vignette.addColorStop(1, 'rgba(2, 6, 23, 0.3)')
      ctx.fillStyle = vignette
      ctx.fillRect(0, 0, width, height)

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
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 1 }}
    />
  )
}
