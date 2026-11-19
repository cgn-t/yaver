import { Box, Typography } from '@mui/material'
import { BrandLogo } from '../components/Brand'
import DbBrowser from '../components/DbBrowser'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

/** /db: girişsiz, salt okunur veritabanı görünümü (sunucuda DB_PUBLIC=true olmalı). */
export default function PublicDb() {
  useDocumentTitle('Veritabanı')
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: { xs: 2, md: 3 }, height: 60, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
        <BrandLogo height={24} />
        <Typography sx={{ fontWeight: 650, fontSize: 15 }}>Veritabanı</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
          Salt okunur · gizli alanlar (şifre, token, sır) maskelidir
        </Typography>
      </Box>
      <Box sx={{ p: { xs: 2, md: 3 } }}>
        <DbBrowser base="/public/db" />
      </Box>
    </Box>
  )
}
