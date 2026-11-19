import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Offline paketli fontlar (iç ağda CDN gerektirmez)
import '@fontsource-variable/inter'
import '@fontsource/jetbrains-mono/400.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
