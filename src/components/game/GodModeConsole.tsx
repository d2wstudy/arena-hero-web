import { Bot, Check, Copy, FlaskConical, LoaderCircle, RefreshCw, ShieldCheck, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LocalGodSnapshot, LocalParticipant, LocalParticipantAdmissionReceipt } from '../../lib/types'

export function GodModeConsole({
  snapshot,
  humanFullVision,
  replaying,
  disabled,
  participants,
  onRefresh,
  onHumanFullVision,
  onAddParticipant,
}: {
  snapshot: LocalGodSnapshot | null
  humanFullVision: boolean
  replaying: boolean
  disabled: boolean
  participants: LocalParticipant[]
  onRefresh: () => Promise<unknown>
  onHumanFullVision: (enabled: boolean) => Promise<unknown>
  onAddParticipant?: (username: string, controller: 'AGENT' | 'BOT') => Promise<LocalParticipantAdmissionReceipt>
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState<'diagnostics' | 'vision' | 'participant' | null>(null)
  const [username, setUsername] = useState('')
  const [controller, setController] = useState<'AGENT' | 'BOT'>('BOT')
  const [copiedToken, setCopiedToken] = useState('')

  const refresh = async () => {
    if (busy) return
    setBusy('diagnostics')
    try {
      await onRefresh()
    } finally {
      setBusy(null)
    }
  }

  const toggleHumanVision = async () => {
    if (busy || replaying) return
    setBusy('vision')
    try {
      await onHumanFullVision(!humanFullVision)
    } finally {
      setBusy(null)
    }
  }

  const addParticipant = async () => {
    const normalized = username.trim()
    if (!onAddParticipant || busy || replaying || !/^[a-z0-9_]{3,24}$/.test(normalized)) return
    setBusy('participant')
    try {
      await onAddParticipant(normalized, controller)
      setUsername('')
    } finally {
      setBusy(null)
    }
  }

  const copyToken = async (token: string) => {
    await navigator.clipboard?.writeText(token)
    setCopiedToken(token)
  }

  const entityCount = snapshot?.state.objects.filter((item) => item.kind === 'CORE' || item.kind === 'UNIT').length ?? 0

  return <section aria-label={t('game.godConsole')}>
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="flex items-center gap-2 font-mono text-[9px] tracking-[.16em] text-amber-200"><FlaskConical size={13} />{t('game.godConsole')}</p>
        <p className="mt-1 text-[10px] leading-4 text-zinc-500">{t('game.godDiagnosticsHint')}</p>
      </div>
      <ShieldCheck size={17} className="mt-0.5 shrink-0 text-emerald-300" />
    </div>

    <button
      type="button"
      role="switch"
      aria-checked={humanFullVision}
      aria-label={t('game.humanFullVision')}
      disabled={disabled || busy !== null || replaying}
      onClick={() => void toggleHumanVision()}
      className="focus-ring mt-3 flex min-h-12 w-full items-center justify-between gap-4 rounded-gold border border-white/10 bg-black/15 px-3 text-left disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span><span className="block text-xs font-medium text-zinc-100">{t('game.humanFullVision')}</span><span className="mt-0.5 block text-[10px] text-zinc-500">{t(replaying ? 'game.humanFullVisionReplayHint' : 'game.humanFullVisionHint')}</span></span>
      <span className={`h-5 w-9 shrink-0 rounded-full p-0.5 transition ${humanFullVision ? 'bg-cyan-signal/70' : 'bg-white/10'}`}><span className={`block size-4 rounded-full bg-white transition ${humanFullVision ? 'translate-x-4' : ''}`} /></span>
    </button>

    <div className="mt-4 border-t border-white/[.07] pt-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-medium text-zinc-300"><UserPlus size={13} />{t(onAddParticipant ? 'game.addParticipant' : 'game.managePlayers')}</p>
          <p className="mt-1 text-[10px] leading-4 text-zinc-500">{t(onAddParticipant ? replaying ? 'game.addParticipantReplayHint' : 'game.addParticipantHint' : 'game.managePlayersHint')}</p>
        </div>
      </div>
      {onAddParticipant && <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_auto]">
        <input
          aria-label={t('game.participantUsername')}
          value={username}
          maxLength={24}
          disabled={disabled || busy !== null || replaying}
          onChange={(event) => setUsername(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') void addParticipant() }}
          placeholder={t('game.participantUsernamePlaceholder')}
          className="focus-ring min-h-10 rounded-gold border border-white/10 bg-black/20 px-3 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 disabled:opacity-50"
        />
        <select
          aria-label={t('game.participantController')}
          value={controller}
          disabled={disabled || busy !== null || replaying}
          onChange={(event) => setController(event.target.value as 'AGENT' | 'BOT')}
          className="focus-ring min-h-10 rounded-gold border border-white/10 bg-space-900 px-2 text-xs text-zinc-300 disabled:opacity-50"
        >
          <option value="BOT">{t('game.participantBot')}</option>
          <option value="AGENT">{t('game.participantAgent')}</option>
        </select>
        <button
          type="button"
          disabled={disabled || busy !== null || replaying || !/^[a-z0-9_]{3,24}$/.test(username.trim())}
          onClick={() => void addParticipant()}
          className="focus-ring flex min-h-10 items-center justify-center gap-1.5 rounded-gold border border-amber-300/25 bg-amber-300/10 px-3 text-xs font-semibold text-amber-100 disabled:opacity-40"
        >
          {busy === 'participant' ? <LoaderCircle size={13} className="animate-spin" /> : <UserPlus size={13} />}
          {t('game.add')}
        </button>
      </div>}

      <div className="mt-3 max-h-40 space-y-1 overflow-y-auto pr-1">
        {participants.map((participant) => <div key={participant.id} className="rounded-gold bg-white/[.025] px-2.5 py-2 text-[9px]">
          <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-1.5 truncate font-mono text-zinc-300">{participant.controller === 'BOT' ? <Bot size={11} /> : <UserPlus size={11} />}@{participant.username}</span>
            <span className="shrink-0 text-zinc-500">{t(`game.participant${participant.controller}`)} · {t(`game.participant${participant.status}`)}</span>
          </div>
          {participant.token && <div className="mt-1.5 flex items-center gap-1.5">
            <code className="min-w-0 flex-1 truncate rounded bg-black/20 px-2 py-1 text-[8px] text-cyan-signal" title={participant.token}>{participant.token}</code>
            <button type="button" aria-label={t('game.copyAgentToken')} onClick={() => void copyToken(participant.token!)} className="focus-ring grid size-7 shrink-0 place-items-center rounded-gold border border-white/10 text-zinc-400 hover:text-white">
              {copiedToken === participant.token ? <Check size={11} /> : <Copy size={11} />}
            </button>
          </div>}
        </div>)}
      </div>
    </div>

    <div className="mt-4 border-t border-white/[.07] pt-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[9px] tracking-[.14em] text-zinc-300">{t('game.godDiagnostics')}</p>
          <p className="mt-1 text-[10px] leading-4 text-zinc-500">{t('game.godDiagnosticsOnDemand')}</p>
        </div>
        <button type="button" disabled={busy !== null} onClick={() => void refresh()} className="secondary-button flex min-h-10 items-center gap-1.5 px-3 text-xs disabled:opacity-40">
          {busy === 'diagnostics' ? <LoaderCircle size={13} className="animate-spin" /> : <RefreshCw size={13} />}{t(snapshot ? 'game.refreshDiagnostics' : 'game.loadDiagnostics')}
        </button>
      </div>
      {snapshot && <>
        <p className="mt-2 font-mono text-[9px] text-zinc-500">TICK {snapshot.tick} · {snapshot.live ? t('game.live') : t('game.replayMode')}</p>
        <div className="mt-2 grid grid-cols-4 gap-2 text-center">
          <Metric value={snapshot.players.length} label={t('game.godPlayers')} />
          <Metric value={entityCount} label={t('game.godEntities')} />
          <Metric value={snapshot.tracked_chunks.length} label={t('game.godChunks')} />
          <Metric value={snapshot.plans.length} label={t('game.godPlans')} />
        </div>
        <div className="mt-3 max-h-40 space-y-1 overflow-y-auto pr-1">
          {snapshot.players.map((player) => <div key={player.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-gold bg-white/[.025] px-2.5 py-2 text-[9px]">
            <span className="truncate font-mono text-zinc-300">@{player.username}</span>
            <span className="text-zinc-500">{t('game.resources')} <strong className="font-mono text-zinc-300">{player.resources}</strong></span>
            <span className="text-zinc-500">{t('game.population')} <strong className="font-mono text-zinc-300">{player.population}</strong></span>
          </div>)}
        </div>
        <p className="mt-3 truncate font-mono text-[9px] text-zinc-600" title={snapshot.world_sha256}>SHA-256 {snapshot.world_sha256}</p>
      </>}
    </div>
  </section>
}

function Metric({ value, label }: { value: number; label: string }) {
  return <span className="rounded-gold bg-white/[.035] px-2 py-2"><strong className="block font-mono text-xs text-zinc-200">{value}</strong><span className="mt-0.5 block text-[8px] text-zinc-600">{label}</span></span>
}
