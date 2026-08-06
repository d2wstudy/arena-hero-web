import { Bot, ChevronLeft, ChevronRight, CircleCheck, CircleX, GitBranch, History, LoaderCircle, Play, Radio, RotateCcw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LocalHistory, LocalMatchStatus, LocalReplay, StreamPhase } from '../../lib/types'

export function LocalStepControl({
  tick,
  liveTick,
  phase,
  status,
  history,
  replay,
  onAdvance,
  onReplay,
  onReturnLive,
  onBranch,
}: {
  tick: number
  liveTick: number
  phase: StreamPhase
  status: LocalMatchStatus | null
  history: LocalHistory | null
  replay: LocalReplay | null
  onAdvance: () => Promise<unknown>
  onReplay: (matchId: string, tick: number) => Promise<unknown>
  onReturnLive: () => void
  onBranch: () => Promise<unknown>
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState<'advance' | 'replay' | 'branch' | null>(null)
  const currentStatus = status?.tick === liveTick ? status : null
  const botsReady = Boolean(currentStatus && currentStatus.bots.every((bot) => bot.ready && !bot.error))
  const resolvingDisabled = phase !== 'open' || !botsReady || busy !== null || Boolean(replay)
  const selectedMatchId = replay?.match_id ?? history?.active_match_id ?? status?.match_id ?? null
  const selectedMatch = useMemo(
    () => history?.matches.find((match) => match.id === selectedMatchId) ?? null,
    [history, selectedMatchId],
  )
  const firstTick = selectedMatch?.first_tick ?? tick
  const latestTick = selectedMatch?.latest_tick ?? liveTick
  const canStepBack = tick > firstTick
  const canStepForward = tick < latestTick

  const advance = async () => {
    if (resolvingDisabled) return
    setBusy('advance')
    try {
      await onAdvance()
    } finally {
      setBusy(null)
    }
  }

  const showTick = async (nextTick: number, matchId = selectedMatchId) => {
    if (!matchId || busy) return
    if (matchId === history?.active_match_id && nextTick === liveTick) {
      onReturnLive()
      return
    }
    setBusy('replay')
    try {
      await onReplay(matchId, nextTick)
    } finally {
      setBusy(null)
    }
  }

  const selectMatch = async (matchId: string) => {
    const match = history?.matches.find((candidate) => candidate.id === matchId)
    if (!match) return
    await showTick(match.id === history?.active_match_id ? liveTick : match.latest_tick, match.id)
  }

  const branch = async () => {
    if (!replay || busy) return
    setBusy('branch')
    try {
      await onBranch()
    } finally {
      setBusy(null)
    }
  }

  return <div className="pointer-events-none absolute left-3 right-3 top-3 z-30 flex justify-center">
    <section className="panel pointer-events-auto w-full max-w-3xl rounded-gold px-4 py-3" aria-label={t('game.localStep')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-mono text-[9px] tracking-[.16em] text-cyan-signal">
            {replay ? <History size={12} /> : <Radio size={12} />}
            {replay ? t('game.replayMode') : t('game.localStep')} · TICK {tick}
          </p>
          <p className="mt-1 text-xs text-zinc-400">{replay ? t('game.replayHint') : t('game.localStepHint')}</p>
        </div>
        {replay ? <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onReturnLive} disabled={busy !== null} className="secondary-button flex min-h-11 items-center gap-2 px-3 text-xs">
            <RotateCcw size={14} />{t('game.returnLive', { tick: liveTick })}
          </button>
          <button type="button" onClick={() => void branch()} disabled={busy !== null} className="focus-ring flex min-h-11 items-center gap-2 rounded-gold border border-violet-cosmic/35 bg-violet-cosmic/10 px-3 text-xs font-semibold text-blue-soft hover:bg-violet-cosmic/20 disabled:opacity-50">
            {busy === 'branch' ? <LoaderCircle size={14} className="animate-spin" /> : <GitBranch size={14} />}
            {t('game.branchFromTick', { tick })}
          </button>
        </div> : <button
          type="button"
          disabled={resolvingDisabled}
          onClick={() => void advance()}
          className="focus-ring flex min-h-11 items-center gap-2 rounded-gold border border-cyan-signal/35 bg-cyan-signal/10 px-4 text-xs font-semibold text-blue-soft transition hover:bg-cyan-signal/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[.03] disabled:text-zinc-600"
        >
          {busy === 'advance' || phase === 'settling' ? <LoaderCircle size={15} className="animate-spin" /> : <Play size={15} />}
          {phase === 'settling' ? t('game.settling') : t('game.resolveTick', { tick: liveTick })}
        </button>}
      </div>

      {history && selectedMatch && <div className="mt-3 grid gap-2 border-t border-white/[.07] pt-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-0 items-center gap-2">
          <select
            aria-label={t('game.replayBranch')}
            value={selectedMatch.id}
            disabled={busy !== null}
            onChange={(event) => void selectMatch(event.target.value)}
            className="focus-ring min-h-10 max-w-48 rounded-gold border border-white/10 bg-space-900 px-2 text-[10px] text-zinc-300"
          >
            {history.matches.map((match) => <option key={match.id} value={match.id}>{match.active ? '● ' : ''}{match.label} · {match.id.slice(0, 8)}</option>)}
          </select>
          <button type="button" aria-label={t('game.previousTick')} disabled={!canStepBack || busy !== null} onClick={() => void showTick(tick - 1)} className="focus-ring grid size-10 shrink-0 place-items-center rounded-gold border border-white/10 text-zinc-400 disabled:opacity-30"><ChevronLeft size={15} /></button>
          <input
            type="range"
            aria-label={t('game.replayTimeline')}
            min={firstTick}
            max={latestTick}
            value={tick}
            disabled={busy !== null || firstTick === latestTick}
            onChange={(event) => void showTick(Number(event.target.value))}
            className="min-w-24 flex-1 accent-cyan-signal"
          />
          <button type="button" aria-label={t('game.nextTick')} disabled={!canStepForward || busy !== null} onClick={() => void showTick(tick + 1)} className="focus-ring grid size-10 shrink-0 place-items-center rounded-gold border border-white/10 text-zinc-400 disabled:opacity-30"><ChevronRight size={15} /></button>
        </div>
        <span className="self-center text-right font-mono text-[9px] text-zinc-500">{firstTick} — {latestTick}</span>
      </div>}

      {!replay && <div className="mt-3 flex flex-wrap gap-2" aria-live="polite">
        {!currentStatus && <span className="flex items-center gap-1.5 rounded-full bg-white/[.04] px-3 py-1.5 text-[10px] text-zinc-500"><LoaderCircle size={12} className="animate-spin" />{t('game.checkingBots')}</span>}
        {currentStatus?.bots.map((bot) => <span
          key={bot.username}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] ${bot.error ? 'bg-coral-hostile/10 text-coral-hostile' : bot.ready ? 'bg-emerald-400/10 text-emerald-300' : 'bg-white/[.04] text-zinc-500'}`}
          title={bot.error}
        >
          <Bot size={12} />
          {bot.username}
          {bot.error ? <CircleX size={12} /> : bot.ready ? <CircleCheck size={12} /> : <LoaderCircle size={12} className="animate-spin" />}
          <span>{bot.error ? t('game.botFailed') : bot.ready ? t('game.botReady') : t('game.botThinking')}</span>
        </span>)}
      </div>}
    </section>
  </div>
}
