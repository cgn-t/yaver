import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import {
  Alert, Box, Button, ButtonBase, Chip, CircularProgress, Collapse, Divider, FormControlLabel, Grid, MenuItem, Paper,
  Stack, Switch, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import { useSnackbar } from 'notistack'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LiveDot } from '../components/Motion'
import PageHeader from '../components/PageHeader'
import { AnimatePresence, motion } from 'motion/react'
import { formatDateTime } from '../components/WorkKit'
import {
  addApiConfig, clearApiLogs, deleteApiConfig, resetDemoData, saveApiConfig, saveGeneral, saveLdap, SOURCE_LABEL, useDb,
} from '../data/store'
import type { ApiServiceConfig, GeneralConfig, LdapConfig } from '../data/types'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useApiPoller } from '../services/apiPoller'
import { MONO_FONT } from '../theme'

// ---------- Ortak form parçaları (Jumbo Ayarlar ile aynı yapı) ----------
type Setter<T> = React.Dispatch<React.SetStateAction<T>>

function Text<T extends object>({ form, setForm, field, label, type, helper, width, multiline, rows, mono, disabled }: {
  form: T; setForm: Setter<T>; field: keyof T & string; label: string; type?: string; helper?: string
  width?: { xs: number; sm: number }; multiline?: boolean; rows?: number; mono?: boolean; disabled?: boolean
}) {
  return (
    <Grid size={width ?? { xs: 12, sm: 6 }}>
      <TextField label={label} type={type} fullWidth size="small" helperText={helper} multiline={multiline} rows={rows} disabled={disabled}
                 value={String(form[field] ?? '')}
                 slotProps={mono ? { input: { sx: { fontFamily: MONO_FONT, fontSize: 13 } } } : undefined}
                 onChange={(e) => setForm((f) => ({ ...f, [field]: type === 'number' ? Number(e.target.value) : e.target.value }))} />
    </Grid>
  )
}

function Toggle<T extends object>({ form, setForm, field, label, disabled, extra }: {
  form: T; setForm: Setter<T>; field: keyof T & string; label: string; disabled?: boolean; extra?: (v: boolean) => Partial<T>
}) {
  return (
    <FormControlLabel label={label}
      control={<Switch checked={!!form[field]} disabled={disabled}
                       onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.checked, ...(extra?.(e.target.checked) ?? {}) }))} />} />
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Typography variant="overline" color="text.secondary" sx={{ mt: 1, display: 'block' }}>{children}</Typography>
}

/** Saniyede bir yeniden çizim (geri sayım için) */
function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const h = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(h) }, [ms])
  return now
}

const intervalLabel = (sec: number) => (sec % 3600 === 0 ? `${sec / 3600} sa` : sec % 60 === 0 ? `${sec / 60} dk` : `${sec} sn`)

// ---------- LDAP (Jumbo'daki LDAP sekmesinin aynısı) ----------
function LdapTab() {
  const db = useDb()
  const { enqueueSnackbar } = useSnackbar()
  const [form, setForm] = useState<LdapConfig>(db.ldap)
  const [testing, setTesting] = useState(false)

  const test = async () => {
    const missing = (['server', 'port', 'bind_dn', 'base_dn', 'user_filter'] as const).filter((k) => !form[k])
    if (missing.length) { enqueueSnackbar(`Eksik alan: ${missing.join(', ')}`, { variant: 'warning' }); return }
    setTesting(true)
    try {
      // Backend uç noktası: POST /api/settings/ldap/test → { success, message }
      const res = await fetch('/api/settings/ldap/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const d = await res.json()
      enqueueSnackbar(d.message ?? `HTTP ${res.status}`, { variant: d.success ? 'success' : 'error' })
    } catch {
      enqueueSnackbar('Bağlantı testi backend üzerinden yapılır; backend henüz bağlı değil. Ayarlar formatça geçerli.', { variant: 'info' })
    } finally { setTesting(false) }
  }

  return (
    <Stack spacing={2}>
      <Alert severity="info">
        LDAP etkinleştirildiğinde lokal olmayan kullanıcılar Active Directory ile doğrulanır.
        Acil erişim için lokal <b>admin</b> hesabı her zaman çalışır.
      </Alert>
      <Toggle form={form} setForm={setForm} field="enabled" label="LDAP Kimlik Doğrulama Etkin" />

      <SectionLabel>Bağlantı</SectionLabel>
      <Grid container spacing={2}>
        <Text form={form} setForm={setForm} field="server" label="Host (ldaps://dc.firma.local)" width={{ xs: 12, sm: 8 }} />
        <Text form={form} setForm={setForm} field="port" label="Port" type="number" helper="636 = LDAPS, 389 = düz/StartTLS" width={{ xs: 12, sm: 4 }} />
        <Grid size={{ xs: 12, sm: 4 }}><Toggle form={form} setForm={setForm} field="use_ssl" label="LDAPS (doğrudan TLS, 636)"
                                                extra={(v) => (v ? { start_tls: false } : {})} /></Grid>
        <Grid size={{ xs: 12, sm: 4 }}><Toggle form={form} setForm={setForm} field="start_tls" label="StartTLS (389)" disabled={form.use_ssl} /></Grid>
        <Grid size={{ xs: 12, sm: 4 }}><Toggle form={form} setForm={setForm} field="skip_cert_verify" label="Sertifika doğrulamasını atla (dev)" /></Grid>
        <Text form={form} setForm={setForm} field="ca_cert" label="Dahili CA sertifikası (PEM, opsiyonel)" multiline rows={3} mono
              helper="AD dahili CA kullanıyorsa PEM demetini yapıştırın; boşsa sistem kökleri kullanılır." width={{ xs: 12, sm: 12 }} />
        <Text form={form} setForm={setForm} field="bind_dn" label="Bind DN (servis hesabı)" helper="Kullanıcı + grup araması için kullanılır" />
        <Text form={form} setForm={setForm} field="bind_password" label="Bind Şifresi" type="password" helper="Servis hesabı şifresi" />
        <Text form={form} setForm={setForm} field="timeout_sec" label="Zaman aşımı (sn)" type="number" width={{ xs: 12, sm: 4 }} />
      </Grid>

      <SectionLabel>Kullanıcı Araması</SectionLabel>
      <Grid container spacing={2}>
        <Text form={form} setForm={setForm} field="base_dn" label="Base DN (DC=firma,DC=local)" helper="Kullanıcıların aranacağı yer" />
        <Text form={form} setForm={setForm} field="user_filter" label="Kullanıcı arama filtresi" helper="{username} çalışma anında değiştirilir" />
        <Text form={form} setForm={setForm} field="user_attr" label="Kullanıcı attribute" helper="ör. sAMAccountName" width={{ xs: 12, sm: 4 }} />
        <Text form={form} setForm={setForm} field="email_attr" label="E-posta attribute" helper="ör. mail" width={{ xs: 12, sm: 4 }} />
        <Text form={form} setForm={setForm} field="display_attr" label="Görünen ad attribute" helper="ör. displayName" width={{ xs: 12, sm: 4 }} />
      </Grid>

      <SectionLabel>Grup Araması (opsiyonel)</SectionLabel>
      <Alert severity="info">
        Bazı dizinler kullanıcı girdisinde <code>memberOf</code> doldurmaz. Grup tabanı + filtre verirseniz ayrı bir grup araması yapılır; aksi halde boş bırakın.
      </Alert>
      <Grid container spacing={2}>
        <Text form={form} setForm={setForm} field="group_base" label="Grup arama tabanı" helper="ör. OU=Groups,DC=firma,DC=local" />
        <Text form={form} setForm={setForm} field="group_filter" label="Grup filtresi" helper="{user_dn} çalışma anında değiştirilir — ör. (member={user_dn})" />
      </Grid>

      <SectionLabel>Ekip Grubu</SectionLabel>
      <Grid container spacing={2}>
        <Text form={form} setForm={setForm} field="team_group_ou" label="Ekip grubu OU'su"
              helper="Bu OU altındaki grup kişinin ekibi sayılır — ör. ScrumGroup (CN=SY-BBB,OU=ScrumGroup,…)" />
      </Grid>

      <Stack direction="row" spacing={2}>
        <Button variant="contained" disableElevation onClick={() => { saveLdap(form); enqueueSnackbar('Ayarlar kaydedildi', { variant: 'success' }) }}>Kaydet</Button>
        <Button variant="outlined" onClick={test} disabled={testing}>{testing ? 'Test ediliyor…' : 'Bağlantıyı Test Et'}</Button>
      </Stack>
    </Stack>
  )
}

// ---------- API Çağrı Servisi ----------
const INTERVAL_PRESETS = [30, 60, 300, 900, 3600]

function ApiServiceTab() {
  const db = useDb()
  const { enqueueSnackbar } = useSnackbar()
  const { running, runNow, nextRunAt } = useApiPoller()
  const now = useNow()
  const [selId, setSelId] = useState<number | null>(db.apiConfigs[0]?.id ?? null)
  const saved = db.apiConfigs.find((c) => c.id === selId) ?? null
  const [form, setForm] = useState<ApiServiceConfig | null>(saved)
  useEffect(() => { setForm(db.apiConfigs.find((c) => c.id === selId) ?? null) }, [selId]) // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = !!form && !!saved && JSON.stringify({ ...form, last_run_at: null, last_status: null }) !== JSON.stringify({ ...saved, last_run_at: null, last_status: null })

  const save = () => {
    if (!form) return
    if (form.interval_sec < 10) { enqueueSnackbar('Çağrı aralığı en az 10 sn olmalı', { variant: 'warning' }); return }
    if (form.headers.trim()) { try { JSON.parse(form.headers) } catch { enqueueSnackbar('Ek başlıklar geçerli JSON değil', { variant: 'error' }); return } }
    saveApiConfig({ ...form, last_run_at: saved?.last_run_at ?? null, last_status: saved?.last_status ?? null })
    enqueueSnackbar('Servis kaydedildi', { variant: 'success' })
  }
  const toggleEnabled = (c: ApiServiceConfig, enabled: boolean) => {
    saveApiConfig({ ...c, enabled })
    if (form?.id === c.id) setForm({ ...form, enabled })
  }

  return (
    <Stack spacing={2.5}>
      <Alert severity="info">
        Etkin servisler belirlenen aralıkta (varsayılan <b>1 dk</b>) otomatik çağrılır. Dönen JSON dizi
        (veya <code>{'{ items: [...] }'}</code>) seçilen hedefe kaydedilir: <b>E-posta</b>, <b>Zoom</b> ya da <b>İş</b>.
        Her çağrı <b>Çağrı Geçmişi</b>'ne yazılır. Önceki çağrı bitmeden yenisi başlamaz.
      </Alert>

      <Stack spacing={1}>
        <AnimatePresence initial={false}>
        {db.apiConfigs.map((c) => {
          const due = nextRunAt(c)
          const left = due === null ? null : Math.max(0, Math.round((due - now) / 1000))
          const busy = running.includes(c.id)
          return (
            <motion.div key={c.id} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 24 }}
                        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}>
            <Paper variant="outlined" onClick={() => setSelId(c.id)}
                   sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, cursor: 'pointer', flexWrap: 'wrap',
                         transition: 'border-color .2s ease, box-shadow .2s ease',
                         '&:hover': { boxShadow: '0 6px 20px rgba(0,0,0,0.06)' },
                         borderColor: selId === c.id ? 'primary.main' : 'divider',
                         boxShadow: selId === c.id ? '0 0 0 1px #e53946' : 'none' }}>
              <Switch checked={c.enabled} onClick={(e) => e.stopPropagation()} onChange={(e) => toggleEnabled(c, e.target.checked)}
                      slotProps={{ input: { 'aria-label': `${c.name} etkin` } }} />
              <LiveDot active={c.enabled} color={c.last_status === 'error' ? '#f44336' : '#4caf50'} />
              <Box sx={{ flexGrow: 1, minWidth: 180 }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{c.name}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: MONO_FONT }} noWrap component="div">{c.method} {c.url || '(URL yok)'}</Typography>
              </Box>
              <Chip size="small" variant="outlined" label={`Her ${intervalLabel(c.interval_sec)}`} />
              <Chip size="small" variant="outlined" label={c.target === 'generic' ? 'Hedef: İş' : `Hedef: ${SOURCE_LABEL[c.target]}`} />
              {c.last_status && <Chip size="small" color={c.last_status === 'ok' ? 'success' : 'error'} label={c.last_status === 'ok' ? 'Son çağrı başarılı' : 'Son çağrı hatalı'} />}
              <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                {busy ? 'Çağrılıyor…' : left === null ? 'Kapalı' : `Sonraki: ${left} sn`}
              </Typography>
              <Button size="small" variant="outlined" startIcon={busy ? <CircularProgress size={14} /> : <PlayArrowIcon />} disabled={busy}
                      onClick={(e) => { e.stopPropagation(); void runNow(c.id) }}>Şimdi çalıştır</Button>
            </Paper>
            </motion.div>
          )
        })}
        </AnimatePresence>
        <Box><Button startIcon={<AddIcon />} onClick={() => setSelId(addApiConfig().id)}>Servis ekle</Button></Box>
      </Stack>

      {form && (
        <Paper variant="outlined" sx={{ p: 2.5 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>{saved?.name} — ayarlar</Typography>
          {saved?.last_run_at && <Typography variant="caption" color="text.secondary">Son çağrı: {formatDateTime(saved.last_run_at)}</Typography>}
          <SectionLabel>Genel</SectionLabel>
          <Grid container spacing={2}>
            <Text form={form} setForm={setForm as Setter<ApiServiceConfig>} field="name" label="Servis adı" />
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField select fullWidth size="small" label="Hedef (dönen kayıtlar nereye yazılsın)" value={form.target}
                         onChange={(e) => setForm({ ...form, target: e.target.value as ApiServiceConfig['target'] })}>
                <MenuItem value="mail">E-posta (email tablosu)</MenuItem>
                <MenuItem value="zoom">Zoom toplantısı (meeting tablosu)</MenuItem>
                <MenuItem value="generic">İş (work_item tablosu)</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 3 }}>
              <TextField select fullWidth size="small" label="Metot" value={form.method}
                         onChange={(e) => setForm({ ...form, method: e.target.value as ApiServiceConfig['method'] })}>
                {['GET', 'POST', 'PUT'].map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
              </TextField>
            </Grid>
            <Text form={form} setForm={setForm as Setter<ApiServiceConfig>} field="url" label="URL" mono width={{ xs: 12, sm: 9 }}
                  helper="ör. https://api.firma.local/v1/tickets veya /api/integrations/mail/sync" />
          </Grid>
          <SectionLabel>Zamanlama</SectionLabel>
          <Grid container spacing={2} sx={{ alignItems: 'center' }}>
            <Text form={form} setForm={setForm as Setter<ApiServiceConfig>} field="interval_sec" label="Çağrı aralığı (sn)" type="number"
                  helper={`= ${intervalLabel(form.interval_sec || 0)} · en az 10 sn`} width={{ xs: 12, sm: 3 }} />
            <Grid size={{ xs: 12, sm: 6 }}>
              <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', rowGap: 0.75 }}>
                {INTERVAL_PRESETS.map((s) => (
                  <Chip key={s} label={intervalLabel(s)} clickable color={form.interval_sec === s ? 'primary' : 'default'}
                        variant={form.interval_sec === s ? 'filled' : 'outlined'} onClick={() => setForm({ ...form, interval_sec: s })} />
                ))}
              </Stack>
            </Grid>
            <Text form={form} setForm={setForm as Setter<ApiServiceConfig>} field="timeout_sec" label="Zaman aşımı (sn)" type="number" width={{ xs: 12, sm: 3 }} />
          </Grid>
          <SectionLabel>Kimlik doğrulama</SectionLabel>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField select fullWidth size="small" label="Tür" value={form.auth_type}
                         onChange={(e) => setForm({ ...form, auth_type: e.target.value as ApiServiceConfig['auth_type'] })}>
                <MenuItem value="none">Yok</MenuItem><MenuItem value="bearer">Bearer token</MenuItem>
                <MenuItem value="basic">Basic (kullanıcı/şifre)</MenuItem><MenuItem value="api_key">API anahtarı (başlık)</MenuItem>
              </TextField>
            </Grid>
            {form.auth_type === 'bearer' && <Text form={form} setForm={setForm as Setter<ApiServiceConfig>} field="auth_token" label="Token" type="password" width={{ xs: 12, sm: 8 }} />}
            {form.auth_type === 'api_key' && <>
              <Text form={form} setForm={setForm as Setter<ApiServiceConfig>} field="auth_header" label="Başlık adı" width={{ xs: 12, sm: 3 }} />
              <Text form={form} setForm={setForm as Setter<ApiServiceConfig>} field="auth_token" label="Anahtar" type="password" width={{ xs: 12, sm: 5 }} />
            </>}
            {form.auth_type === 'basic' && <>
              <Text form={form} setForm={setForm as Setter<ApiServiceConfig>} field="username" label="Kullanıcı" width={{ xs: 12, sm: 4 }} />
              <Text form={form} setForm={setForm as Setter<ApiServiceConfig>} field="password" label="Şifre" type="password" width={{ xs: 12, sm: 4 }} />
            </>}
          </Grid>
          <SectionLabel>İstek</SectionLabel>
          <Grid container spacing={2}>
            <Text form={form} setForm={setForm as Setter<ApiServiceConfig>} field="headers" label="Ek başlıklar (JSON)" multiline rows={4} mono
                  width={{ xs: 12, sm: form.method === 'GET' ? 12 : 6 }} />
            {form.method !== 'GET' && <Text form={form} setForm={setForm as Setter<ApiServiceConfig>} field="body" label="Gövde (JSON)" multiline rows={4} mono />}
          </Grid>
          <Stack direction="row" spacing={2} sx={{ mt: 2.5 }}>
            <Button variant="contained" disableElevation onClick={save} disabled={!dirty}>Kaydet</Button>
            <Button color="error" startIcon={<DeleteIcon />}
                    onClick={() => { deleteApiConfig(form.id); setSelId(db.apiConfigs.find((c) => c.id !== form.id)?.id ?? null) }}>Sil</Button>
            {dirty && <Typography variant="caption" color="warning.main" sx={{ alignSelf: 'center' }}>Kaydedilmemiş değişiklik var</Typography>}
          </Stack>
        </Paper>
      )}
    </Stack>
  )
}

// ---------- Çağrı Geçmişi ----------
function ApiLogTab() {
  const db = useDb()
  const [svc, setSvc] = useState<number | ''>('')
  const rows = db.apiLogs.filter((l) => svc === '' || l.config_id === svc).slice(0, 200)
  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1.5}>
        <TextField select size="small" label="Servis" value={svc} sx={{ width: 260 }} onChange={(e) => setSvc(e.target.value === '' ? '' : Number(e.target.value))}>
          <MenuItem value="">Tümü</MenuItem>
          {db.apiConfigs.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
        </TextField>
        <Box sx={{ flexGrow: 1 }} />
        <Button color="error" onClick={clearApiLogs} disabled={!db.apiLogs.length}>Geçmişi temizle</Button>
      </Stack>
      <Paper variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead><TableRow>
              <TableCell>Zaman</TableCell><TableCell>Servis</TableCell><TableCell>Sonuç</TableCell><TableCell>HTTP</TableCell>
              <TableCell>Süre</TableCell><TableCell>Yeni kayıt</TableCell><TableCell>Mesaj</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {rows.map((l) => (
                <TableRow key={l.id}>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(l.started_at)}</TableCell>
                  <TableCell>{l.config_name}</TableCell>
                  <TableCell><Chip size="small" color={l.ok ? 'success' : 'error'} label={l.ok ? 'Başarılı' : 'Hata'} /></TableCell>
                  <TableCell>{l.http_status ?? '—'}</TableCell>
                  <TableCell>{l.duration_ms} ms</TableCell>
                  <TableCell>{l.record_count}</TableCell>
                  <TableCell sx={{ maxWidth: 360 }}><Typography variant="body2" noWrap title={l.message}>{l.message}</Typography></TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && <TableRow><TableCell colSpan={7} sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>Henüz çağrı yapılmadı.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Stack>
  )
}

// ---------- Genel ----------
function GeneralTab() {
  const db = useDb()
  const { enqueueSnackbar } = useSnackbar()
  const [form, setForm] = useState<GeneralConfig>(db.general)
  const [members, setMembers] = useState(db.general.team_members.join('\n'))
  return (
    <Stack spacing={2}>
      <Grid container spacing={2}>
        <Text form={form} setForm={setForm} field="app_title" label="Uygulama başlığı" />
        <Text form={form} setForm={setForm} field="mailbox" label="Takip edilen posta kutusu" helper="ör. takim@firma.com" />
        <Text form={form} setForm={setForm} field="sla_hours" label="Varsayılan çözüm süresi (saat)" type="number" />
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField select fullWidth size="small" label="Varsayılan atanan" value={form.default_assignee}
                     onChange={(e) => setForm({ ...form, default_assignee: e.target.value })}>
            <MenuItem value="">— Yok —</MenuItem>
            {form.team_members.map((u) => <MenuItem key={u} value={u}>{u}</MenuItem>)}
          </TextField>
        </Grid>
        <Grid size={12}>
          <TextField label="Takım üyeleri (her satıra bir kullanıcı adı)" fullWidth size="small" multiline rows={5} value={members}
                     onChange={(e) => setMembers(e.target.value)} helperText="LDAP etkinleştiğinde ekip grubundan otomatik doldurulabilir" />
        </Grid>
      </Grid>
      <Box>
        <Button variant="contained" disableElevation onClick={() => {
          const team_members = members.split('\n').map((s) => s.trim()).filter(Boolean)
          saveGeneral({ ...form, team_members }); setForm({ ...form, team_members })
          enqueueSnackbar('Ayarlar kaydedildi', { variant: 'success' })
        }}>Kaydet</Button>
      </Box>
      <Divider />
      <SectionLabel>Demo verisi</SectionLabel>
      <Alert severity="warning" action={<Button color="inherit" size="small" onClick={() => { resetDemoData(); enqueueSnackbar('Örnek veri yüklendi', { variant: 'info' }) }}>Sıfırla</Button>}>
        Backend bağlanana kadar veriler tarayıcıda tutulur. Sıfırla: iş/mail/toplantı kayıtlarını örnek veriye döndürür (ayarlar korunur).
      </Alert>
    </Stack>
  )
}

// ---------- Ayarlar kabuğu (Jumbo'daki gruplu sol menü) ----------
type NavItem = { key: string; label: string; desc: string; el: React.ReactNode; wide?: boolean }
const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  { title: 'Entegrasyonlar', items: [
    { key: 'api', label: 'API Çağrı Servisi', desc: 'Dış sistemlere belirli aralıklarla (varsayılan 1 dk) çağrı atar, dönen kayıtları içeri alır', wide: true, el: <ApiServiceTab /> },
    { key: 'api-log', label: 'Çağrı Geçmişi', desc: 'API çağrılarının sonucu, süresi ve alınan kayıt sayısı', wide: true, el: <ApiLogTab /> },
  ] },
  { title: 'Kimlik & Erişim', items: [
    { key: 'ldap', label: 'LDAP / Active Directory', desc: 'Kurumsal dizinle kimlik doğrulama', el: <LdapTab /> },
  ] },
  { title: 'Sistem', items: [
    { key: 'general', label: 'Genel', desc: 'Posta kutusu, takım üyeleri ve varsayılanlar', el: <GeneralTab /> },
  ] },
]
const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items)

export default function Settings() {
  useDocumentTitle('Ayarlar')
  const [params, setParams] = useSearchParams()
  const active = ALL_ITEMS.some((i) => i.key === params.get('tab')) ? params.get('tab')! : 'api'
  const setActive = (k: string) => setParams({ tab: k }, { replace: true })
  const groupOf = (k: string) => NAV_GROUPS.find((g) => g.items.some((i) => i.key === k))?.title ?? ''
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => Object.fromEntries(NAV_GROUPS.map((g) => [g.title, true])))
  const activeItem = ALL_ITEMS.find((i) => i.key === active)

  return (
    <Box>
      <PageHeader title="Ayarlar" subtitle="API çağrı servisi, LDAP entegrasyonu ve genel ayarlar" />
      <Paper sx={{ display: 'flex', alignItems: 'stretch', minHeight: 600, overflow: 'hidden', flexDirection: { xs: 'column', sm: 'row' } }}>
        <Box component="nav" sx={(t) => ({ flexShrink: 0, borderBottom: `1px solid ${t.palette.divider}`,
                                           [t.breakpoints.up('sm')]: { borderBottom: 0, borderRight: `1px solid ${t.palette.divider}` },
                                           width: { xs: '100%', sm: 248 }, py: 1.5, bgcolor: 'action.hover' })}>
          {NAV_GROUPS.map((g) => {
            const open = !!openGroups[g.title]
            const hasActive = groupOf(active) === g.title
            return (
              <Box key={g.title} sx={{ mb: 0.25 }}>
                <ButtonBase focusRipple onClick={() => setOpenGroups((o) => ({ ...o, [g.title]: !o[g.title] }))}
                            sx={{ display: 'flex', width: '100%', justifyContent: 'space-between', px: 2, py: 1, '&:hover': { bgcolor: 'action.selected' } }}>
                  <Typography variant="overline" sx={{ color: !open && hasActive ? 'primary.main' : 'text.secondary', fontWeight: 700, fontSize: 10.5, letterSpacing: '0.1em', lineHeight: 1.6 }}>{g.title}</Typography>
                  <ExpandMoreIcon sx={{ fontSize: 18, color: 'text.disabled', transition: 'transform .2s', transform: open ? 'none' : 'rotate(-90deg)' }} />
                </ButtonBase>
                <Collapse in={open} unmountOnExit>
                  <Box sx={{ pb: 0.5 }}>
                    {g.items.map((it) => {
                      const selected = active === it.key
                      return (
                        <ButtonBase key={it.key} focusRipple onClick={() => setActive(it.key)}
                                    sx={{ display: 'block', width: '100%', textAlign: 'left', pl: 2.5, pr: 1.5, py: 0.85,
                                          borderLeft: '3px solid', borderColor: selected ? 'primary.main' : 'transparent',
                                          bgcolor: selected ? 'background.paper' : 'transparent',
                                          '&:hover': { bgcolor: selected ? 'background.paper' : 'action.selected' } }}>
                          <Typography noWrap sx={{ fontSize: 13.5, fontWeight: selected ? 700 : 500, color: selected ? 'primary.main' : 'text.primary' }}>{it.label}</Typography>
                        </ButtonBase>
                      )
                    })}
                  </Box>
                </Collapse>
              </Box>
            )
          })}
        </Box>
        <Box sx={{ flexGrow: 1, minWidth: 0, overflowX: 'auto' }}>
          <Box sx={{ maxWidth: activeItem?.wide ? 'none' : 880, px: { xs: 2.5, md: 4 }, py: 3.5 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.25 }}>{activeItem?.label}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2.5 }}>{activeItem?.desc}</Typography>
            <Divider sx={{ mb: 3 }} />
            <Box key={active}>{activeItem?.el}</Box>
          </Box>
        </Box>
      </Paper>
    </Box>
  )
}
