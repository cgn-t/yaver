import { Box, Paper, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import type { ReactNode } from 'react'
import { CountUp } from './Motion'

/** KPI kartı: tint'li ikon kutusu, sayarak gelen değer, üzerine gelince hafif yükselme + ikon büyümesi. */
export default function StatCard({ icon, label, value, color, onClick, hint }: {
  icon?: ReactNode
  label: string
  value: number | string
  color: string
  onClick?: () => void
  hint?: string
}) {
  return (
    <Paper
      variant="outlined" onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick() } }}
      sx={{
        p: 2.5, display: 'flex', alignItems: 'center', gap: 2, height: '100%', position: 'relative', overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color .2s ease, transform .2s ease, box-shadow .2s ease',
        // Sağ üstte rengin çok hafif bir halesi — düz kartlara derinlik verir
        '&::after': { content: '""', position: 'absolute', right: -40, top: -40, width: 120, height: 120, borderRadius: '50%',
                      background: `radial-gradient(circle, ${alpha(color, 0.12)}, transparent 70%)`, pointerEvents: 'none' },
        ...(onClick && {
          '&:hover, &:focus-visible': { borderColor: color, transform: 'translateY(-3px)', boxShadow: `0 10px 28px ${alpha(color, 0.2)}`, outline: 'none' },
          '&:hover .stat-icon': { transform: 'scale(1.08) rotate(-4deg)' },
          '&:active': { transform: 'translateY(-1px) scale(0.99)' },
        }),
      }}
    >
      {icon && (
        <Box className="stat-icon" sx={{ flexShrink: 0, width: 50, height: 50, borderRadius: 2.5, display: 'grid', placeItems: 'center',
                                         color, bgcolor: alpha(color, 0.14), transition: 'transform .25s cubic-bezier(.22,1,.36,1)' }}>
          {icon}
        </Box>
      )}
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 800, fontSize: 30, lineHeight: 1.05, letterSpacing: '-0.02em', color: icon ? 'text.primary' : color }}>
          {typeof value === 'number' ? <CountUp value={value} /> : value}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
          {label}
        </Typography>
        {hint && <Typography variant="caption" color="text.disabled" component="div" sx={{ mt: 0.25 }}>{hint}</Typography>}
      </Box>
    </Paper>
  )
}
