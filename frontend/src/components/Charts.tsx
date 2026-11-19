import { Box, Tooltip, Typography } from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
import { motion } from 'motion/react'
import { useId } from 'react'

/** Küçük trend çizgisi (alan dolgulu) */
export function Sparkline({ data, color, height = 36, width = 120 }: { data: number[]; color: string; height?: number; width?: number }) {
  const id = useId()
  const max = Math.max(1, ...data)
  const step = width / Math.max(1, data.length - 1)
  const pts = data.map((v, i) => [i * step, height - 3 - (v / max) * (height - 6)] as const)
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${width},${height} L0,${height} Z`
  return (
    <svg width={width} height={height} viewBox={`-3 -3 ${width + 6} ${height + 6}`} preserveAspectRatio="none" aria-hidden style={{ display: 'block' }}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".22" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={area} fill={`url(#${id})`} />
      <motion.path d={line} fill="none" stroke={color} strokeWidth="1.75" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"
                   initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
      {pts.length > 0 && <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.5" fill={color} vectorEffect="non-scaling-stroke" />}
    </svg>
  )
}

/** Yığılmış sütun grafiği — gün gün gelen işler, kaynağa göre */
export function StackedBars({ days, series, height = 180 }: {
  days: { label: string; full: string; values: number[] }[]
  series: { key: string; label: string; color: string }[]
  height?: number
}) {
  const theme = useTheme()
  const max = Math.max(1, ...days.map((d) => d.values.reduce((a, b) => a + b, 0)))
  const nice = Math.max(2, Math.ceil(max / 2) * 2)
  return (
    <Box>
      <Box sx={{ position: 'relative', height, display: 'flex', alignItems: 'flex-end', gap: { xs: 0.5, sm: 1 }, pl: 3 }}>
        {[0, 0.5, 1].map((f) => (
          <Box key={f} sx={{ position: 'absolute', left: 0, right: 0, bottom: f * (height - 4), borderTop: '1px dashed', borderColor: 'divider', pointerEvents: 'none' }}>
            <Typography sx={{ position: 'absolute', left: 0, top: -9, fontSize: 10.5, color: 'text.disabled', bgcolor: 'background.paper', pr: 0.5 }}>{Math.round(nice * f)}</Typography>
          </Box>
        ))}
        {days.map((d, i) => {
          const total = d.values.reduce((a, b) => a + b, 0)
          return (
            <Tooltip key={d.full} placement="top" title={
              <Box>
                <b>{d.full}</b> · {total} iş
                {series.map((s, k) => d.values[k] ? <Box key={s.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}><Box sx={{ width: 8, height: 8, borderRadius: 0.5, bgcolor: s.color }} />{s.label}: {d.values[k]}</Box> : null)}
              </Box>}>
              <Box sx={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', cursor: 'default', position: 'relative', zIndex: 1,
                         '&:hover .bar': { filter: 'brightness(1.08)' }, '&:hover': { bgcolor: alpha(theme.palette.text.primary, 0.03) }, borderRadius: 1 }}>
                <motion.div className="bar" style={{ display: 'flex', flexDirection: 'column-reverse', borderRadius: 5, overflow: 'hidden', transformOrigin: 'bottom', marginInline: '18%' }}
                            initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 0.6, delay: i * 0.025, ease: [0.22, 1, 0.36, 1] }}>
                  {series.map((s, k) => d.values[k] > 0 && (
                    <Box key={s.key} sx={{ height: (d.values[k] / nice) * (height - 4), bgcolor: s.color, borderTop: `1.5px solid ${theme.palette.background.paper}` }} />
                  ))}
                </motion.div>
              </Box>
            </Tooltip>
          )
        })}
      </Box>
      <Box sx={{ display: 'flex', gap: { xs: 0.5, sm: 1 }, pl: 3, mt: 1 }}>
        {days.map((d, i) => (
          <Typography key={d.full} sx={{ flex: 1, textAlign: 'center', fontSize: 11, color: 'text.disabled', visibility: i % 2 && days.length > 10 ? 'hidden' : 'visible' }}>{d.label}</Typography>
        ))}
      </Box>
    </Box>
  )
}

/** Tek satır bölümlü oran çubuğu + açıklama */
export function SegmentBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = Math.max(1, parts.reduce((a, p) => a + p.value, 0))
  return (
    <Box>
      <Box sx={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', gap: '2px' }}>
        {parts.filter((p) => p.value).map((p, i) => (
          <motion.div key={p.label} style={{ background: p.color, height: '100%' }} initial={{ width: 0 }} animate={{ width: `${(p.value / total) * 100}%` }}
                      transition={{ duration: 0.7, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }} />
        ))}
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mt: 2 }}>
        {parts.map((p) => (
          <Box key={p.label} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '3px', bgcolor: p.color }} />
            <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>{p.label}</Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{p.value}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
