import { ChevronLeft, ChevronRight, CircleAlert, Pause, Play, Radio, RotateCcw, SkipForward } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CaptureReplayFrame, CaptureReplayManifest } from '../../lib/types'

export interface ReplayJump {
  label: string
  index: number
}

interface Props {
  manifest: CaptureReplayManifest
  frame: CaptureReplayFrame
  index: number
  frameCount: number
  playing: boolean
  intervalMs: number
  jumps: ReplayJump[]
  previousTick: number | null
  onTogglePlay: () => void
  onIndexChange: (index: number) => void
  onIntervalChange: (intervalMs: number) => void
  onJump: (index: number) => void
}

const speedOptions = [
  { value: 4000, labelKey: 'game.replaySpeedSlow' },
  { value: 1000, labelKey: 'game.replaySpeedStandard' },
  { value: 250, labelKey: 'game.replaySpeedFast' },
  { value: 80, labelKey: 'game.replaySpeedFastest' },
] as const

export function OfficialReplayControl({ manifest, frame, index, frameCount, playing, intervalMs, jumps, previousTick, onTogglePlay, onIndexChange, onIntervalChange, onJump }: Props) {
  const { t, i18n } = useTranslation()
  const firstTick = manifest.first_tick ?? frame.tick
  const latestTick = manifest.latest_tick ?? frame.tick
  const skipped = previousTick !== null && frame.tick > previousTick + 1 ? frame.tick - previousTick - 1 : 0
  const eventCount = frame.state.events.length
  const observedAt = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(frame.observed_at))

  return <div className="pointer-events-none absolute left-3 right-3 top-3 z-30 flex justify-center">
    <section className="panel pointer-events-auto w-full max-w-4xl rounded-gold px-4 py-3" aria-label={t('game.officialReplay')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-mono text-[9px] tracking-[.14em] text-cyan-signal">
            {manifest.open_session ? <Radio size={12} className={manifest.live ? 'text-emerald-300' : 'text-amber-200'} /> : <RotateCcw size={12} />}
            {t('game.officialReplay')} · {manifest.capture} · TICK {frame.tick}
            {manifest.open_session && <span className={`rounded-full px-2 py-0.5 tracking-normal ${manifest.live ? 'bg-emerald-400/10 text-emerald-300' : 'bg-amber-300/10 text-amber-200'}`}>{t(manifest.live ? 'game.replayRecording' : 'game.replayWaiting')}</span>}
          </p>
          <p className="mt-1 truncate text-xs text-zinc-400">
            {t('game.replayReadOnly')} · {observedAt}
            {skipped > 0 && <span className="ml-2 text-amber-200">· {t('game.replaySkippedTicks', { count: skipped })}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" aria-label={playing ? t('game.pauseReplay') : t('game.playReplay')} onClick={onTogglePlay} className="focus-ring flex min-h-11 items-center gap-2 rounded-gold border border-cyan-signal/35 bg-cyan-signal/10 px-3 text-xs font-semibold text-blue-soft hover:bg-cyan-signal/20">
            {playing ? <Pause size={15} /> : <Play size={15} />}{playing ? t('game.pauseReplay') : t('game.playReplay')}
          </button>
          <select aria-label={t('game.replaySpeed')} value={intervalMs} onChange={(event) => onIntervalChange(Number(event.target.value))} className="focus-ring min-h-11 rounded-gold border border-white/10 bg-space-900 px-2 text-[10px] text-zinc-300">
            {speedOptions.map((option) => <option key={option.value} value={option.value}>{t(option.labelKey)}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-3 grid gap-2 border-t border-white/[.07] pt-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
        <button type="button" aria-label={t('game.previousTick')} disabled={index <= 0} onClick={() => onIndexChange(index - 1)} className="focus-ring grid size-10 place-items-center rounded-gold border border-white/10 text-zinc-400 disabled:opacity-30"><ChevronLeft size={15} /></button>
        <input aria-label={t('game.replayTimeline')} type="range" min={0} max={Math.max(0, frameCount - 1)} value={index} disabled={frameCount < 2} onChange={(event) => onIndexChange(Number(event.target.value))} className="min-w-24 w-full accent-cyan-signal" />
        <div className="flex items-center justify-end gap-2">
          <button type="button" aria-label={t('game.nextTick')} disabled={index >= frameCount - 1} onClick={() => onIndexChange(index + 1)} className="focus-ring grid size-10 place-items-center rounded-gold border border-white/10 text-zinc-400 disabled:opacity-30"><ChevronRight size={15} /></button>
          <span className="min-w-28 text-right font-mono text-[9px] text-zinc-500">
            <span className="block">{index + 1} / {frameCount}</span>
            <span className="block">TICK {firstTick} — {latestTick}</span>
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/[.07] pt-3">
        <span className="flex items-center gap-1.5 font-mono text-[9px] tracking-[.12em] text-zinc-500"><SkipForward size={12} />{t('game.replayHighlights')}</span>
        {jumps.length ? jumps.map((jump) => <button key={`${jump.label}-${jump.index}`} type="button" onClick={() => onJump(jump.index)} className="focus-ring rounded-full border border-white/10 bg-white/[.025] px-2.5 py-1.5 text-[10px] text-zinc-400 hover:border-amber-300/30 hover:bg-amber-300/10 hover:text-amber-100">{jump.label}</button>) : <span className="text-[10px] text-zinc-600">{t('game.replayNoHighlights')}</span>}
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[9px] text-zinc-500"><CircleAlert size={12} className={eventCount ? 'text-amber-200' : 'text-zinc-600'} />{t('game.replayEventCount', { count: eventCount })}</span>
      </div>
    </section>
  </div>
}
