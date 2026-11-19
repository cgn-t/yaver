import AlternateEmailIcon from '@mui/icons-material/AlternateEmail'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined'
import RefreshIcon from '@mui/icons-material/Refresh'
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined'
import { Box, Chip, IconButton, Tooltip, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { useState } from 'react'
import { ageLabel, boldParts, isSenior, itemKeywords, MGMT_LABEL, plain } from '../data/groups'
import { backend, PRIORITY_LABEL, reinterpret, rulesOf, useDb } from '../data/store'
import type { AgentSource, WorkItem } from '../data/types'

/** Üst yönetim seviyesi rozeti (yalnız GM / GMY / Direktör için). */
export function MgmtChip({ item, always = false }: { item: WorkItem; always?: boolean }) {
  const lvl = item.mgmt_level ?? 'diger'
  if (!always && !isSenior(item)) return null
  const color = { gm: '#E5484D', gmy: '#F76B15', direktor: '#8E4EC6', mudur: '#3E63DD', diger: '#9A9EA8' }[lvl]
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', height: 20, px: 0.75, borderRadius: 1.5, fontSize: 11, fontWeight: 650,
                                color, bgcolor: alpha(color, 0.1), whiteSpace: 'nowrap', flexShrink: 0 }}>
      {MGMT_LABEL[lvl]}
    </Box>
  )
}

/** Maildeki anahtar kelimeler. */
export function KeywordChips({ item, max = 2 }: { item: WorkItem; max?: number }) {
  const db = useDb()
  const rules = rulesOf(db)
  const kws = itemKeywords(item, rules).map((k) => rules.find((r) => r.key === k)).filter(Boolean).slice(0, max)
  return (
    <>
      {kws.map((r) => (
        <Box key={r!.key} component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, height: 20, px: 0.75, borderRadius: 1.5,
                                                  fontSize: 11, fontWeight: 600, color: 'text.secondary', border: 1, borderColor: 'divider', whiteSpace: 'nowrap', flexShrink: 0 }}>
          <Box sx={{ width: 6, height: 6, borderRadius: '2px', bgcolor: r!.color }} />{r!.label}
        </Box>
      ))}
    </>
  )
}

export function AgeLabel({ item }: { item: WorkItem }) {
  return <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap', fontWeight: 500 }}>{ageLabel(item)}</Typography>
}

/** Kartlarda / listelerde ajan yorumunun ilk satırları. */
export function AgentSnippet({ item, lines = 2 }: { item: WorkItem; lines?: number }) {
  if (!item.agent_comment) return null
  // İlk satır genelde "kim istiyor"; özet için öneri + en yakın benzer iş satırlarını göster
  const all = item.agent_comment.split('\n').map(plain)
  const pick = [all.find((l) => l.startsWith('Öneri')), all.find((l) => l.startsWith('Geçmişte'))].filter(Boolean) as string[]
  const text = (pick.length ? pick : all).slice(0, lines).join(' · ')
  return (
    <Box sx={(t) => ({ display: 'flex', gap: 0.75, mt: 1, p: 0.75, pl: 1, borderRadius: 2, bgcolor: alpha(t.palette.primary.main, t.palette.mode === 'dark' ? 0.12 : 0.05) })}>
      <AutoAwesomeIcon sx={{ fontSize: 14, color: 'primary.main', mt: '2px', flexShrink: 0 }} />
      <Typography variant="caption" color="text.secondary"
                  sx={{ display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.45 }}>
        {text}
      </Typography>
    </Box>
  )
}

const SOURCE_ICON = { db: StorageOutlinedIcon, wiki: MenuBookOutlinedIcon, mail: AlternateEmailIcon, meeting: AlternateEmailIcon }
const SOURCE_TYPE_LABEL = { db: 'Geçmiş iş', wiki: 'Wiki', mail: 'Mail', meeting: 'Toplantı' }

/** İş detayında tam ajan yorumu: metin, kaynaklar (DB / Wiki / Mail), öneri, güven. */
export function AgentCommentBox({ item, onOpenItem }: { item: WorkItem; onOpenItem?: (id: number) => void }) {
  const [busy, setBusy] = useState(false)
  const s = item.agent_suggestion
  return (
    <Box sx={(t) => ({ mt: 2, p: 2, borderRadius: 3, border: 1, borderColor: alpha(t.palette.primary.main, 0.25),
                       background: `linear-gradient(180deg, ${alpha(t.palette.primary.main, t.palette.mode === 'dark' ? 0.14 : 0.06)}, transparent 70%)` })}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <AutoAwesomeIcon sx={{ fontSize: 18, color: 'primary.main' }} />
        <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>Ajan yorumu</Typography>
        {item.agent_confidence != null && (
          <Tooltip title="Ajanın bu yoruma güveni (benzer geçmiş kayıt, wiki ve kişi bilgisi arttıkça yükselir)">
            <Chip size="small" label={`Güven %${Math.round(item.agent_confidence * 100)}`} sx={{ height: 22, fontSize: 11.5 }} />
          </Tooltip>
        )}
        {backend === 'api' && (
          <Tooltip title="Geçmişe bakarak yeniden yorumla">
            <span>
              <IconButton size="small" disabled={busy} onClick={async () => { setBusy(true); await reinterpret(item.id); setBusy(false) }} aria-label="Yeniden yorumla">
                <RefreshIcon sx={{ fontSize: 17 }} />
              </IconButton>
            </span>
          </Tooltip>
        )}
      </Box>
      {item.agent_comment ? (
        <>
          {item.agent_comment.split('\n').map((line, i) => (
            <Typography key={i} variant="body2" sx={{ lineHeight: 1.6, mb: 0.5, color: line.startsWith('**Öneri') ? 'text.primary' : 'text.secondary' }}>
              {boldParts(line).map((p, j) => (p.b ? <Box key={j} component="b" sx={{ color: 'text.primary', fontWeight: 650 }}>{p.t}</Box> : <span key={j}>{p.t}</span>))}
            </Typography>
          ))}
          {s && (
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1 }}>
              {s.priority && <Chip size="small" variant="outlined" label={`Öncelik: ${PRIORITY_LABEL[s.priority]}`} />}
              {s.assignee && <Chip size="small" variant="outlined" label={`Atanan: ${s.assignee}`} />}
              {s.eta_days != null && <Chip size="small" variant="outlined" label={`Tahmini: ${s.eta_days < 1 ? `${Math.max(1, Math.round(s.eta_days * 24))} saat` : `${s.eta_days} gün`}`} />}
              {s.sla && <Chip size="small" color="warning" variant="outlined" label={`SLA ${s.sla}`} />}
            </Box>
          )}
          {!!item.agent_sources?.length && (
            <>
              <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1.5, mb: 0.5, fontWeight: 600 }}>Baktığı kaynaklar</Typography>
              <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                {item.agent_sources.map((src: AgentSource) => {
                  const Icon = SOURCE_ICON[src.type] ?? StorageOutlinedIcon
                  const click = src.type === 'db' && onOpenItem ? () => onOpenItem(src.id) : src.url ? () => window.open(src.url, '_blank', 'noopener') : undefined
                  return (
                    <Tooltip key={`${src.type}-${src.id}`} title={`${SOURCE_TYPE_LABEL[src.type]}: ${src.title}`}>
                      <Chip size="small" icon={<Icon sx={{ fontSize: '14px !important' }} />} onClick={click}
                            label={src.type === 'wiki' ? src.title : src.ref} sx={{ maxWidth: 240, height: 24, fontSize: 12 }} />
                    </Tooltip>
                  )
                })}
              </Box>
            </>
          )}
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1.25 }}>
            {item.agent_comment_by ?? 'ajan'}{item.agent_comment_at ? ` · ${new Date(item.agent_comment_at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}` : ''}
          </Typography>
        </>
      ) : (
        <Typography variant="body2" color="text.secondary">
          {backend === 'api' ? 'Henüz yorum yok. Ajan geçmiş işlere, wiki ve maillere bakıp burada değerlendirme yazar.' : 'Ajan yorumu sunucu modunda görünür.'}
        </Typography>
      )}
    </Box>
  )
}
