import { Bot, CircleCheck, CircleX, LoaderCircle, Play } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LocalMatchStatus, StreamPhase } from '../../lib/types'

export function LocalStepControl({
  tick,
  phase,
  status,
  onAdvance,
}: {
  tick: number
  phase: StreamPhase
  status: LocalMatchStatus | null
  onAdvance: () => Promise<unknown>
}) {
  const { t } = useTranslation()
  const [advancing, setAdvancing] = useState(false)
  const currentStatus = status?.tick === tick ? status : null
  const botsReady = Boolean(currentStatus && currentStatus.bots.every((bot) => bot.ready && !bot.error))
  const disabled = phase !== 'open' || !botsReady || advancing

  const advance = async () => {
    if (disabled) return
    setAdvancing(true)
    try {
      await onAdvance()
    } finally {
      setAdvancing(false)
    }
  }

  return <div className="pointer-events-none absolute left-3 right-3 top-3 z-30 flex justify-center">
    <section className="panel pointer-events-auto w-full max-w-xl rounded-gold px-4 py-3" aria-label={t('game.localStep')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[9px] tracking-[.16em] text-cyan-signal">{t('game.localStep')} · TICK {tick}</p>
          <p className="mt-1 text-xs text-zinc-400">{t('game.localStepHint')}</p>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => void advance()}
          className="focus-ring flex min-h-11 items-center gap-2 rounded-gold border border-cyan-signal/35 bg-cyan-signal/10 px-4 text-xs font-semibold text-blue-soft transition hover:bg-cyan-signal/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[.03] disabled:text-zinc-600"
        >
          {advancing || phase === 'settling' ? <LoaderCircle size={15} className="animate-spin" /> : <Play size={15} />}
          {phase === 'settling' ? t('game.settling') : t('game.resolveTick', { tick })}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2" aria-live="polite">
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
      </div>
    </section>
  </div>
}
