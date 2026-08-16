import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { teamTone } from '../../lib/teamColors'
import type { TeamFogDisplaySettings } from '../../lib/teamFogDisplay'
import type { PlayerState, WorldObject } from '../../lib/types'
import { Logo } from '../Logo'
import { GameStats } from './GameStats'
import { UnitArtIcon } from './UnitArtIcon'

interface Props {
  state: PlayerState
  objects: WorldObject[]
  selectedId: string | null
  onSelect: (object: WorldObject) => void
  teamFilter?: number | null
  onTeamFilterChange?: (team: number | null) => void
  teamFogDisplay?: TeamFogDisplaySettings
  onTeamFogDisplayChange?: (settings: TeamFogDisplaySettings) => void
}

export function AssetList({ state, objects, selectedId, onSelect, teamFilter, onTeamFilterChange, teamFogDisplay, onTeamFogDisplayChange }: Props) {
  const { t } = useTranslation()
  const [internalTeamFilter, setInternalTeamFilter] = useState<number | null>(null)
  const globalAssets = useMemo(
    () => objects.filter((object) => object.kind === 'CORE' || object.kind === 'UNIT'),
    [objects],
  )
  const teams = useMemo(
    () => [...new Set(globalAssets.flatMap((object) => Number.isSafeInteger(object.team) && object.team !== undefined && object.team >= 1 ? [object.team] : []))].sort((left, right) => left - right),
    [globalAssets],
  )
  const selectedTeam = teamFilter === undefined ? internalTeamFilter : teamFilter
  const effectiveTeam = selectedTeam !== null && teams.includes(selectedTeam) ? selectedTeam : null
  const listed = useMemo(
    () => state.view_mode === 'GOD'
      ? globalAssets.filter((object) => effectiveTeam === null || object.team === effectiveTeam)
      : objects.filter((object) => object.controlled),
    [effectiveTeam, globalAssets, objects, state.view_mode],
  )
  const fogControls = state.view_mode === 'GOD' && teamFogDisplay && onTeamFogDisplayChange
    ? { display: teamFogDisplay, onChange: onTeamFogDisplayChange }
    : null
  const selectTeam = (team: number | null) => {
    if (teamFilter === undefined) setInternalTeamFilter(team)
    onTeamFilterChange?.(team)
  }

  return <aside className="panel-strong hidden h-full min-h-0 flex-col border-y-0 border-l-0 lg:flex">
    <div className="border-b border-white/[.07]">
      <div className="px-5 py-4"><Logo /><GameStats state={state} className="mt-4" /></div>
      <div className="flex min-h-10 items-center justify-between gap-3 border-t border-white/[.07] px-4 py-2">
        <h2 className="flex min-w-0 items-center gap-2">
          <span className="eyebrow shrink-0">FLEET INDEX</span>
          {' '}
          <span className="truncate font-display text-xs font-medium text-zinc-400">{t(state.view_mode === 'GOD' ? 'game.globalObjects' : 'game.objects')}</span>
        </h2>
        <span className="min-w-8 rounded-gold-sm bg-white/[.04] px-2 py-1 text-center font-mono text-[9px] tabular-nums text-zinc-500">{listed.length}</span>
      </div>
      {state.view_mode === 'GOD' && teams.length > 1 && <div role="group" aria-label={t('game.teamFilter')} className="flex gap-1 overflow-x-auto border-t border-white/[.07] px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button type="button" aria-pressed={effectiveTeam === null} onClick={() => selectTeam(null)} className={`focus-ring h-7 shrink-0 rounded-full border px-2.5 text-[9px] ${effectiveTeam === null ? 'border-cyan-signal/35 bg-cyan-signal/10 text-blue-soft' : 'border-white/10 bg-black/10 text-zinc-500 hover:text-zinc-200'}`}>{t('game.allTeams')}</button>
        {teams.map((team) => {
          const tone = teamTone(team)
          const active = effectiveTeam === team
          return <button key={team} type="button" aria-pressed={active} aria-label={t('game.teamName', { team })} onClick={() => selectTeam(team)} style={tone ? { borderColor: tone.color, color: tone.labelColor } : undefined} className={`focus-ring flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2 text-[9px] ${active ? 'bg-white/[.09]' : 'bg-black/10 opacity-45 hover:opacity-100'}`}>
            <span aria-hidden="true" style={tone ? { backgroundColor: tone.color } : undefined} className="size-1.5 shrink-0 rounded-full" />
            <span>{t('game.teamShortName', { team })}</span>
          </button>
        })}
      </div>}
      {fogControls && <div className="grid gap-1 border-t border-white/[.07] px-3 py-2">
        <FogLayerControl label={t('game.liveVision')} opacityLabel={t('game.liveVisionOpacity')} enabled={fogControls.display.visibilityEnabled} opacity={fogControls.display.visibilityOpacity} tone="cyan" onEnabledChange={(visibilityEnabled) => fogControls.onChange({ ...fogControls.display, visibilityEnabled })} onOpacityChange={(visibilityOpacity) => fogControls.onChange({ ...fogControls.display, visibilityOpacity })} />
        <FogLayerControl label={t('game.explorationBoundary')} opacityLabel={t('game.explorationBoundaryOpacity')} enabled={fogControls.display.explorationEnabled} opacity={fogControls.display.explorationOpacity} tone="violet" onEnabledChange={(explorationEnabled) => fogControls.onChange({ ...fogControls.display, explorationEnabled })} onOpacityChange={(explorationOpacity) => fogControls.onChange({ ...fogControls.display, explorationOpacity })} />
      </div>}
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto p-2">
      {listed.map((object) => {
        const artType = object.kind === 'CORE' ? 'CORE' : object.unit_type ?? 'WORKER'
        const name = object.kind === 'CORE' ? t('game.units.CORE') : t(`game.units.${object.unit_type}`)
        const tone = state.view_mode === 'GOD' ? teamTone(object.team) : null
        return <button key={object.id} onClick={() => onSelect(object)} style={{ contentVisibility: 'auto', containIntrinsicSize: '44px' }} className={`focus-ring mb-0.5 flex min-h-11 w-full items-center gap-2 rounded-gold px-2.5 text-left transition-colors ${selectedId === object.id ? 'bg-indigo-deep/55 text-blue-soft' : 'text-zinc-400 hover:bg-white/[.04] hover:text-zinc-100'}`}>
          <span style={tone ? { borderColor: tone.color } : undefined} className="grid size-7 shrink-0 place-items-center rounded-gold-sm border border-violet-cosmic/15 bg-indigo-deep/45"><span style={tone ? { filter: tone.filter } : undefined} className="grid size-5 place-items-center"><UnitArtIcon type={artType} className="size-5" /></span></span>
          <span className="min-w-0 flex-1"><span className="flex items-baseline gap-1.5"><span className="truncate text-xs font-medium">{name}</span><span className="shrink-0 font-mono text-[9px] text-zinc-600">[{object.position?.join(', ') ?? '—'}]</span></span>{state.view_mode === 'GOD' && object.owner_username && <span style={tone ? { color: tone.labelColor } : undefined} className="block truncate font-mono text-[8px] text-violet-300/70">@{object.owner_username}</span>}</span>
          <span style={tone ? { color: tone.labelColor } : undefined} className="shrink-0 font-mono text-[9px]">{object.hp} HP</span>
        </button>
      })}
    </div>
  </aside>
}

function FogLayerControl({ label, opacityLabel, enabled, opacity, tone, onEnabledChange, onOpacityChange }: { label: string; opacityLabel: string; enabled: boolean; opacity: number; tone: 'cyan' | 'violet'; onEnabledChange: (enabled: boolean) => void; onOpacityChange: (opacity: number) => void }) {
  const percentage = Math.round(Math.min(1, Math.max(0, opacity)) * 100)
  const activeClass = tone === 'cyan' ? 'border-cyan-signal/45 bg-cyan-signal/25' : 'border-violet-cosmic/55 bg-violet-cosmic/30'
  return <div className="grid min-h-7 grid-cols-[1.75rem_4.75rem_minmax(3rem,1fr)_2.25rem] items-center gap-1.5">
    <button type="button" role="switch" aria-checked={enabled} aria-label={label} onClick={() => onEnabledChange(!enabled)} className={`focus-ring relative h-4 w-7 rounded-full border transition-colors ${enabled ? activeClass : 'border-white/15 bg-black/25'}`}>
      <span aria-hidden="true" className={`absolute left-0.5 top-0.5 size-2.5 rounded-full transition-transform ${enabled ? 'translate-x-3 bg-white' : 'bg-zinc-600'}`} />
    </button>
    <span title={label} className={`truncate text-[9px] ${enabled ? 'text-zinc-300' : 'text-zinc-600'}`}>{label}</span>
    <input type="range" aria-label={opacityLabel} min={0} max={100} step={1} value={percentage} disabled={!enabled} onChange={(event) => onOpacityChange(Number(event.target.value) / 100)} className={`min-w-0 accent-current disabled:opacity-25 ${tone === 'cyan' ? 'text-cyan-signal' : 'text-violet-cosmic'}`} />
    <span className={`w-9 text-right font-mono text-[8px] tabular-nums ${enabled ? 'text-zinc-500' : 'text-zinc-700'}`}>{percentage}%</span>
  </div>
}
