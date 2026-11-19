import { Box, Typography } from '@mui/material'
import type { ReactNode } from 'react'

/** Sayfa başlığı: büyük başlık + açıklama solda, eylemler sağda */
export default function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2, mb: 3, flexWrap: 'wrap' }}>
      <Box sx={{ minWidth: 0 }}>
        {eyebrow && <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5, fontWeight: 500 }}>{eyebrow}</Typography>}
        <Typography component="h1" sx={{ fontSize: { xs: 24, md: 28 }, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.15 }}>{title}</Typography>
        {subtitle && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>{subtitle}</Typography>}
      </Box>
      {actions && <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>{actions}</Box>}
    </Box>
  )
}
