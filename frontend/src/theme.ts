import { createTheme } from '@mui/material/styles'

export type ThemeMode = 'dark' | 'light'

// Jumbo ile aynı kurumsal görünüm: IBM Plex Sans gövde, koyu kırmızı sol menü, kırmızı vurgu
const FONT_STACK = '"IBM Plex Sans","Segoe UI","Roboto","Helvetica","Arial",sans-serif'
export const MONO_FONT = '"JetBrains Mono","SFMono-Regular","Menlo","Consolas",monospace'

export const BRAND_DARK = '#7e1a1f'
export const BRAND_DARKER = '#5e1317'
export const BRAND_GRADIENT = `linear-gradient(180deg, ${BRAND_DARK} 0%, ${BRAND_DARKER} 100%)`

export function createAppTheme(mode: ThemeMode) {
  return createTheme({
    palette: {
      mode,
      primary: { main: '#e53946' },
      secondary: { main: '#7c4dff' },
      ...(mode === 'dark'
        ? { background: { default: '#101418', paper: '#181d23' } }
        : { background: { default: '#f4f6f8', paper: '#ffffff' } }),
      success: { main: '#4caf50' },
      warning: { main: '#ff9800' },
      error: { main: '#f44336' },
    },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily: FONT_STACK,
      body1: { letterSpacing: 'normal' },
      h4: { fontWeight: 700, letterSpacing: '-0.02em' },
      h5: { fontWeight: 700, letterSpacing: '-0.01em' },
      h6: { fontWeight: 600 },
      subtitle2: { fontWeight: 600 },
      button: { fontWeight: 600 },
      overline: { fontWeight: 700, letterSpacing: '0.08em' },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          html: { scrollbarGutter: 'stable' },
          'input:-webkit-autofill, input:-webkit-autofill:hover, input:-webkit-autofill:focus, input:-webkit-autofill:active': {
            WebkitBoxShadow: `0 0 0 1000px ${mode === 'dark' ? '#101418' : '#f4f6f8'} inset !important`,
            WebkitTextFillColor: `${mode === 'dark' ? '#fff' : 'rgba(0,0,0,0.87)'} !important`,
            transition: 'background-color 9999s ease-in-out 0s',
          },
        },
      },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiInputBase: { styleOverrides: { root: { '& textarea': { resize: 'vertical', overflowY: 'auto' } } } },
      MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
      MuiButton: { styleOverrides: { root: { textTransform: 'none' } } },
      MuiTableCell: {
        styleOverrides: {
          head: {
            fontWeight: 600, textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.05em',
            color: mode === 'dark' ? 'rgba(255,255,255,0.6)' : '#5f6b7a',
            backgroundColor: mode === 'dark' ? '#1d232a' : '#f8f9fb',
            paddingTop: 9, paddingBottom: 9, whiteSpace: 'nowrap',
          },
          sizeSmall: { paddingTop: 9, paddingBottom: 9, paddingLeft: 12, paddingRight: 12, '&:first-of-type': { paddingLeft: 16 }, '&:last-of-type': { paddingRight: 16 } },
          body: { borderColor: mode === 'dark' ? 'rgba(255,255,255,0.07)' : '#eef0f3' },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: { '&.MuiTableRow-hover:hover': { backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.035)' : '#fafbfc' } },
        },
      },
      MuiDialogContent: { styleOverrides: { root: { '.MuiDialogTitle-root + &': { paddingTop: 16 } } } },
    },
  })
}
