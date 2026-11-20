import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import AttachFileIcon from '@mui/icons-material/AttachFile'
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined'
import MarkEmailUnreadOutlinedIcon from '@mui/icons-material/MarkEmailUnreadOutlined'
import SearchIcon from '@mui/icons-material/Search'
import TaskAltIcon from '@mui/icons-material/TaskAlt'
import {
  Box, Button, ButtonBase, Chip, IconButton, InputAdornment, Paper, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AgentSnippet, GenaiPending } from '../components/AgentKit'
import { EmptyState, StatusChip, UserAvatar, WorkItemDrawer, formatDateTime, timeAgo } from '../components/WorkKit'
import { markEmailRead, useDb } from '../data/store'
import type { Email, WorkItem } from '../data/types'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useUi } from '../layouts/ui'

export default function Emails() {
  useDocumentTitle('Gelen kutusu')
  const db = useDb()
  const { openNew } = useUi()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'unread' | 'untracked'>('all')
  const [openId, setOpenId] = useState<number | null>(null)
  const [item, setItem] = useState<WorkItem | null>(null)

  const rows = useMemo(() => {
    const t = q.trim().toLocaleLowerCase('tr')
    return db.emails
      .filter((e) => filter === 'all' || (filter === 'unread' ? !e.is_read : !e.work_item_id))
      .filter((e) => !t || `${e.subject} ${e.from_name} ${e.from_address} ${e.body_preview}`.toLocaleLowerCase('tr').includes(t))
      .sort((a, b) => b.received_at.localeCompare(a.received_at))
  }, [db.emails, q, filter])

  const select = (e: Email) => { setOpenId(e.id); if (!e.is_read) markEmailRead(e.id) }
  useEffect(() => {
    const id = Number(params.get('open'))
    if (id) { const e = db.emails.find((x) => x.id === id); if (e) select(e); params.delete('open'); setParams(params, { replace: true }) }
    else if (openId === null && rows[0] && window.matchMedia('(min-width: 900px)').matches) setOpenId(rows[0].id)
  }, [params]) // eslint-disable-line react-hooks/exhaustive-deps

  const mail = db.emails.find((e) => e.id === openId) ?? null
  const linked = mail?.work_item_id ? db.items.find((w) => w.id === mail.work_item_id) : undefined
  const toWork = (e: Email) => openNew({
    title: e.subject, description: `${e.from_name} <${e.from_address}>\n\n${e.body_preview}`, source_type: 'mail', source_id: e.id,
    requester: e.from_name, priority: e.importance === 'high' ? 'high' : 'normal', category: 'Talep',
  })
  const unread = db.emails.filter((e) => !e.is_read).length

  // Masaüstü: iki panel; mobil: liste ↔ okuma paneli
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', mb: 2.5, gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography component="h1" sx={{ fontSize: { xs: 24, md: 28 }, fontWeight: 700, letterSpacing: '-0.03em' }}>Gelen kutusu</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{db.general.mailbox} · {unread} okunmamış</Typography>
        </Box>
      </Box>
      <Paper variant="outlined" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '380px 1fr' }, height: { md: 'calc(100vh - 210px)' }, minHeight: 520, overflow: 'hidden' }}>
        {/* Liste */}
        <Box sx={(t) => ({ display: { xs: mail ? 'none' : 'flex', md: 'flex' }, flexDirection: 'column', minHeight: 0, [t.breakpoints.up('md')]: { display: 'flex', borderRight: `1px solid ${t.palette.divider}` } })}>
          <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider', display: 'grid', gap: 1.25 }}>
            <TextField size="small" placeholder="Maillerde ara" value={q} onChange={(e) => setQ(e.target.value)} sx={{ '& .MuiOutlinedInput-root': { height: 34 } }}
                       slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 17 }} /></InputAdornment> } }} />
            <ToggleButtonGroup exclusive size="small" value={filter} onChange={(_, v) => v && setFilter(v)} sx={{ '& .MuiToggleButton-root': { flex: 1, fontSize: 12.5 } }}>
              <ToggleButton value="all">Tümü</ToggleButton>
              <ToggleButton value="unread">Okunmamış</ToggleButton>
              <ToggleButton value="untracked">İşe dönmemiş</ToggleButton>
            </ToggleButtonGroup>
          </Box>
          <Box sx={{ overflowY: 'auto', flexGrow: 1 }}>
            {rows.length === 0 && <EmptyState icon={<InboxOutlinedIcon />} title="Gelen kutusu boş" hint="Bu filtrede mail yok." />}
            {rows.map((e) => {
              const active = e.id === openId
              return (
                <ButtonBase key={e.id} onClick={() => select(e)}
                            sx={(t) => ({ display: 'block', width: '100%', textAlign: 'left', px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider', position: 'relative',
                                          bgcolor: active ? alpha(t.palette.primary.main, 0.06) : 'transparent', '&:hover': { bgcolor: active ? alpha(t.palette.primary.main, 0.08) : 'action.hover' },
                                          '&::before': active ? { content: '""', position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, borderRadius: 2, bgcolor: 'primary.main' } : {} })}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {!e.is_read && <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'primary.main', flexShrink: 0 }} />}
                    <Typography variant="body2" noWrap sx={{ fontWeight: e.is_read ? 500 : 700, flexGrow: 1 }}>{e.from_name}</Typography>
                    {e.has_attachments && <AttachFileIcon sx={{ fontSize: 14, color: 'text.disabled' }} />}
                    <Typography variant="caption" color="text.disabled" sx={{ flexShrink: 0 }}>{timeAgo(e.received_at)}</Typography>
                  </Box>
                  <Typography variant="body2" noWrap sx={{ fontWeight: e.is_read ? 450 : 600, mt: 0.25, color: e.is_read ? 'text.secondary' : 'text.primary' }}>
                    {e.importance === 'high' && <Box component="span" sx={{ color: 'error.main', fontWeight: 700, mr: 0.5 }}>!</Box>}{e.subject}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25 }}>
                    <Typography variant="caption" color="text.disabled" noWrap sx={{ flexGrow: 1 }}>{e.body_preview}</Typography>
                    {e.work_item_id && <Chip size="small" icon={<TaskAltIcon sx={{ fontSize: '13px !important' }} />} label={db.items.find((w) => w.id === e.work_item_id)?.code}
                                             sx={{ height: 20, fontSize: 11, flexShrink: 0 }} />}
                  </Box>
                </ButtonBase>
              )
            })}
          </Box>
        </Box>

        {/* Okuma paneli */}
        <Box sx={{ display: { xs: mail ? 'flex' : 'none', md: 'flex' }, flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
          <AnimatePresence mode="wait">
            {mail ? (
              <motion.div key={mail.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
                          style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 2, height: 52, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
                  <IconButton sx={{ display: { md: 'none' } }} onClick={() => setOpenId(null)} aria-label="Listeye dön"><ArrowBackIcon fontSize="small" /></IconButton>
                  <Box sx={{ flexGrow: 1 }} />
                  <Tooltip title="Okunmadı olarak işaretle"><IconButton onClick={() => markEmailRead(mail.id, false)} aria-label="Okunmadı işaretle"><MarkEmailUnreadOutlinedIcon fontSize="small" /></IconButton></Tooltip>
                  {!linked && <Button variant="contained" size="small" startIcon={<TaskAltIcon />} onClick={() => toWork(mail)}>İşe dönüştür</Button>}
                </Box>
                <Box sx={{ overflowY: 'auto', p: { xs: 2.5, md: 4 }, flexGrow: 1 }}>
                  <Typography sx={{ fontSize: 22, fontWeight: 650, letterSpacing: '-0.02em', lineHeight: 1.3 }}>{mail.subject}</Typography>
                  <Box sx={{ display: 'flex', gap: 0.75, mt: 1 }}>
                    {mail.importance === 'high' && <Chip size="small" color="error" variant="outlined" label="Yüksek önem" />}
                    {mail.has_attachments && <Chip size="small" variant="outlined" icon={<AttachFileIcon sx={{ fontSize: '14px !important' }} />} label="Ek var" />}
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 3 }}>
                    <UserAvatar name={mail.from_name} size={38} />
                    <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{mail.from_name} <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>&lt;{mail.from_address}&gt;</Box></Typography>
                      <Typography variant="caption" color="text.secondary" component="div" noWrap>
                        Kime: {mail.to_addresses.join(', ')}{mail.cc_addresses.length ? ` · Bilgi: ${mail.cc_addresses.join(', ')}` : ''}
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>{formatDateTime(mail.received_at)}</Typography>
                  </Box>
                  {linked && (
                    <ButtonBase onClick={() => setItem(linked)}
                                sx={(t) => ({ display: 'flex', width: '100%', textAlign: 'left', gap: 1.5, alignItems: 'center', mt: 3, p: 1.5, borderRadius: 2.5,
                                              border: `1px solid ${alpha(t.palette.primary.main, 0.25)}`, bgcolor: alpha(t.palette.primary.main, 0.04), '&:hover': { bgcolor: alpha(t.palette.primary.main, 0.08) } })}>
                      <TaskAltIcon color="primary" fontSize="small" />
                      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                        <Typography variant="caption" color="text.secondary">Bu mail bir işe bağlı</Typography>
                        <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{linked.code} · {linked.title}</Typography>
                      </Box>
                      <StatusChip status={linked.status} />
                    </ButtonBase>
                  )}
                  {linked && (linked.agent_comment ? <AgentSnippet item={linked} lines={3} /> : <GenaiPending item={linked} compact />)}
                  <Typography sx={{ mt: 3, fontSize: 15, lineHeight: 1.75, whiteSpace: 'pre-wrap', maxWidth: 680 }}>{mail.body_preview}</Typography>
                  <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 4 }}>Kutu: {mail.mailbox} · Message-ID: {mail.message_id}</Typography>
                </Box>
              </motion.div>
            ) : (
              <Box sx={{ m: 'auto' }}><EmptyState icon={<InboxOutlinedIcon />} title="Bir mail seçin" hint="Okumak için soldaki listeden bir mail seçin." /></Box>
            )}
          </AnimatePresence>
        </Box>
      </Paper>
      <WorkItemDrawer item={item} onClose={() => setItem(null)} />
    </Box>
  )
}
