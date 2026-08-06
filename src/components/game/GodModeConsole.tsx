import { Crown, Eye, EyeOff, FlaskConical, LoaderCircle, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LocalGodSnapshot } from '../../lib/types'

export function GodModeConsole({
  godView,
  snapshot,
  humanFullVision,
  replaying,
  disabled,
  onGodView,
  onHumanFullVision,
}: {
  godView: boolean
  snapshot: LocalGodSnapshot | null
  humanFullVision: boolean
  replaying: boolean
  disabled: boolean
  onGodView: (enabled: boolean) => Promise<unknown>
  onHumanFullVision: (enabled: boolean) => Promise<unknown>
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<'view' | 'vision' | null>(null)

  const toggleGodView = async () => {
    if (busy) return
    setBusy('view')
    try {
      await onGodView(!godView)
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

  const entityCount = snapshot?.state.objects.filter((item) => item.kind === 'CORE' || item.kind === 'UNIT').length ?? 0

  return <div className="relative">
    <button
      type="button"
      aria-expanded={open}
      disabled={disabled}
      onClick={() => setOpen((value) => !value)}
      className={`focus-ring flex min-h-11 items-center gap-2 rounded-gold border px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${open || godView ? 'border-amber-300/35 bg-amber-300/10 text-amber-100' : 'border-white/10 bg-white/[.03] text-zinc-400 hover:bg-white/[.06] hover:text-zinc-100'}`}
    >
      <Crown size={14} />{t('game.godMode')}
    </button>
    {open && <section className="panel absolute right-0 top-[calc(100%+.5rem)] z-40 w-[min(30rem,calc(100vw-2rem))] rounded-gold border-amber-300/20 p-4 shadow-2xl" aria-label={t('game.godConsole')}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 font-mono text-[9px] tracking-[.16em] text-amber-200"><FlaskConical size={13} />{t('game.godConsole')}</p>
          <p className="mt-1 text-xs leading-5 text-zinc-400">{t('game.godConsoleHint')}</p>
        </div>
        <ShieldCheck size={17} className="mt-0.5 shrink-0 text-emerald-300" />
      </div>

      <div className="mt-4 grid gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={godView}
          aria-label={t('game.godObserve')}
          disabled={disabled || busy !== null}
          onClick={() => void toggleGodView()}
          className="focus-ring flex min-h-12 items-center justify-between gap-4 rounded-gold border border-white/10 bg-black/15 px-3 text-left disabled:opacity-50"
        >
          <span><span className="block text-xs font-medium text-zinc-100">{t('game.godObserve')}</span><span className="mt-0.5 block text-[10px] text-zinc-500">{t('game.godObserveHint')}</span></span>
          <span className={`grid size-8 shrink-0 place-items-center rounded-full ${godView ? 'bg-amber-300/15 text-amber-200' : 'bg-white/[.04] text-zinc-500'}`}>{busy === 'view' ? <LoaderCircle size={14} className="animate-spin" /> : godView ? <Eye size={15} /> : <EyeOff size={15} />}</span>
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={humanFullVision}
          aria-label={t('game.humanFullVision')}
          disabled={disabled || busy !== null || replaying}
          onClick={() => void toggleHumanVision()}
          className="focus-ring flex min-h-12 items-center justify-between gap-4 rounded-gold border border-white/10 bg-black/15 px-3 text-left disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span><span className="block text-xs font-medium text-zinc-100">{t('game.humanFullVision')}</span><span className="mt-0.5 block text-[10px] text-zinc-500">{t(replaying ? 'game.humanFullVisionReplayHint' : 'game.humanFullVisionHint')}</span></span>
          <span className={`h-5 w-9 shrink-0 rounded-full p-0.5 transition ${humanFullVision ? 'bg-cyan-signal/70' : 'bg-white/10'}`}><span className={`block size-4 rounded-full bg-white transition ${humanFullVision ? 'translate-x-4' : ''}`} /></span>
        </button>
      </div>

      {godView && <div className="mt-4 border-t border-white/[.07] pt-3">
        {!snapshot ? <p className="flex items-center gap-2 text-[10px] text-zinc-500"><LoaderCircle size={12} className="animate-spin" />{t('game.loadingGodSnapshot')}</p> : <>
          <div className="grid grid-cols-4 gap-2 text-center">
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
      </div>}
    </section>}
  </div>
}

function Metric({ value, label }: { value: number; label: string }) {
  return <span className="rounded-gold bg-white/[.035] px-2 py-2"><strong className="block font-mono text-xs text-zinc-200">{value}</strong><span className="mt-0.5 block text-[8px] text-zinc-600">{label}</span></span>
}
