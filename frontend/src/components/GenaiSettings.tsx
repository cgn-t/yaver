import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined'
import RefreshIcon from '@mui/icons-material/Refresh'
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogContent, DialogTitle, FormControlLabel, Grid, MenuItem, Paper, Stack, Switch,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import { useSnackbar } from 'notistack'
import { useCallback, useEffect, useState } from 'react'
import { apiFetch, ApiError, backend } from '../data/store'
import { MONO_FONT } from '../theme'
import { formatDateTime } from './WorkKit'

/** Sunucunun döndüğü GenAI ayarları: bağlantı değerleri YOK, yalnız ortam değişkeni tanımlı mı bilgisi. */
export interface GenaiConfig {
  active: boolean
  timeout_sec: number
  thread_mode: 'new' | 'per_item'
  auto_interpret: boolean
  auto_from_mail: boolean
  auto_from_zoom: boolean
  apply_topic: boolean
  apply_changes: boolean
  promote_suggestion: boolean
  fill_missing: boolean
  min_confidence: number
  max_context_chars: number
  max_attempts: number
  concurrency: number
  extra_instructions: string
  enabled: boolean
  env_enabled: boolean
  env: { name: string; required: boolean; set: boolean }[]
  missing: string[]
  stats: Record<string, number>
}
interface GenaiJob {
  id: number; kind: 'interpret' | 'mail' | 'meeting'; work_item_id: number | null; work_item_code: string | null; work_item_title: string | null
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped'; attempts: number; trigger: string | null; thread_id: string | null
  http_status: number | null; duration_ms: number | null; error: string | null; created_at: string; finished_at: string | null
  applied?: { topic: string[] | null; actions: { kind: string; applied: boolean; error?: string }[]; questions: number } | null
  warnings?: string[] | null
  response_text?: string; result?: unknown
}
interface TestResult { ok: boolean; steps: { step: string; ok: boolean; detail: string }[]; answer?: string; thread_id?: string | null; raw?: string }

const STATUS: Record<GenaiJob['status'], { label: string; color: 'default' | 'info' | 'success' | 'error' | 'warning' }> = {
  pending: { label: 'Kuyrukta', color: 'info' }, running: { label: 'Çalışıyor', color: 'info' }, done: { label: 'Tamam', color: 'success' },
  failed: { label: 'Hata', color: 'error' }, skipped: { label: 'Atlandı', color: 'default' },
}
const KIND = { interpret: 'Yorum', mail: 'Mail → iş', meeting: 'Zoom → iş' }

function Sw({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <FormControlLabel label={label} control={<Switch checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />} />
}

export function GenaiTab() {
  const { enqueueSnackbar } = useSnackbar()
  const [cfg, setCfg] = useState<GenaiConfig | null>(null)
  const [form, setForm] = useState<GenaiConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testMsg, setTestMsg] = useState('Merhaba')
  const [test, setTest] = useState<TestResult | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    try { const c = await apiFetch<GenaiConfig>('/settings/genai'); setCfg(c); setForm(c); setErr(null) } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }, [])
  useEffect(() => { if (backend === 'api') void load() }, [load])

  if (backend !== 'api') return <Alert severity="info">GenAI Studio entegrasyonu sunucu üzerinden çalışır; şu an demo modundasınız.</Alert>
  if (err) return <Alert severity="error">{err}</Alert>
  if (!form || !cfg) return <CircularProgress size={22} />

  const set = <K extends keyof GenaiConfig>(k: K, v: GenaiConfig[K]) => setForm((f) => (f ? { ...f, [k]: v } : f))
  const save = async () => {
    setSaving(true)
    try {
      const { enabled: _e, env_enabled: _ee, env: _env, missing: _m, stats: _s, ...body } = form
      const c = await apiFetch<GenaiConfig>('/settings/genai', { method: 'PUT', body })
      setCfg(c); setForm(c); enqueueSnackbar('GenAI ayarları kaydedildi', { variant: 'success' })
    } catch (e) { enqueueSnackbar(e instanceof ApiError ? e.message : String(e), { variant: 'error' }) } finally { setSaving(false) }
  }
  const runTest = async () => {
    setTesting(true); setTest(null)
    try { setTest(await apiFetch<TestResult>('/settings/genai/test', { method: 'POST', body: { test_message: testMsg } })) }
    catch (e) { enqueueSnackbar(e instanceof ApiError ? e.message : String(e), { variant: 'error' }) } finally { setTesting(false) }
  }
  const queueOpen = async () => {
    try { const r = await apiFetch<{ queued: number }>('/genai/interpret-open', { method: 'POST', body: { only_missing: true } }); enqueueSnackbar(`${r.queued} açık iş kuyruğa alındı`, { variant: 'info' }) }
    catch (e) { enqueueSnackbar(e instanceof ApiError ? e.message : String(e), { variant: 'error' }) }
  }

  return (
    <Stack spacing={2.5}>
      {cfg.enabled
        ? <Alert severity="success">Etkin. Yeni gelen her iş (Mail, Zoom, TFS, Jira, manuel) GenAI Studio Chat Block'a gönderilip yorumlanır ve kategorize edilir.</Alert>
        : cfg.missing.length
          ? <Alert severity="warning">Bağlantı bilgileri eksik. OpenShift'te şu ortam değişkenlerini Secret'tan verin: <b>{cfg.missing.join(', ')}</b></Alert>
          : <Alert severity="info">{cfg.env_enabled ? 'Ekrandan duraklatıldı.' : 'GENAI_ENABLED=false ile kapalı.'}</Alert>}

      <Box>
        <Typography sx={{ fontSize: 13, fontWeight: 650, mb: 1 }}>Bağlantı (ortam değişkenleri)</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          URL, app-id ve client bilgileri yalnız pod ortamından okunur; burada gösterilmez ve değiştirilemez.
        </Typography>
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
          {cfg.env.map((e) => (
            <Chip key={e.name} size="small" variant={e.set ? 'filled' : 'outlined'}
                  color={e.set ? 'success' : e.required ? 'warning' : 'default'}
                  icon={e.set ? <CheckCircleIcon /> : e.required ? <ErrorOutlineIcon /> : undefined}
                  label={<span style={{ fontFamily: MONO_FONT, fontSize: 12 }}>{e.name}{e.required ? '' : ' (ops.)'}</span>} />
          ))}
        </Stack>
      </Box>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 650, mb: 1 }}>Bağlantı testi</Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { sm: "center" } }}>
          <TextField size="small" label="Test mesajı" value={testMsg} onChange={(e) => setTestMsg(e.target.value)} sx={{ flexGrow: 1 }} />
          <Button variant="outlined" onClick={runTest} disabled={testing || cfg.missing.length > 0}
                  startIcon={testing ? <CircularProgress size={16} /> : undefined}>SSO token al + Chat Block'a gönder</Button>
        </Stack>
        {test && (
          <Stack spacing={1} sx={{ mt: 1.5 }}>
            {test.steps.map((s) => <Alert key={s.step} severity={s.ok ? 'success' : 'error'} sx={{ py: 0 }}><b>{s.step}</b>: {s.detail}</Alert>)}
            {test.answer !== undefined && (
              <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1.5, fontFamily: MONO_FONT, fontSize: 12.5, whiteSpace: 'pre-wrap', maxHeight: 220, overflow: 'auto' }}>
                {test.answer || test.raw}
              </Box>
            )}
          </Stack>
        )}
      </Paper>

      <Box>
        <Typography sx={{ fontSize: 13, fontWeight: 650, mb: 1 }}>Davranış</Typography>
        <Grid container spacing={0.5}>
          <Grid size={{ xs: 12, sm: 6 }}><Sw label="Etkin (duraklatmak için kapatın)" checked={form.active} onChange={(v) => set('active', v)} /></Grid>
          <Grid size={{ xs: 12, sm: 6 }}><Sw label="Her yeni işi yorumlat" checked={form.auto_interpret} onChange={(v) => set('auto_interpret', v)} /></Grid>
          <Grid size={{ xs: 12, sm: 6 }}><Sw label="İşe bağlı olmayan maili işe çevir" checked={form.auto_from_mail} onChange={(v) => set('auto_from_mail', v)} /></Grid>
          <Grid size={{ xs: 12, sm: 6 }}><Sw label="İşe bağlı olmayan Zoom toplantısını işe çevir" checked={form.auto_from_zoom} onChange={(v) => set('auto_from_zoom', v)} /></Grid>
          <Grid size={{ xs: 12, sm: 6 }}><Sw label="Konuyu AI belirlesin (MQ, Decom, …)" checked={form.apply_topic} onChange={(v) => set('apply_topic', v)} /></Grid>
          <Grid size={{ xs: 12, sm: 6 }}><Sw label="Durum / öncelik / atama önerilerini gönder" checked={form.apply_changes} onChange={(v) => set('apply_changes', v)} /></Grid>
          <Grid size={{ xs: 12, sm: 6 }}><Sw label="suggestion'daki öncelik/durum/atamayı da öner" checked={form.promote_suggestion} onChange={(v) => set('promote_suggestion', v)} disabled={!form.apply_changes} /></Grid>
          <Grid size={{ xs: 12, sm: 6 }}><Sw label="(Demo) Cevapta boş kalan alanları rastgele doldur" checked={form.fill_missing} onChange={(v) => set('fill_missing', v)} /></Grid>
        </Grid>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 2 }}>
          Öneriler Ajan politikasına göre uygulanır: varsayılanda durum, öncelik, atama ve son tarih onaya düşer; kategori ve etiket doğrudan yazılır.
          Kapatma ve iptal her zaman onay ister.
        </Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 4 }}><TextField fullWidth size="small" type="number" label="En düşük güven (0-1)" value={form.min_confidence}
            helperText="Altında yalnız yorum yazılır" slotProps={{ htmlInput: { step: 0.05, min: 0, max: 1 } }} onChange={(e) => set('min_confidence', Number(e.target.value))} /></Grid>
          <Grid size={{ xs: 12, sm: 4 }}><TextField fullWidth size="small" type="number" label="Zaman aşımı (sn)" value={form.timeout_sec} onChange={(e) => set('timeout_sec', Number(e.target.value))} /></Grid>
          <Grid size={{ xs: 12, sm: 4 }}><TextField fullWidth size="small" select label="Thread" value={form.thread_mode} onChange={(e) => set('thread_mode', e.target.value as GenaiConfig['thread_mode'])}>
            <MenuItem value="new">Her çağrı yeni thread</MenuItem><MenuItem value="per_item">Aynı iş aynı thread</MenuItem></TextField></Grid>
          <Grid size={{ xs: 12, sm: 4 }}><TextField fullWidth size="small" type="number" label="Bağlam üst sınırı (karakter)" value={form.max_context_chars} onChange={(e) => set('max_context_chars', Number(e.target.value))} /></Grid>
          <Grid size={{ xs: 12, sm: 4 }}><TextField fullWidth size="small" type="number" label="Deneme sayısı" value={form.max_attempts} onChange={(e) => set('max_attempts', Number(e.target.value))} /></Grid>
          <Grid size={{ xs: 12, sm: 4 }}><TextField fullWidth size="small" type="number" label="Eşzamanlı çağrı" value={form.concurrency} onChange={(e) => set('concurrency', Number(e.target.value))} /></Grid>
          <Grid size={12}><TextField fullWidth size="small" multiline rows={3} label="Ek talimatlar (prompta eklenir)" value={form.extra_instructions}
            helperText="Ör. 'OpenShift işlerini önce platform ekibine ata.' Gizli bilgi yazmayın." onChange={(e) => set('extra_instructions', e.target.value)} /></Grid>
        </Grid>
        <Stack direction="row" spacing={1.5} sx={{ mt: 2 }}>
          <Button variant="contained" onClick={save} disabled={saving}>Kaydet</Button>
          <Button onClick={queueOpen} disabled={!cfg.enabled}>Yorumu olmayan açık işleri yorumlat</Button>
        </Stack>
      </Box>
      <DemoFlowCard />
      <DraftDemoCard />
    </Stack>
  )
}

type DemoItem = { id: number; code: string; title: string; source_type: string; external_ref: string | null; genai_status: string | null; genai_error: string | null;
  agent_comment: string | null; agent_comment_by: string | null; pending_actions: number }
type DemoStatus = { mode: 'genai' | 'yerel'; total: number; commented: number; items: DemoItem[] }
const SRC_LABEL: Record<string, string> = { mail: 'Mail', zoom: 'Zoom', tfs: 'TFS', jira: 'Jira' }

/** Demo iş akışı: Jira/TFS/Mail/Zoom'dan demo işler → AI yorumu → DB (POST /api/demo/run). */
function DemoFlowCard() {
  const { enqueueSnackbar } = useSnackbar()
  const [st, setSt] = useState<DemoStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => { try { setSt(await apiFetch<DemoStatus>('/demo/status')) } catch { /* yetki yoksa gizli kalır */ } }, [])
  useEffect(() => { void load() }, [load])
  const pending = !!st?.items.some((x) => x.genai_status === 'pending' || x.genai_status === 'running')
  useEffect(() => { if (!pending) return; const t = setInterval(() => void load(), 3000); return () => clearInterval(t) }, [pending, load])
  const run = async () => {
    setBusy(true)
    try {
      const r = await apiFetch<{ count: number; mode: string; status: DemoStatus }>('/demo/run', { method: 'POST', body: {} })
      setSt(r.status)
      enqueueSnackbar(`${r.count} demo iş oluşturuldu; ${r.mode === 'genai' ? 'GenAI Studio yorumluyor' : 'yerel yorum yazıldı'}`, { variant: 'success' })
    } catch (e) { enqueueSnackbar(e instanceof Error ? e.message : String(e), { variant: 'error' }) } finally { setBusy(false) }
  }
  const clear = async () => {
    setBusy(true)
    try { await apiFetch('/demo/clear', { method: 'POST', body: {} }); await load() } catch (e) { enqueueSnackbar(e instanceof Error ? e.message : String(e), { variant: 'error' }) } finally { setBusy(false) }
  }
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="subtitle2">Demo iş akışı</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Jira, TFS, mail ve Zoom'dan gelmiş gibi demo işler oluşturur, her birini AI'a yorumlatıp DB'ye yazar. Tekrar çalıştırınca önceki demo işleri silinir.
        API: <code>POST /api/demo/run</code>, durum: <code>GET /api/demo/status</code>.
      </Typography>
      <Stack direction="row" spacing={1.5} sx={{ mb: st?.items.length ? 1.5 : 0 }}>
        <Button variant="contained" onClick={run} disabled={busy}>{busy ? 'Çalışıyor…' : 'Demo akışını çalıştır'}</Button>
        <Button onClick={clear} disabled={busy || !st?.total}>Demo işlerini sil</Button>
        {st && st.total > 0 && <Chip size="small" label={`${st.commented}/${st.total} yorumlandı`} color={st.commented === st.total ? 'success' : 'default'} sx={{ alignSelf: 'center' }} />}
      </Stack>
      {!!st?.items.length && (
        <TableContainer>
          <Table size="small">
            <TableHead><TableRow><TableCell>İş</TableCell><TableCell>Kaynak</TableCell><TableCell>AI</TableCell><TableCell>Yorum</TableCell></TableRow></TableHead>
            <TableBody>
              {st.items.map((x) => (
                <TableRow key={x.id}>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}><b>{x.code}</b> {x.title}</TableCell>
                  <TableCell>{SRC_LABEL[x.source_type] ?? x.source_type}{x.external_ref ? ` ${x.external_ref}` : ''}</TableCell>
                  <TableCell><Chip size="small" label={x.genai_status ?? (x.agent_comment ? 'yerel' : '—')}
                    color={x.genai_status === 'done' ? 'success' : x.genai_status === 'failed' ? 'error' : 'default'} title={x.genai_error ?? ''} /></TableCell>
                  <TableCell sx={{ maxWidth: 360 }}><Typography variant="caption" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {x.agent_comment ?? ''}</Typography></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Paper>
  )
}

type DraftSample = { key: string; from: string; text: string }
type DraftField = { key: string; required: boolean; type: string; desc: string }
type DraftResult = {
  key: string; input: { from: string; text: string }; mode?: string; error?: string; filled?: string[]; warnings?: string[]
  fields?: { subject: string; body: string; priority: string; category: string; topic_keys: string[]; assignee: string | null; due_date: string; eta_days: number; status: string; comment: string }
  item?: { id: number; code: string; title: string }
}
const PRIO_TR: Record<string, string> = { low: 'Düşük', normal: 'Normal', high: 'Yüksek', critical: 'Kritik' }
const STATUS_TR: Record<string, string> = { new: 'Yeni', in_progress: 'İşlemde', waiting: 'Bekliyor' }

/** Demo akışı 2: basit mail taslağını AI doldurur → mail + iş. */
function DraftDemoCard() {
  const { enqueueSnackbar } = useSnackbar()
  const [samples, setSamples] = useState<DraftSample[]>([])
  const [fields, setFields] = useState<DraftField[]>([])
  const [results, setResults] = useState<DraftResult[]>([])
  const [from, setFrom] = useState('deniz.arslan@firma.com')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [showFields, setShowFields] = useState(false)
  useEffect(() => {
    apiFetch<{ drafts: DraftSample[]; fields: DraftField[] }>('/demo/drafts').then((r) => { setSamples(r.drafts); setFields(r.fields) }).catch(() => { /* yetki yok */ })
  }, [])
  const run = async (body: object) => {
    setBusy(true)
    try {
      const r = await apiFetch<{ count: number; mode: string; results: DraftResult[] }>('/demo/draft', { method: 'POST', body })
      setResults(r.results)
      enqueueSnackbar(`${r.count} taslak ${r.mode === 'genai' ? 'GenAI Studio' : 'yerel doldurucu'} ile dolduruldu`, { variant: 'success' })
    } catch (e) { enqueueSnackbar(e instanceof Error ? e.message : String(e), { variant: 'error' }) } finally { setBusy(false) }
  }
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="subtitle2">Demo akışı 2: mail taslağını AI doldursun</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Yalnız gönderen ve tek cümleden oluşan bir taslak gelir. AI mail konusunu ve metnini yazar; işin kategori, konu, öncelik, atanan, son tarih ve durumunu
        geçmiş işlere bakarak doldurur. Sonuç mail + iş olarak kaydedilir. API: <code>POST /api/demo/draft</code>.{' '}
        <Box component="span" role="button" tabIndex={0} onClick={() => setShowFields((v) => !v)} sx={{ color: 'primary.main', cursor: 'pointer', fontWeight: 600 }}>
          {showFields ? 'Alanları gizle' : "AI'dan dönen alanlar"}</Box>
      </Typography>
      {showFields && (
        <TableContainer sx={{ mb: 1.5 }}>
          <Table size="small">
            <TableHead><TableRow><TableCell>Alan</TableCell><TableCell>Zorunlu</TableCell><TableCell>Değer</TableCell><TableCell>Açıklama</TableCell></TableRow></TableHead>
            <TableBody>{fields.map((f) => (
              <TableRow key={f.key}><TableCell sx={{ fontFamily: MONO_FONT }}>{f.key}</TableCell><TableCell>{f.required ? 'evet' : '—'}</TableCell>
                <TableCell>{f.type}</TableCell><TableCell>{f.desc}</TableCell></TableRow>))}</TableBody>
          </Table>
        </TableContainer>
      )}
      <Stack spacing={1} sx={{ mb: 1.5 }}>
        {samples.map((d) => (
          <Box key={d.key} sx={{ display: 'flex', gap: 1.5, alignItems: 'center', fontSize: 13 }}>
            <Typography variant="caption" color="text.secondary" sx={{ width: 190, flexShrink: 0 }} noWrap>{d.from}</Typography>
            <Typography variant="body2" sx={{ flex: 1 }}>“{d.text}”</Typography>
          </Box>
        ))}
      </Stack>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 1.5 }}>
        <Button variant="contained" onClick={() => run({})} disabled={busy}>{busy ? 'AI dolduruyor…' : 'Örnek taslakları AI ile doldur'}</Button>
        <TextField size="small" label="Gönderen" value={from} onChange={(e) => setFrom(e.target.value)} sx={{ minWidth: 220 }} />
        <TextField size="small" label="Kendi taslağınız (tek cümle yeter)" value={text} onChange={(e) => setText(e.target.value)} sx={{ flex: 1 }} />
        <Button variant="outlined" disabled={busy || !text.trim() || !from.includes('@')} onClick={() => run({ drafts: [{ from, text }] })}>Doldur</Button>
      </Stack>
      {!!results.length && (
        <TableContainer>
          <Table size="small">
            <TableHead><TableRow><TableCell>Taslak</TableCell><TableCell>AI'ın yazdığı konu</TableCell><TableCell>Öncelik</TableCell><TableCell>Kategori / konu</TableCell>
              <TableCell>Atanan</TableCell><TableCell>Son tarih</TableCell><TableCell>Durum</TableCell></TableRow></TableHead>
            <TableBody>
              {results.map((r) => (
                <TableRow key={r.key + (r.item?.id ?? '')}>
                  <TableCell sx={{ maxWidth: 220 }}><Typography variant="caption">“{r.input.text}”</Typography></TableCell>
                  {r.error || !r.fields
                    ? <TableCell colSpan={6}><Typography variant="caption" color="error">{r.error}</Typography></TableCell>
                    : <>
                      <TableCell sx={{ maxWidth: 320 }}><b>{r.item?.code}</b> {r.fields.subject}
                        {!!r.filled?.length && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Yerel doldurulan: {r.filled.join(', ')}</Typography>}</TableCell>
                      <TableCell>{PRIO_TR[r.fields.priority] ?? r.fields.priority}</TableCell>
                      <TableCell>{r.fields.category}{r.fields.topic_keys.length ? ` · ${r.fields.topic_keys.join(', ')}` : ''}</TableCell>
                      <TableCell>{r.fields.assignee ?? '—'}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{r.fields.due_date}</TableCell>
                      <TableCell>{STATUS_TR[r.fields.status] ?? r.fields.status}</TableCell>
                    </>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Paper>
  )
}

export function GenaiLogTab() {
  const { enqueueSnackbar } = useSnackbar()
  const [jobs, setJobs] = useState<GenaiJob[] | null>(null)
  const [detail, setDetail] = useState<GenaiJob | null>(null)
  const load = useCallback(async () => {
    try { setJobs((await apiFetch<{ jobs: GenaiJob[] }>('/genai/jobs?limit=100')).jobs) } catch { setJobs([]) }
  }, [])
  useEffect(() => {
    if (backend !== 'api') return
    void load()
    const h = setInterval(load, 5000)
    return () => clearInterval(h)
  }, [load])
  if (backend !== 'api') return <Alert severity="info">Sunucu bağlı değil.</Alert>
  if (!jobs) return <CircularProgress size={22} />

  const open = async (id: number) => { try { setDetail(await apiFetch<GenaiJob>(`/genai/jobs/${id}`)) } catch (e) { enqueueSnackbar(String(e), { variant: 'error' }) } }
  const retry = async (id: number) => {
    try { await apiFetch(`/genai/jobs/${id}/retry`, { method: 'POST' }); enqueueSnackbar('Tekrar kuyruğa alındı', { variant: 'info' }); void load() }
    catch (e) { enqueueSnackbar(e instanceof ApiError ? e.message : String(e), { variant: 'error' }) }
  }
  return (
    <Stack spacing={2}>
      <Paper variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead><TableRow>
              <TableCell>Zaman</TableCell><TableCell>Tür</TableCell><TableCell>İş</TableCell><TableCell>Sonuç</TableCell><TableCell>HTTP</TableCell>
              <TableCell>Süre</TableCell><TableCell>Uygulanan</TableCell><TableCell>Hata</TableCell><TableCell />
            </TableRow></TableHead>
            <TableBody>
              {jobs.map((j) => (
                <TableRow key={j.id} hover sx={{ cursor: 'pointer' }} onClick={() => open(j.id)}>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(j.created_at)}</TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>{KIND[j.kind]}</TableCell>
                  <TableCell sx={{ maxWidth: 260 }}><Typography variant="body2" noWrap title={j.work_item_title ?? ''}>{j.work_item_code ?? '—'} {j.work_item_title ?? ''}</Typography></TableCell>
                  <TableCell><Chip size="small" color={STATUS[j.status].color} label={`${STATUS[j.status].label}${j.attempts > 1 ? ` (${j.attempts})` : ''}`} /></TableCell>
                  <TableCell>{j.http_status ?? '—'}</TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>{j.duration_ms != null ? `${(j.duration_ms / 1000).toFixed(1)} sn` : '—'}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {j.applied ? [j.applied.topic?.length ? `konu: ${j.applied.topic.join(', ')}` : null,
                      j.applied.actions?.length ? `${j.applied.actions.filter((a) => a.applied).length} uygulandı / ${j.applied.actions.filter((a) => !a.applied && !a.error).length} onayda` : null]
                      .filter(Boolean).join(' · ') || 'yalnız yorum' : '—'}
                  </TableCell>
                  <TableCell sx={{ maxWidth: 280 }}><Typography variant="body2" color="error" noWrap title={j.error ?? ''}>{j.error ?? ''}</Typography></TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {(j.status === 'failed' || j.status === 'done') && j.kind === 'interpret' &&
                      <Button size="small" startIcon={<RefreshIcon />} onClick={() => retry(j.id)}>Tekrar</Button>}
                  </TableCell>
                </TableRow>
              ))}
              {jobs.length === 0 && <TableRow><TableCell colSpan={9} sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>Henüz GenAI çağrısı yapılmadı.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
      <Dialog open={!!detail} onClose={() => setDetail(null)} maxWidth="md" fullWidth>
        <DialogTitle>Çağrı #{detail?.id} {detail?.work_item_code ? `— ${detail.work_item_code}` : ''}</DialogTitle>
        <DialogContent>
          {detail?.error && <Alert severity="error" sx={{ mb: 2 }}>{detail.error}</Alert>}
          <Typography variant="caption" color="text.secondary">Ayrıştırılan yanıt ve uygulananlar</Typography>
          <Box component="pre" sx={{ mt: 0.5, p: 1.5, bgcolor: 'action.hover', borderRadius: 1.5, fontFamily: MONO_FONT, fontSize: 12, maxHeight: 340, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(detail?.result ?? null, null, 2)}
          </Box>
          <Typography variant="caption" color="text.secondary">Chat Block ham yanıtı</Typography>
          <Box component="pre" sx={{ mt: 0.5, p: 1.5, bgcolor: 'action.hover', borderRadius: 1.5, fontFamily: MONO_FONT, fontSize: 12, maxHeight: 240, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
            {detail?.response_text ?? '—'}
          </Box>
        </DialogContent>
      </Dialog>
    </Stack>
  )
}
