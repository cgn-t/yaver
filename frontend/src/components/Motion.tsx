import { animate, motion, useInView, useReducedMotion, type Variants } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Hareket katmanı — "modern-web-design" (freshtechbro/claudedesignskills) ilkeleri:
 * yalnız transform/opacity (GPU), kısa süreler (≤ 400 ms), kademeli (stagger) giriş,
 * sayıların sayarak gelmesi ve prefers-reduced-motion'a saygı (App'te MotionConfig).
 */

export const EASE_OUT = [0.22, 1, 0.36, 1] as const

/** Sayfa geçişi: içerik hafif yukarı kayarak belirir */
export function PageTransition({ id, children }: { id: string; children: ReactNode }) {
  return (
    <motion.div key={id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: EASE_OUT }}>
      {children}
    </motion.div>
  )
}

const listVariants: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } } }
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: EASE_OUT } },
}

/** Kademeli giriş kabı — içindeki <StaggerItem>'lar sırayla belirir */
export function Stagger({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return <motion.div variants={listVariants} initial="hidden" animate="show" style={style}>{children}</motion.div>
}
export function StaggerItem({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return <motion.div variants={itemVariants} style={style}>{children}</motion.div>
}

/** Sayı görünür olunca 0'dan hedefe sayar; sonraki değişimlerde eski değerden yeniye akar */
export function CountUp({ value, duration = 0.9 }: { value: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const reduce = useReducedMotion()
  const [shown, setShown] = useState(reduce ? value : 0)
  const last = useRef(reduce ? value : 0)

  useEffect(() => {
    if (!inView) return
    if (reduce) { setShown(value); last.current = value; return }
    const ctrl = animate(last.current, value, {
      duration, ease: EASE_OUT,
      onUpdate: (v) => setShown(Math.round(v)),
      onComplete: () => { last.current = value },
    })
    return () => { ctrl.stop(); last.current = value }
  }, [value, inView, reduce, duration])

  return <span ref={ref} style={{ fontVariantNumeric: 'tabular-nums' }}>{shown}</span>
}

/** "Canlı" göstergesi: etkin servisin yanında yumuşak nabız atan nokta */
export function LiveDot({ active, color = '#4caf50' }: { active: boolean; color?: string }) {
  return (
    <span style={{ position: 'relative', display: 'inline-block', width: 10, height: 10, flexShrink: 0 }} aria-hidden>
      {active && (
        <motion.span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: color }}
                     animate={{ scale: [1, 2.4], opacity: [0.55, 0] }}
                     transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }} />
      )}
      <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: active ? color : '#9e9e9e' }} />
    </span>
  )
}
