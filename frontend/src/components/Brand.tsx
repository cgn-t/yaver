import { Box } from '@mui/material'

export function BrandMark({ size = 28 }: { size?: number }) {
  return <Box component="img" src="/favicon.svg" alt="" sx={{ width: size, height: size, display: 'block', borderRadius: `${Math.round(size * 0.25)}px`,
                                                              boxShadow: '0 2px 8px rgba(81,72,229,0.35)' }} />
}

/** Klavye kısayolu rozeti (⌘K gibi) */
export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <Box component="kbd" sx={{ fontFamily: 'inherit', fontSize: 11, fontWeight: 600, px: 0.6, minWidth: 18, height: 18, borderRadius: '5px',
                               display: 'inline-grid', placeItems: 'center', border: 1, borderColor: 'divider', color: 'text.secondary',
                               bgcolor: 'background.paper', boxShadow: '0 1px 0 rgba(0,0,0,0.06)' }}>{children}</Box>
  )
}
