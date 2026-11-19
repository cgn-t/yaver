import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import CloseIcon from '@mui/icons-material/Close'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import SendIcon from '@mui/icons-material/Send'
import { Box, ButtonBase, Chip, CircularProgress, Fab, IconButton, InputBase, Paper, Tooltip, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch, backend } from '../data/store'

/**
 * Yaver AI: sayfanın sol alt köşesindeki sohbet penceresi (0.9).
 * Soru POST /api/ai/ask'e gider; sunucu DB'deki benzer işleri ve wiki'yi bağlam olarak ekleyip GenAI Studio'ya sorar
 * (GenAI kapalıysa yerel cevap üretir). Konuşma thread_id ile sürer, oturum boyunca tarayıcıda tutulur.
 */

type Source = { type: 'db' | 'wiki'; id: number; ref: string; title: string; status?: string; url?: string }
type Msg = { role: 'user' | 'assistant'; content: string; sources?: Source[]; mode?: string; error?: boolean }
type AskResponse = { answer: string; thread_id: string | null; mode: 'genai' | 'yerel'; sources: Source[]; duration_ms: number }

const STORE = 'yaver_ai_chat'
const load = (): { msgs: Msg[]; thread: string | null } => {
  try { return JSON.parse(sessionStorage.getItem(STORE) ?? '') } catch { return { msgs: [], thread: null } }
}

export default function YaverAi({ left }: { left: { xs: number; md: number } }) {
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>(() => load().msgs ?? [])
  const [thread, setThread] = useState<string | null>(() => load().thread ?? null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [mode, setMode] = useState<string>('')
  const end = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => { try { sessionStorage.setItem(STORE, JSON.stringify({ msgs, thread })) } catch { /* depolama yok */ } }, [msgs, thread])
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, busy, open])
  useEffect(() => {
    if (!open || suggestions.length || backend !== 'api') return
    apiFetch<{ suggestions: string[]; mode: string }>('/ai/suggestions').then((r) => { setSuggestions(r.suggestions); setMode(r.mode) }).catch(() => {})
  }, [open, suggestions.length])

  async function ask(q: string) {
    const question = q.trim()
    if (!question || busy) return
    setText('')
    const history = msgs.filter((m) => !m.error).slice(-6).map(({ role, content }) => ({ role, content }))
    setMsgs((m) => [...m, { role: 'user', content: question }])
    setBusy(true)
    try {
      const r = await apiFetch<AskResponse>('/ai/ask', { method: 'POST', body: { message: question, thread_id: thread, history } })
      setThread(r.thread_id)
      setMode(r.mode)
      setMsgs((m) => [...m, { role: 'assistant', content: r.answer, sources: r.sources, mode: r.mode }])
    } catch (e) {
      setMsgs((m) => [...m, { role: 'assistant', content: `Cevap alınamadı: ${(e as Error).message}`, error: true }])
    } finally { setBusy(false) }
  }

  const reset = () => { setMsgs([]); setThread(null) }

  return (
    <>
      {!open && (
        <Tooltip title="Yaver AI'a sor" placement="right">
          <Fab variant="extended" color="primary" onClick={() => setOpen(true)} aria-label="Yaver AI"
               sx={{ position: 'fixed', bottom: 20, left, zIndex: 1200, textTransform: 'none', fontWeight: 600, gap: 1 }}>
            <AutoAwesomeIcon fontSize="small" /> Yaver AI
          </Fab>
        </Tooltip>
      )}
      {open && (
        <Paper elevation={12} role="dialog" aria-label="Yaver AI sohbet"
               sx={{ position: 'fixed', bottom: 16, left, zIndex: 1300, width: { xs: 'calc(100vw - 32px)', sm: 400 }, height: { xs: '70vh', sm: 580 },
                     maxHeight: 'calc(100vh - 32px)', display: 'flex', flexDirection: 'column', borderRadius: 3, overflow: 'hidden', border: 1, borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.25, borderBottom: 1, borderColor: 'divider',
                     bgcolor: (t) => alpha(t.palette.primary.main, 0.06) }}>
            <AutoAwesomeIcon color="primary" fontSize="small" />
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ lineHeight: 1.2 }}>Yaver AI</Typography>
              <Typography variant="caption" color="text.secondary">
                {mode === 'genai' ? 'GenAI Studio · geçmiş işler ve wiki' : mode === 'yerel' ? 'Yerel mod · GenAI kapalı' : 'Geçmiş işler ve wiki ile cevaplar'}
              </Typography>
            </Box>
            <Tooltip title="Yeni konuşma"><span><IconButton size="small" onClick={reset} disabled={busy || !msgs.length} aria-label="Yeni konuşma"><RestartAltIcon fontSize="small" /></IconButton></span></Tooltip>
            <IconButton size="small" onClick={() => setOpen(false)} aria-label="Kapat"><CloseIcon fontSize="small" /></IconButton>
          </Box>

          <Box sx={{ flexGrow: 1, overflowY: 'auto', px: 2, py: 1.5, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            {backend !== 'api' && <Typography variant="body2" color="text.secondary">Yaver AI sunucu üzerinden çalışır; şu an demo (tarayıcı) modundasınız.</Typography>}
            {backend === 'api' && !msgs.length && (
              <>
                <Typography variant="body2" color="text.secondary">
                  Geçmiş işlere, kimin nasıl çözdüğüne, wiki sayfalarına ve açık işlere dair soru sorun. Örnek sorular:
                </Typography>
                {suggestions.map((s) => (
                  <ButtonBase key={s} onClick={() => void ask(s)} disabled={busy}
                              sx={{ justifyContent: 'flex-start', textAlign: 'left', px: 1.5, py: 1, borderRadius: 2, border: 1, borderColor: 'divider',
                                    fontSize: 13.5, '&:hover': { bgcolor: 'action.hover', borderColor: 'primary.main' } }}>
                    {s}
                  </ButtonBase>
                ))}
              </>
            )}
            {msgs.map((m, i) => (
              <Box key={i} sx={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%' }}>
                <Box sx={(t) => ({ px: 1.5, py: 1, borderRadius: 2.5, whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.5, wordBreak: 'break-word',
                                   bgcolor: m.role === 'user' ? 'primary.main' : m.error ? alpha(t.palette.error.main, 0.08) : 'action.hover',
                                   color: m.role === 'user' ? 'primary.contrastText' : m.error ? 'error.main' : 'text.primary' })}>
                  {m.content}
                </Box>
                {!!m.sources?.length && (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.75 }}>
                    {m.sources.map((s) => (
                      <Chip key={`${s.type}-${s.id}`} size="small" variant="outlined" label={s.type === 'db' ? s.ref : `Wiki: ${s.title}`}
                            title={s.title} clickable
                            onClick={() => (s.type === 'db' ? navigate(`/work-items?open=${s.id}`) : s.url && window.open(s.url, '_blank', 'noopener'))} />
                    ))}
                  </Box>
                )}
              </Box>
            ))}
            {busy && <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}><CircularProgress size={14} /><Typography variant="caption">Yaver düşünüyor…</Typography></Box>}
            <div ref={end} />
          </Box>

          <Box component="form" onSubmit={(e) => { e.preventDefault(); void ask(text) }}
               sx={{ display: 'flex', alignItems: 'flex-end', gap: 1, px: 1.5, py: 1, borderTop: 1, borderColor: 'divider' }}>
            <InputBase value={text} onChange={(e) => setText(e.target.value)} placeholder="Yaver'e sorun…" multiline maxRows={4} fullWidth autoFocus
                       disabled={backend !== 'api'} inputProps={{ 'aria-label': 'Soru', maxLength: 2000 }}
                       onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(text) } }}
                       sx={{ fontSize: 14, px: 1, py: 0.75, borderRadius: 2, bgcolor: 'action.hover' }} />
            <IconButton type="submit" color="primary" disabled={busy || !text.trim() || backend !== 'api'} aria-label="Gönder"><SendIcon fontSize="small" /></IconButton>
          </Box>
        </Paper>
      )}
    </>
  )
}
