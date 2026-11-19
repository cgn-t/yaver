import { Box, useTheme } from '@mui/material'

/** Yaver amblemi (Düğüm): satır içi SVG, temaya uyar. mono → currentColor. */
export function YaverMark({ size = 18, mono = false, onBrand = false }: { size?: number; mono?: boolean; onBrand?: boolean }) {
  const t = useTheme()
  // onBrand: indigo zemin üzerinde (favicon ile aynı renkler: beyaz + kordon sarısı)
  const c1 = mono ? 'currentColor' : onBrand ? '#FFFFFF' : t.palette.primary.main
  const c2 = mono ? 'currentColor' : '#F5A524'
  const c3 = mono ? 'currentColor' : onBrand ? '#FFFFFF' : t.palette.text.primary
  return (
    <Box component="svg" viewBox="0 0 48 48" aria-hidden sx={{ width: size, height: size, display: 'block', flexShrink: 0 }}>
      <path d="M9 6 L19.5 19" fill="none" stroke={c1} strokeWidth={6.5} strokeLinecap="round" />
      <path d="M39 6 L28.5 19" fill="none" stroke={c2} strokeWidth={6.5} strokeLinecap="round" />
      <circle cx={24} cy={24.5} r={6.2} fill="none" stroke={c3} strokeWidth={5} />
      <path d="M24 33.5 V42" fill="none" stroke={c3} strokeWidth={6.5} strokeLinecap="round" />
    </Box>
  )
}

/** Yaver logosu: Düğüm amblemi "Y" harfi olarak + "aver". variant="white" koyu/renkli zemin içindir. */
export function BrandLogo({ height = 24, variant }: { height?: number; variant?: 'auto' | 'white' }) {
  const mode = useTheme().palette.mode
  const src = variant === 'white' ? '/yaver-logo-white.svg' : mode === 'dark' ? '/yaver-logo-dark.svg' : '/yaver-logo.svg'
  return <Box component="img" src={src} alt="Yaver" sx={{ height, width: 'auto', display: 'block' }} />
}

/** Uygulama ikonu (indigo kare içinde Düğüm amblemi). Satır içi SVG: tarayıcının eski favicon önbelleğinden etkilenmez. */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <Box aria-hidden sx={{ width: size, height: size, flexShrink: 0, display: 'grid', placeItems: 'center', bgcolor: '#5148E5',
                           borderRadius: `${Math.round(size * 0.23)}px`, boxShadow: '0 2px 8px rgba(81,72,229,0.30)' }}>
      <YaverMark size={Math.round(size * 0.8)} onBrand />
    </Box>
  )
}

/** Klavye kısayolu rozeti (⌘K gibi) */
export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <Box component="kbd" sx={{ fontFamily: 'inherit', fontSize: 11, fontWeight: 600, px: 0.6, minWidth: 18, height: 18, borderRadius: '5px',
                               display: 'inline-grid', placeItems: 'center', border: 1, borderColor: 'divider', color: 'text.secondary',
                               bgcolor: 'background.paper', boxShadow: '0 1px 0 rgba(0,0,0,0.06)' }}>{children}</Box>
  )
}
