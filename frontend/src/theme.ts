import { alpha, createTheme } from '@mui/material/styles'

export type ThemeMode = 'dark' | 'light'

/**
 * YAVER tasarım sistemi v2
 * - Nötr, sakin yüzeyler (gri tonlar) + tek güçlü vurgu rengi (indigo)
 * - Inter Variable, sıkı harf aralığı, tabular rakamlar
 * - 1px ince çizgiler, yumuşak gölgeler, 10–16px köşe yarıçapı
 * - Odakta 3px vurgu halkası (erişilebilirlik)
 */
export const FONT_STACK = '"Inter Variable","Inter","Segoe UI",system-ui,-apple-system,sans-serif'
export const MONO_FONT = '"JetBrains Mono","SFMono-Regular","Menlo","Consolas",monospace'

export const ACCENT = '#DC0005'
export const ACCENT_DARK = '#FF5257'
/** Marka renk geçişi: sıcak kırmızı → #DC0005 → bordo */
export const BRAND_GRADIENT = 'linear-gradient(135deg, #FF4B3A 0%, #DC0005 50%, #8E0003 100%)'
export const BRAND_GRADIENT_DARK = 'linear-gradient(135deg, #FF6A5C 0%, #F0262B 50%, #B30006 100%)'

export const SEMANTIC = {
  success: '#12B76A', warning: '#F79009', error: '#F04438', info: '#2E90FA', violet: '#9E1B32', pink: '#EE46BC', teal: '#15B79E',
}

const LIGHT = { canvas: '#F6F6F8', surface: '#FFFFFF', subtle: '#FAFAFB', border: '#E8E8EC', text: '#101218', text2: '#5B5F6B', text3: '#9A9EA8' }
const DARK = { canvas: '#0A0B0E', surface: '#121318', subtle: '#16171D', border: '#25272F', text: '#EDEEF0', text2: '#A3A6B0', text3: '#6C707B' }
export const surfaces = (mode: ThemeMode) => (mode === 'dark' ? DARK : LIGHT)

export function createAppTheme(mode: ThemeMode) {
  const c = surfaces(mode)
  const accent = mode === 'dark' ? ACCENT_DARK : ACCENT
  const ring = `0 0 0 3px ${alpha(accent, mode === 'dark' ? 0.35 : 0.22)}`
  const shadowSm = mode === 'dark' ? '0 1px 2px rgba(0,0,0,0.5)' : '0 1px 2px rgba(16,18,24,0.05)'
  const shadowLg = mode === 'dark' ? '0 24px 48px -12px rgba(0,0,0,0.6), 0 0 0 1px #25272F'
                                   : '0 24px 48px -12px rgba(16,18,24,0.18), 0 0 0 1px rgba(16,18,24,0.04)'

  return createTheme({
    palette: {
      mode,
      primary: { main: accent, contrastText: '#fff' },
      secondary: { main: SEMANTIC.violet },
      success: { main: SEMANTIC.success }, warning: { main: SEMANTIC.warning },
      error: { main: SEMANTIC.error }, info: { main: SEMANTIC.info },
      background: { default: c.canvas, paper: c.surface },
      divider: c.border,
      text: { primary: c.text, secondary: c.text2, disabled: c.text3 },
      action: { hover: mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(16,18,24,0.035)', selected: alpha(accent, 0.1) },
    },
    // sx içindeki borderRadius çarpanı: 1 = 4px (2 → 8px, 3 → 12px)
    shape: { borderRadius: 4 },
    typography: {
      fontFamily: FONT_STACK,
      fontSize: 14,
      h4: { fontWeight: 650, letterSpacing: '-0.025em' },
      h5: { fontWeight: 650, letterSpacing: '-0.02em', fontSize: 22 },
      h6: { fontWeight: 600, letterSpacing: '-0.015em', fontSize: 16 },
      subtitle1: { fontWeight: 600, letterSpacing: '-0.01em' },
      subtitle2: { fontWeight: 600 },
      body1: { letterSpacing: '-0.006em' },
      body2: { letterSpacing: '-0.003em' },
      button: { fontWeight: 600, letterSpacing: '-0.005em', textTransform: 'none' },
      overline: { fontWeight: 600, letterSpacing: '0.06em', fontSize: 11 },
      caption: { letterSpacing: 0 },
    },
    shadows: ['none', shadowSm, shadowSm, ...Array(22).fill(shadowLg)] as never,
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          html: { scrollbarGutter: 'stable', WebkitFontSmoothing: 'antialiased' },
          body: { fontFeatureSettings: '"cv11","ss01","tnum"' },
          '::selection': { background: alpha(accent, 0.22) },
          '*::-webkit-scrollbar': { width: 10, height: 10 },
          '*::-webkit-scrollbar-thumb': { background: c.border, borderRadius: 8, border: `2px solid ${c.canvas}` },
          'input:-webkit-autofill, input:-webkit-autofill:hover, input:-webkit-autofill:focus': {
            WebkitBoxShadow: `0 0 0 1000px ${c.surface} inset !important`, WebkitTextFillColor: `${c.text} !important`,
          },
          '@media (prefers-reduced-motion: reduce)': {
            '*, *::before, *::after': { animationDuration: '0.01ms !important', transitionDuration: '0.01ms !important' },
          },
        },
      },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' }, outlined: { borderColor: c.border, borderRadius: 14 } } },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: 10, minHeight: 36, paddingInline: 14, transition: 'transform .12s ease, background-color .15s ease, box-shadow .15s ease, border-color .15s ease',
                  '&:active': { transform: 'scale(0.97)' }, '&.Mui-focusVisible': { boxShadow: ring } },
          sizeSmall: { minHeight: 30, paddingInline: 10, fontSize: 13, borderRadius: 8 },
          contained: { '&.MuiButton-colorPrimary': { backgroundImage: mode === 'dark' ? BRAND_GRADIENT_DARK : BRAND_GRADIENT, color: '#fff',
                                                      boxShadow: `inset 0 1px 0 ${alpha('#fff', 0.18)}, 0 1px 2px ${alpha(accent, 0.4)}`,
                                                      '&.Mui-disabled': { backgroundImage: 'none' },
                                                      '&:hover': { filter: 'brightness(1.06)', boxShadow: `inset 0 1px 0 ${alpha('#fff', 0.18)}, 0 4px 12px ${alpha(accent, 0.35)}` } } },
          outlined: { borderColor: c.border, color: c.text, backgroundColor: c.surface, boxShadow: shadowSm,
                      '&:hover': { borderColor: mode === 'dark' ? '#3A3D47' : '#D3D4DA', backgroundColor: c.subtle } },
          text: { color: c.text2, '&:hover': { color: c.text, backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(16,18,24,0.045)' } },
        },
      },
      MuiIconButton: { styleOverrides: { root: { borderRadius: 10, color: c.text2, transition: 'transform .12s ease, background-color .15s ease',
                                                  '&:hover': { color: c.text }, '&:active': { transform: 'scale(0.92)' }, '&.Mui-focusVisible': { boxShadow: ring } } } },
      MuiOutlinedInput: {
        styleOverrides: {
          root: { borderRadius: 10, backgroundColor: c.surface, transition: 'box-shadow .15s ease',
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: c.border, transition: 'border-color .15s ease' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: mode === 'dark' ? '#3A3D47' : '#CFD0D6' },
                  '&.Mui-focused': { boxShadow: ring }, '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: accent, borderWidth: 1 } },
          input: { '&::placeholder': { color: c.text3, opacity: 1 } },
        },
      },
      MuiInputLabel: { styleOverrides: { root: { color: c.text2, '&.Mui-focused': { color: accent } } } },
      MuiInputBase: { styleOverrides: { root: { '& textarea': { resize: 'vertical' } } } },
      MuiFormHelperText: { styleOverrides: { root: { color: c.text3, marginLeft: 2 } } },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 7, height: 24, fontWeight: 550, fontSize: 12, transition: 'transform .12s ease, background-color .15s ease',
                  '&.MuiChip-clickable:active': { transform: 'scale(0.95)' } },
          outlined: { borderColor: c.border, backgroundColor: c.surface },
          label: { paddingInline: 8 },
        },
      },
      MuiSwitch: {
        styleOverrides: {
          root: { width: 40, height: 24, padding: 0, margin: 8 },
          switchBase: { padding: 3, '&.Mui-checked': { transform: 'translateX(16px)', color: '#fff', '& + .MuiSwitch-track': { backgroundColor: accent, opacity: 1 } },
                        '&.Mui-focusVisible + .MuiSwitch-track': { boxShadow: ring } },
          thumb: { width: 18, height: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transition: 'transform .2s cubic-bezier(.22,1,.36,1)' },
          track: { borderRadius: 12, backgroundColor: mode === 'dark' ? '#3A3D47' : '#D9DAE0', opacity: 1 },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          head: { fontWeight: 550, fontSize: 12, color: c.text3, backgroundColor: c.subtle, whiteSpace: 'nowrap', paddingTop: 10, paddingBottom: 10, borderColor: c.border },
          body: { borderColor: c.border, paddingTop: 12, paddingBottom: 12 },
        },
      },
      MuiTableRow: { styleOverrides: { root: { transition: 'background-color .12s ease', '&.MuiTableRow-hover:hover': { backgroundColor: c.subtle } } } },
      MuiTooltip: { styleOverrides: { tooltip: { backgroundColor: mode === 'dark' ? '#2A2C34' : '#101218', fontSize: 12, fontWeight: 500, borderRadius: 8, padding: '6px 10px' } } },
      MuiMenu: { styleOverrides: { paper: { borderRadius: 12, marginTop: 4, border: `1px solid ${c.border}`, boxShadow: shadowLg }, list: { padding: 6 } } },
      MuiMenuItem: { styleOverrides: { root: { borderRadius: 8, fontSize: 14, minHeight: 36 } } },
      MuiPopover: { styleOverrides: { paper: { borderRadius: 12, border: `1px solid ${c.border}` } } },
      MuiDialog: { styleOverrides: { paper: { borderRadius: 16, boxShadow: shadowLg } } },
      MuiDialogTitle: { styleOverrides: { root: { fontWeight: 650, letterSpacing: '-0.015em', fontSize: 18 } } },
      MuiDialogContent: { styleOverrides: { root: { '.MuiDialogTitle-root + &': { paddingTop: 12 } } } },
      MuiDrawer: { styleOverrides: { paper: { borderLeft: `1px solid ${c.border}`, boxShadow: shadowLg } } },
      MuiTabs: { styleOverrides: { root: { minHeight: 40 }, indicator: { height: 2, borderRadius: 2 } } },
      MuiTab: { styleOverrides: { root: { minHeight: 40, fontWeight: 550, paddingInline: 12, minWidth: 0, color: c.text2 } } },
      MuiLinearProgress: { styleOverrides: { root: { borderRadius: 4, backgroundColor: mode === 'dark' ? '#25272F' : '#EEEEF2' }, bar: { borderRadius: 4 } } },
      MuiAlert: { styleOverrides: { root: { borderRadius: 12, alignItems: 'flex-start' }, standard: { '&.MuiAlert-standardInfo': { backgroundColor: alpha(accent, 0.07), color: c.text, '& .MuiAlert-icon': { color: accent } } } } },
      MuiAvatar: { styleOverrides: { root: { fontWeight: 600, fontSize: 13 } } },
      MuiDivider: { styleOverrides: { root: { borderColor: c.border } } },
      MuiToggleButton: { styleOverrides: { root: { textTransform: 'none', border: 0, borderRadius: '8px !important', paddingBlock: 4, paddingInline: 10, fontWeight: 550, color: c.text2,
                                                    '&.Mui-selected': { backgroundColor: c.surface, color: c.text, boxShadow: shadowSm, '&:hover': { backgroundColor: c.surface } } } } },
      MuiToggleButtonGroup: { styleOverrides: { root: { backgroundColor: mode === 'dark' ? '#1B1C22' : '#EFEFF2', borderRadius: 10, padding: 3, gap: 2 } } },
    },
  })
}

/** Kişi adından tutarlı avatar rengi */
const AVATAR_COLORS = ['#DC0005', '#12B76A', '#F79009', '#EE46BC', '#2E90FA', '#9E1B32', '#15B79E', '#F04438']
export function avatarColor(name: string) {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}
export function initials(name: string) {
  const parts = name.replace(/[._-]+/g, ' ').trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toLocaleUpperCase('tr') || '?'
}
