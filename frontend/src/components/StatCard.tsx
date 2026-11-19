import ArrowDownwardIcon from '@mui/icons-material/SouthEast'
import ArrowUpwardIcon from '@mui/icons-material/NorthEast'
import { Box, Paper, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import type { ReactNode } from 'react'
import { Sparkline } from './Charts'
import { CountUp } from './Motion'

/**
 * KPI kartı: etiket + ikon, büyük sayı, önceki döneme göre değişim, 14 günlük trend çizgisi.
 * `goodWhenUp=false` → artış kötü (ör. geciken işler) → kırmızı gösterilir.
 */
export default function StatCard({ icon, label, value, color, onClick, trend, delta, goodWhenUp = true, caption }: {
  icon?: ReactNode; label: string; value: number; color: string; onClick?: () => void
  trend?: number[]; delta?: number; goodWhenUp?: boolean; caption?: string
}) {
  const up = (delta ?? 0) > 0
  const good = delta === 0 || delta === undefined ? null : up === goodWhenUp
  return (
    <Paper variant="outlined" onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
           onKeyDown={(e) => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick() } }}
           sx={(t) => ({ p: { xs: 1.75, sm: 2.25 }, height: '100%', minWidth: 0, cursor: onClick ? 'pointer' : 'default', outline: 'none',
                         transition: 'box-shadow .2s ease, transform .2s cubic-bezier(.22,1,.36,1), border-color .2s ease',
                         ...(onClick && { '&:hover, &:focus-visible': { transform: 'translateY(-2px)', borderColor: alpha(color, 0.4),
                                                                         boxShadow: `0 12px 28px -12px ${alpha(color, t.palette.mode === 'dark' ? 0.5 : 0.35)}` } }) })}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        {icon && <Box sx={{ width: 26, height: 26, borderRadius: 1.75, display: 'grid', placeItems: 'center', color, bgcolor: alpha(color, 0.12), '& svg': { fontSize: 16 } }}>{icon}</Box>}
        <Typography variant="body2" color="text.secondary" noWrap sx={{ fontWeight: 550 }}>{label}</Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography sx={{ fontSize: { xs: 26, sm: 32 }, fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1 }}><CountUp value={value} /></Typography>
        {trend && <Box sx={{ display: { xs: 'none', sm: 'block' }, flexShrink: 0, width: '45%', maxWidth: 120, '& svg': { width: '100%' } }}><Sparkline data={trend} color={color} width={120} height={34} /></Box>}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1.25, minHeight: 20, minWidth: 0 }}>
        {delta !== undefined && (
          <Box component="span" sx={(t) => ({ display: 'inline-flex', alignItems: 'center', gap: 0.25, px: 0.6, height: 20, borderRadius: 1.25, fontSize: 12, fontWeight: 600, flexShrink: 0,
                                               color: good === null ? 'text.secondary' : good ? 'success.main' : 'error.main',
                                               bgcolor: good === null ? 'action.hover' : alpha(good ? t.palette.success.main : t.palette.error.main, 0.1) })}>
            {delta > 0 ? <ArrowUpwardIcon sx={{ fontSize: 12 }} /> : delta < 0 ? <ArrowDownwardIcon sx={{ fontSize: 12 }} /> : null}
            {delta > 0 ? '+' : ''}{delta}
          </Box>
        )}
        {caption && <Typography variant="caption" color="text.secondary" noWrap sx={{ display: { xs: 'none', sm: 'block' } }}>{caption}</Typography>}
      </Box>
    </Paper>
  )
}
