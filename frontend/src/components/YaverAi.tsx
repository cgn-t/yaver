import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import CloseIcon from '@mui/icons-material/Close'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import EditNoteIcon from '@mui/icons-material/EditNote'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import TaskAltIcon from '@mui/icons-material/TaskAlt'
import { Box, ButtonBase, CircularProgress, Divider, IconButton, InputBase, Paper, Tooltip, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch, backend } from '../data/store'

/**
 * Yaver AI asistanı (0.9.1): sağ kenara yapışık sekme + sağda açılan panel.
 * Sekme ve panel yalnız dikey eksende sürüklenir; konum tarayıcıda hatırlanır.
 * Soru POST /api/ai/ask'e gider; sunucu DB'deki benzer işleri ve wiki'yi bağlam olarak ekleyip GenAI Studio'ya sorar
 * (GenAI kapalıysa yerel cevap üretir). Konuşma thread_id ile sürer.
 */

type Source = { type: 'db' | 'wiki'; id: number; ref: string; title: string; status?: string; url?: string }
type Msg = { role: 'user' | 'assistant'; content: string; sources?: Source[]; mode?: string; error?: boolean; ms?: number }
type AskResponse = { answer: string; thread_id: string | null; mode: 'genai' | 'yerel'; sources: Source[]; duration_ms: number; boot_id?: string }

const CHAT_KEY = 'yaver_ai_chat'
const POS_KEY = 'yaver_ai_y'
const TAB_H = 128
const MARGIN = 12
const read = <T,>(store: Storage, key: string, fallback: T): T => { try { const v = store.getItem(key); return v ? JSON.parse(v) as T : fallback } catch { return fallback } }
const write = (store: Storage, key: string, v: unknown) => { try { store.setItem(key, JSON.stringify(v)) } catch { /* depolama yok */ } }
const clamp = (y: number, h: number) => Math.min(Math.max(y, 72), Math.max(72, window.innerHeight - h - MARGIN))

/** Dikey sürükleme: yalnız Y değişir; 4 px'ten az hareket tıklama sayılır. */
function useVerticalDrag(y: number, setY: (y: number) => void, height: number, onClick?: () => void) {
  const st = useRef<{ startY: number; origin: number; moved: boolean } | null>(null)
  const onPointerDown = (e: RPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    st.current = { startY: e.clientY, origin: y, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: RPointerEvent<HTMLElement>) => {
    const s = st.current
    if (!s) return
    const dy = e.clientY - s.startY
    if (Math.abs(dy) > 4) s.moved = true
    if (s.moved) setY(clamp(s.origin + dy, height))
  }
  const onPointerUp = (e: RPointerEvent<HTMLElement>) => {
    const s = st.current
    st.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    if (s && !s.moved) onClick?.()
  }
  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: () => { st.current = null } }
}

/** Satır içi: **kalın** ve `kod`. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean)
  return <>{parts.map((p, i) => p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong>
    : p.startsWith('`') && p.endsWith('`') ? <Box key={i} component="code" sx={{ fontSize: 12.5, px: 0.5, borderRadius: 0.5, bgcolor: 'action.hover' }}>{p.slice(1, -1)}</Box>
    : <span key={i}>{p}</span>)}</>
}

/** Hafif Markdown: "### başlık", "- / * / • madde", "1. madde", boş satır = paragraf. */
function RichText({ text }: { text: string }) {
  type Block = { kind: 'h' | 'p' | 'ul' | 'ol'; lines: string[] }
  const blocks: Block[] = []
  for (const raw of String(text ?? '').replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd()
    const last = blocks[blocks.length - 1]
    if (!line.trim()) { blocks.push({ kind: 'p', lines: [] }); continue }
    const h = line.match(/^#{1,4}\s+(.*)$/)
    const ul = line.match(/^\s*[-*•]\s+(.*)$/)
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/)
    if (h) blocks.push({ kind: 'h', lines: [h[1]] })
    else if (ul) { if (last?.kind === 'ul') last.lines.push(ul[1]); else blocks.push({ kind: 'ul', lines: [ul[1]] }) }
    else if (ol) { if (last?.kind === 'ol') last.lines.push(ol[1]); else blocks.push({ kind: 'ol', lines: [ol[1]] }) }
    else if (last?.kind === 'p' && last.lines.length) last.lines.push(line)
    else blocks.push({ kind: 'p', lines: [line] })
  }
  const shown = blocks.filter((b) => b.lines.length)
  return (
    <Box sx={{ '& > * + *': { mt: 1 } }}>
      {shown.map((b, i) => b.kind === 'h' ? (
        <Typography key={i} sx={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', pt: i ? 0.5 : 0 }}>
          <Inline text={b.lines[0]} />
        </Typography>
      ) : b.kind === 'p' ? (
        <Box key={i}>{b.lines.map((l, j) => <Box key={j}><Inline text={l} /></Box>)}</Box>
      ) : (
        <Box key={i} component={b.kind} sx={{ m: 0, pl: 2.25, '& li + li': { mt: 0.5 } }}>
          {b.lines.map((l, j) => <li key={j}><Inline text={l} /></li>)}
        </Box>
      ))}
    </Box>
  )
}

export default function YaverAi() {
  const [open, setOpen] = useState(false)
  const [y, setYRaw] = useState(() => read(localStorage, POS_KEY, 0) || Math.round(window.innerHeight * 0.45))
  const [saved] = useState(() => read(sessionStorage, CHAT_KEY, { msgs: [] as Msg[], thread: null as string | null, boot: null as string | null }))
  const [msgs, setMsgs] = useState<Msg[]>(saved.msgs ?? [])
  const [thread, setThread] = useState<string | null>(saved.thread ?? null)
  const [boot, setBoot] = useState<string | null>(saved.boot ?? null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [mode, setMode] = useState<string>('')
  const end = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const setY = useCallback((v: number) => { setYRaw(v); write(localStorage, POS_KEY, v) }, [])
  const tabTop = clamp(y, TAB_H)
  useEffect(() => {
    const onResize = () => setYRaw((v) => clamp(v, TAB_H))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  useEffect(() => { write(sessionStorage, CHAT_KEY, { msgs, thread, boot }) }, [msgs, thread, boot])
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [msgs, busy, open])
  // Sunucu (pod) kimliği değiştiyse — rollout / yeniden başlatma — sohbet geçmişi ve thread silinir
  const syncBoot = useCallback((serverBoot: string | undefined) => {
    if (!serverBoot) return
    setBoot((prev) => {
      if (prev !== serverBoot) { setMsgs([]); setThread(null) }
      return serverBoot
    })
  }, [])
  useEffect(() => {
    if (backend !== 'api') return
    apiFetch<{ suggestions: string[]; mode: string; boot_id?: string }>('/ai/suggestions')
      .then((r) => { setSuggestions(r.suggestions); setMode(r.mode); syncBoot(r.boot_id) }).catch(() => {})
  }, [open, syncBoot])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const tabDrag = useVerticalDrag(tabTop, setY, TAB_H, () => setOpen(true))

  async function ask(q: string) {
    const question = q.trim()
    if (!question || busy) return
    setText('')
    const history = msgs.filter((m) => !m.error).slice(-6).map(({ role, content }) => ({ role, content }))
    setMsgs((m) => [...m, { role: 'user', content: question }])
    setBusy(true)
    try {
      const r = await apiFetch<AskResponse>('/ai/ask', { method: 'POST', body: { message: question, thread_id: thread, history } })
      const fresh = !!boot && !!r.boot_id && r.boot_id !== boot
      if (r.boot_id) setBoot(r.boot_id)
      setThread(r.thread_id)
      setMode(r.mode)
      const reply: Msg = { role: 'assistant', content: r.answer, sources: r.sources, mode: r.mode, ms: r.duration_ms }
      // Bu arada pod yeniden başladıysa eski geçmiş atılır, yalnız bu soru-cevap kalır
      setMsgs((m) => (fresh ? [{ role: 'user', content: question }, reply] : [...m, reply]))
    } catch (e) {
      setMsgs((m) => [...m, { role: 'assistant', content: `Cevap alınamadı: ${(e as Error).message}`, error: true }])
    } finally { setBusy(false) }
  }

  const modeLabel = mode === 'genai' ? 'GenAI Studio' : mode === 'yerel' ? 'Yerel mod' : ''

  return (
    <>
      {/* Sağ kenar sekmesi: tıkla → aç, sürükle → yukarı/aşağı */}
      {!open && (
        <Tooltip title="Yaver AI · sürükleyerek taşıyın" placement="left">
          <Box {...tabDrag} role="button" tabIndex={0} aria-label="Yaver AI'ı aç"
               onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true) } }}
               sx={(t) => ({ position: 'fixed', right: 0, top: tabTop, zIndex: 1200, width: 40, height: TAB_H, cursor: 'grab', touchAction: 'none', userSelect: 'none',
                             display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
                             bgcolor: 'background.paper', color: 'text.primary', border: 1, borderRight: 0, borderColor: 'divider',
                             borderRadius: '10px 0 0 10px', boxShadow: t.shadows[4], borderLeft: `3px solid ${t.palette.primary.main}`,
                             transition: 'width .15s, box-shadow .15s', '&:hover': { width: 44, boxShadow: t.shadows[8] }, '&:active': { cursor: 'grabbing' },
                             '&:focus-visible': { outline: `2px solid ${t.palette.primary.main}`, outlineOffset: 2 } })}>
            <AutoAwesomeIcon sx={{ fontSize: 18, color: 'primary.main' }} />
            <Typography sx={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: 12.5, fontWeight: 650, letterSpacing: 0.4 }}>Yaver AI</Typography>
            <DragIndicatorIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
          </Box>
        </Tooltip>
      )}

      {open && (
        <Paper elevation={0} role="dialog" aria-label="Yaver AI asistanı"
               sx={(t) => ({ position: 'fixed', right: 0, top: 0, bottom: 0, zIndex: 1300, width: { xs: '100vw', sm: 440 },
                             height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
                             borderRadius: 0, borderLeft: 1, borderColor: 'divider', boxShadow: t.shadows[16] })}>
          {/* Başlık: sağ kenarda tam boy panel */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 2, height: 56, flexShrink: 0, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
            <Box sx={(t) => ({ width: 30, height: 30, borderRadius: 1.5, display: 'grid', placeItems: 'center', bgcolor: alpha(t.palette.primary.main, 0.1), color: 'primary.main' })}>
              <AutoAwesomeIcon sx={{ fontSize: 17 }} />
            </Box>
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: 14, fontWeight: 650, lineHeight: 1.25 }}>Yaver AI Asistan</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: mode === 'genai' ? 'success.main' : mode === 'yerel' ? 'warning.main' : 'text.disabled' }} />
                <Typography variant="caption" color="text.secondary" noWrap>{modeLabel ? `${modeLabel} · geçmiş işler ve wiki` : 'Geçmiş işler ve wiki ile cevaplar'}</Typography>
              </Box>
            </Box>
            <Tooltip title="Yeni konuşma">
              <span><IconButton size="small" onPointerDown={(e) => e.stopPropagation()} onClick={() => { setMsgs([]); setThread(null) }}
                                 disabled={busy || !msgs.length} aria-label="Yeni konuşma"><EditNoteIcon fontSize="small" /></IconButton></span>
            </Tooltip>
            <Tooltip title="Kapat (Esc)">
              <IconButton size="small" onPointerDown={(e) => e.stopPropagation()} onClick={() => setOpen(false)} aria-label="Kapat"><CloseIcon fontSize="small" /></IconButton>
            </Tooltip>
          </Box>

          {/* İçerik */}
          <Box sx={{ flexGrow: 1, overflowY: 'auto', bgcolor: (t) => (t.palette.mode === 'dark' ? 'background.default' : alpha(t.palette.text.primary, 0.015)) }}>
            {backend !== 'api' && <Typography variant="body2" color="text.secondary" sx={{ p: 2.5 }}>Yaver AI sunucu üzerinden çalışır; şu an demo (tarayıcı) modundasınız.</Typography>}
            {backend === 'api' && !msgs.length && (
              <Box sx={{ p: 2.5 }}>
                <Typography sx={{ fontSize: 15, fontWeight: 650, mb: 0.5 }}>Size nasıl yardımcı olabilirim?</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Geçmiş işler, çözüm yöntemleri ve süreleri, sorumlu kişiler, wiki sayfaları ve açık işler hakkında sorabilirsiniz.
                </Typography>
                <Typography variant="overline" color="text.secondary" sx={{ fontSize: 11, letterSpacing: 0.8 }}>Önerilen sorular</Typography>
                <Paper variant="outlined" sx={{ mt: 0.75, borderRadius: 1.5, overflow: 'hidden' }}>
                  {suggestions.map((s, i) => (
                    <Box key={s}>
                      {i > 0 && <Divider />}
                      <ButtonBase onClick={() => void ask(s)} disabled={busy}
                                  sx={{ width: '100%', justifyContent: 'space-between', gap: 1, textAlign: 'left', px: 1.5, py: 1.1, fontSize: 13.5,
                                        '&:hover': { bgcolor: 'action.hover' }, '&:hover svg': { color: 'primary.main' } }}>
                        <span>{s}</span><ChevronRightIcon sx={{ fontSize: 18, color: 'text.disabled', flexShrink: 0 }} />
                      </ButtonBase>
                    </Box>
                  ))}
                  {!suggestions.length && <Box sx={{ p: 2, display: 'flex', justifyContent: 'center' }}><CircularProgress size={18} /></Box>}
                </Paper>
              </Box>
            )}
            {!!msgs.length && (
              <Box sx={{ px: 2, py: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {msgs.map((m, i) => m.role === 'user' ? (
                  <Box key={i} sx={(t) => ({ alignSelf: 'flex-end', maxWidth: '85%', px: 1.5, py: 1, borderRadius: 1.5, fontSize: 13.5, lineHeight: 1.5,
                                             whiteSpace: 'pre-wrap', wordBreak: 'break-word', bgcolor: alpha(t.palette.primary.main, 0.1), color: 'text.primary' })}>
                    {m.content}
                  </Box>
                ) : (
                  <Box key={i} sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
                    <Box sx={(t) => ({ width: 24, height: 24, borderRadius: 1, flexShrink: 0, display: 'grid', placeItems: 'center', mt: 0.25,
                                       bgcolor: m.error ? alpha(t.palette.error.main, 0.1) : alpha(t.palette.primary.main, 0.1), color: m.error ? 'error.main' : 'primary.main' })}>
                      <AutoAwesomeIcon sx={{ fontSize: 14 }} />
                    </Box>
                    <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                      <Paper variant="outlined" sx={{ px: 1.5, py: 1.25, borderRadius: 1.5, fontSize: 13.5, lineHeight: 1.55, wordBreak: 'break-word',
                                                       color: m.error ? 'error.main' : 'text.primary' }}>
                        <RichText text={m.content} />
                        {!!m.sources?.length && (
                          <Box sx={{ mt: 1.25, pt: 1, borderTop: 1, borderColor: 'divider' }}>
                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Kaynaklar</Typography>
                            {m.sources.map((s) => (
                              <ButtonBase key={`${s.type}-${s.id}`}
                                          onClick={() => (s.type === 'db' ? navigate(`/work-items?open=${s.id}`) : s.url && window.open(s.url, '_blank', 'noopener'))}
                                          sx={{ display: 'flex', width: '100%', justifyContent: 'flex-start', gap: 1, py: 0.4, borderRadius: 1, textAlign: 'left',
                                                '&:hover .src-title': { color: 'primary.main', textDecoration: 'underline' } }}>
                                {s.type === 'db' ? <TaskAltIcon sx={{ fontSize: 15, color: 'text.secondary' }} /> : <DescriptionOutlinedIcon sx={{ fontSize: 15, color: 'text.secondary' }} />}
                                <Typography variant="caption" sx={{ fontWeight: 600, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{s.type === 'db' ? s.ref : 'Wiki'}</Typography>
                                <Typography className="src-title" variant="caption" color="text.secondary" noWrap>{s.title}</Typography>
                              </ButtonBase>
                            ))}
                          </Box>
                        )}
                      </Paper>
                      {!m.error && <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>
                        {m.mode === 'genai' ? 'GenAI Studio' : 'Yerel mod'}{m.ms !== undefined && m.ms >= 100 ? ` · ${(m.ms / 1000).toFixed(1)} sn` : ''}</Typography>}
                    </Box>
                  </Box>
                ))}
                {busy && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, color: 'text.secondary', pl: 0.25 }}>
                    <CircularProgress size={16} /><Typography variant="caption">Geçmiş kayıtlar inceleniyor…</Typography>
                  </Box>
                )}
                <div ref={end} />
              </Box>
            )}
          </Box>

          {/* Soru alanı */}
          <Box component="form" onSubmit={(e) => { e.preventDefault(); void ask(text) }}
               sx={{ flexShrink: 0, px: 1.5, pt: 1.25, pb: 1, borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
            <Box sx={(t) => ({ display: 'flex', alignItems: 'flex-end', gap: 1, px: 1.25, py: 0.75, borderRadius: 1.5, border: 1, borderColor: 'divider',
                               '&:focus-within': { borderColor: 'primary.main', boxShadow: `0 0 0 3px ${alpha(t.palette.primary.main, 0.12)}` } })}>
              <InputBase value={text} onChange={(e) => setText(e.target.value)} placeholder="Sorunuzu yazın…" multiline maxRows={5} fullWidth autoFocus
                         disabled={backend !== 'api'} inputProps={{ 'aria-label': 'Soru', maxLength: 2000 }}
                         onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(text) } }}
                         sx={{ fontSize: 14, py: 0.25 }} />
              <IconButton type="submit" size="small" disabled={busy || !text.trim() || backend !== 'api'} aria-label="Gönder"
                          sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', borderRadius: 1.25, '&:hover': { bgcolor: 'primary.dark' },
                                '&.Mui-disabled': { bgcolor: 'action.disabledBackground' } }}>
                <ArrowUpwardIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Box>
            <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.75, px: 0.5 }}>
              Enter gönderir, Shift+Enter yeni satır. Cevaplar Yaver kayıtlarına dayanır; kritik kararlarda kaynakları kontrol edin.
            </Typography>
          </Box>
        </Paper>
      )}
    </>
  )
}
