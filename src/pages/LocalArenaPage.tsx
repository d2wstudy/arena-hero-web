import { Bot, ChevronLeft, CircleAlert, Database, Dices, FolderOpen, GitBranch, LoaderCircle, Plus, RefreshCw, Save, Trash2, User } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { APIError, api } from '../lib/api'
import { getErrorMessage } from '../lib/errorMessage'
import { localWorkspaceStorageKey, readLocalWorkspaceState, workspaceAfterWorldEdit } from '../lib/localWorkspace'
import type { LocalCreateSaveInput, LocalEditSaveInput, LocalSaveCatalog, LocalSavePlayerConfig, LocalSaveSeedMode, LocalSaveSpawnMode, LocalSaveSummary } from '../lib/types'
import { ArenaPage } from './ArenaPage'

type Screen = 'LOBBY' | 'EDITOR' | 'GAME'
type EditorMode = 'CREATE' | 'EDIT'

interface EditorContext {
  mode: EditorMode
  save: LocalSaveSummary
  tick?: number
  matchId?: string
}

interface EditorPlayer extends LocalSavePlayerConfig {
  clientKey: string
  targetKey: string
}

const usernamePattern = /^[a-z0-9_]{3,24}$/

function errorText(cause: unknown) {
  if (cause instanceof APIError && cause.message && cause.message !== cause.code) return cause.message
  return getErrorMessage(cause)
}

function playerConfigPayload(player: EditorPlayer, players: EditorPlayer[]): LocalSavePlayerConfig {
  const target = players.find((candidate) => candidate.clientKey === player.targetKey)
  return {
    id: player.id,
    username: player.username,
    controller: player.controller,
    bot_version: player.controller === 'BOT' ? '0.0' : null,
    team: player.team,
    activation_tick: player.activation_tick,
    join_offset: player.join_offset,
    spawn_mode: player.spawn_mode,
    target_player_id: target?.id ?? null,
    target_username: target && !target.id ? target.username : null,
    distance_n: player.distance_n,
    distance_tolerance: player.distance_tolerance,
    planned_position: player.planned_position,
  }
}

function normalizePlayerTeams(players: EditorPlayer[]) {
  const normalized = new Map<number, number>()
  return players.map((player) => {
    let team = normalized.get(player.team)
    if (team === undefined) {
      team = normalized.size + 1
      normalized.set(player.team, team)
    }
    return team === player.team ? player : { ...player, team }
  })
}

export function LocalArenaPage() {
  const { t } = useTranslation()
  const [screen, setScreen] = useState<Screen>('LOBBY')
  const [catalog, setCatalog] = useState<LocalSaveCatalog | null>(null)
  const [activeSave, setActiveSave] = useState<LocalSaveSummary | null>(null)
  const [editor, setEditor] = useState<EditorContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [busySaveId, setBusySaveId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const refreshCatalog = async () => {
    const next = await api.localSaveCatalog()
    setCatalog(next)
    return next
  }

  useEffect(() => {
    let cancelled = false
    void api.startLocalSession().then(() => api.localSaveCatalog()).then((next) => {
      if (cancelled) return
      setCatalog(next)
      setError('')
    }).catch((cause) => {
      if (!cancelled) setError(errorText(cause))
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const enterSave = async (save: LocalSaveSummary) => {
    if (save.empty || busySaveId) return
    setBusySaveId(save.save_id)
    setError('')
    try {
      const receipt = await api.activateLocalSave(save.save_id)
      setActiveSave(receipt.save)
      setScreen('GAME')
      await refreshCatalog()
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusySaveId(null)
    }
  }

  const openCreate = (save: LocalSaveSummary) => {
    setEditor({ mode: 'CREATE', save })
    setError('')
    setScreen('EDITOR')
  }

  const openEdit = (tick: number, matchId?: string) => {
    if (!activeSave) return
    setEditor({ mode: 'EDIT', save: activeSave, tick, matchId })
    setError('')
    setScreen('EDITOR')
  }

  const returnLobby = async () => {
    setScreen('LOBBY')
    setActiveSave(null)
    setEditor(null)
    setError('')
    try {
      await refreshCatalog()
    } catch (cause) {
      setError(errorText(cause))
    }
  }

  if (screen === 'GAME' && activeSave) {
    return <ArenaPage key={activeSave.save_id} local localSaveId={activeSave.save_id} onLocalExit={() => { void returnLobby() }} onLocalEdit={openEdit} />
  }

  if (screen === 'EDITOR' && editor) {
    return <LocalWorldEditor context={editor} onCancel={() => { setEditor(null); setScreen(editor.mode === 'EDIT' && activeSave ? 'GAME' : 'LOBBY') }} onCompleted={async (save) => {
      if (editor.mode === 'EDIT') {
        const sourceKey = localWorkspaceStorageKey(editor.save.save_id)
        const targetKey = localWorkspaceStorageKey(save.save_id)
        const inherited = workspaceAfterWorldEdit(readLocalWorkspaceState(localStorage.getItem(sourceKey)))
        localStorage.setItem(targetKey, JSON.stringify(inherited))
      }
      setActiveSave(save)
      setEditor(null)
      setScreen('GAME')
      await refreshCatalog()
    }} />
  }

  return <main className="relative min-h-dvh overflow-x-hidden px-3 py-4 sm:px-6 sm:py-6">
    <div className="relative z-10 mx-auto w-full max-w-5xl">
      <header className="flex h-12 items-center justify-between gap-3 border-b border-white/10">
        <h1 className="min-w-0 truncate font-display text-xl font-semibold tracking-[-.025em] text-zinc-100">{t('localSaves.title')}</h1>
        <button type="button" disabled={loading} onClick={() => { setLoading(true); void refreshCatalog().catch((cause) => setError(errorText(cause))).finally(() => setLoading(false)) }} className="secondary-button flex h-9 shrink-0 items-center justify-center gap-2 px-3"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /><span className="max-sm:sr-only">{t('localSaves.refresh')}</span></button>
      </header>

      {error && <div role="alert" className="mt-3 flex min-h-10 items-center gap-2 rounded-gold border border-coral-hostile/25 bg-coral-hostile/[.07] px-3 text-xs text-coral-hostile"><CircleAlert size={15} className="shrink-0" /><span className="min-w-0 truncate" title={error}>{error}</span></div>}

      {loading && !catalog ? <div className="grid min-h-[50dvh] place-items-center"><LoaderCircle className="animate-spin text-cyan-signal" aria-label={t('common.loading')} /></div> : <section className="mt-3 grid gap-2" aria-label={t('localSaves.list')}>
        {catalog?.saves.map((save) => save.empty
          ? <button key={save.save_id} type="button" onClick={() => openCreate(save)} className="focus-ring group grid h-20 w-full grid-cols-[2.25rem_minmax(0,1fr)_4.5rem_2.25rem] items-center gap-2 rounded-gold border border-dashed border-white/12 bg-white/[.018] px-3 text-left transition hover:border-cyan-signal/35 hover:bg-cyan-signal/[.035] sm:grid-cols-[2.75rem_minmax(0,1fr)_10rem_2.25rem] sm:gap-3">
              <span className="grid size-9 place-items-center rounded-full border border-white/10 bg-white/[.035] text-zinc-500 transition group-hover:border-cyan-signal/30 group-hover:text-cyan-signal"><Plus size={16} /></span>
              <span className="min-w-0"><span className="block truncate text-sm font-semibold text-zinc-300">{t('localSaves.emptySlot', { slot: save.slot })}</span><span className="mt-1 block font-mono text-[9px] tracking-[.12em] text-zinc-600">SLOT {String(save.slot).padStart(2, '0')}</span></span>
              <span className="grid w-full grid-cols-1 text-right sm:grid-cols-2 sm:gap-3"><span><span className="block text-[9px] text-zinc-600">Tick</span><span className="mt-0.5 block font-mono text-xs tabular-nums text-zinc-500">—</span></span><span className="max-sm:hidden"><span className="block text-[9px] text-zinc-600">{t('localSaves.players')}</span><span className="mt-0.5 block font-mono text-xs tabular-nums text-zinc-500">—</span></span></span>
              <span className="grid size-9 place-items-center rounded-gold text-zinc-600 transition group-hover:bg-cyan-signal/10 group-hover:text-cyan-signal"><Plus size={15} /></span>
            </button>
          : <button key={save.save_id} type="button" disabled={busySaveId !== null} onClick={() => { void enterSave(save) }} className="focus-ring group grid h-20 w-full grid-cols-[2.25rem_minmax(0,1fr)_4.5rem_2.25rem] items-center gap-2 rounded-gold border border-white/10 bg-space-900/85 px-3 text-left transition hover:border-cyan-signal/30 hover:bg-space-850 disabled:opacity-55 sm:grid-cols-[2.75rem_minmax(0,1fr)_10rem_2.25rem] sm:gap-3">
              <span className={`grid size-9 place-items-center rounded-full border ${save.active ? 'border-cyan-signal/25 bg-cyan-signal/10 text-cyan-signal' : 'border-white/10 bg-white/[.035] text-zinc-500'}`}><Database size={15} /></span>
              <span className="min-w-0"><span className="block truncate text-sm font-semibold text-zinc-100">{save.name}</span><span className="mt-1 flex min-w-0 items-center gap-2 text-[9px]"><span className={`shrink-0 font-mono tracking-[.1em] ${save.active ? 'text-cyan-signal' : 'text-zinc-600'}`}>{save.active ? t('localSaves.active') : `SLOT ${String(save.slot).padStart(2, '0')}`}</span><span className="min-w-0 truncate font-mono text-zinc-600" title={save.seed ?? ''}>Seed {save.seed ?? '—'}</span></span></span>
              <span className="grid w-full grid-cols-1 text-right sm:grid-cols-2 sm:gap-3"><span><span className="block text-[9px] text-zinc-600">Tick</span><span className="mt-0.5 block font-mono text-xs tabular-nums text-zinc-300">{save.latest_tick ?? '—'}</span></span><span className="max-sm:hidden"><span className="block text-[9px] text-zinc-600">{t('localSaves.players')}</span><span className="mt-0.5 block font-mono text-xs tabular-nums text-zinc-300">{save.player_count}</span></span></span>
              <span className="grid size-9 place-items-center rounded-gold text-blue-soft transition group-hover:bg-cyan-signal/10">{busySaveId === save.save_id ? <LoaderCircle size={14} className="animate-spin" /> : <FolderOpen size={14} />}</span>
            </button>)}
      </section>}
    </div>
  </main>
}

function LocalWorldEditor({ context, onCancel, onCompleted }: { context: EditorContext; onCancel: () => void; onCompleted: (save: LocalSaveSummary) => Promise<void> }) {
  const { t } = useTranslation()
  const [name, setName] = useState(context.mode === 'CREATE' ? t('localSaves.defaultName', { slot: context.save.slot }) : context.save.name)
  const [seedMode, setSeedMode] = useState<LocalSaveSeedMode>('RANDOM')
  const [seed, setSeed] = useState('')
  const [baseTick, setBaseTick] = useState(context.tick ?? 0)
  const [players, setPlayers] = useState<EditorPlayer[]>([])
  const [loading, setLoading] = useState(context.mode === 'EDIT')
  const [busy, setBusy] = useState<'CREATE' | 'OVERWRITE' | 'SAVE_AS' | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (context.mode !== 'EDIT') return
    const controller = new AbortController()
    void api.localSaveConfig(context.save.save_id, context.tick, context.matchId, controller.signal).then((response) => {
      if (!response.config) throw new APIError('SAVE_EMPTY', 409)
      const keyed = response.config.players.map((player) => ({ ...player, clientKey: player.id ?? crypto.randomUUID(), targetKey: '' }))
      const keyById = new Map(keyed.flatMap((player) => player.id ? [[player.id, player.clientKey] as const] : []))
      setName(response.save.name)
      setSeed(response.config.seed)
      setBaseTick(response.config.base_tick)
      setPlayers(normalizePlayerTeams(keyed.map((player) => ({ ...player, targetKey: player.target_player_id ? keyById.get(player.target_player_id) ?? '' : '' }))))
      setError('')
    }).catch((cause) => {
      if (!(cause instanceof Error && cause.name === 'AbortError')) setError(errorText(cause))
    }).finally(() => setLoading(false))
    return () => controller.abort()
  }, [context])

  const teamOptions = Array.from({ length: players.length }, (_, index) => index + 1)
  const addPlayer = () => {
    setPlayers((current) => {
      const existingNames = new Set(current.map((player) => player.username))
      let number = current.length + 1
      while (existingNames.has(`player_${number}`)) number += 1
      return [...current, {
        clientKey: crypto.randomUUID(),
        targetKey: '',
        username: `player_${number}`,
        controller: 'BOT',
        bot_version: '0.0',
        team: current.length + 1,
        join_offset: context.mode === 'CREATE' ? 0 : 1,
        spawn_mode: current.length ? 'RANDOM_ADJACENT' : 'RANDOM',
        distance_n: 1,
        distance_tolerance: 5,
      }]
    })
  }

  const updatePlayer = (key: string, patch: Partial<EditorPlayer>) => setPlayers((current) => current.map((player) => player.clientKey === key ? { ...player, ...patch } : player))
  const removePlayer = (key: string) => setPlayers((current) => normalizePlayerTeams(current.filter((player) => player.clientKey !== key).map((player) => player.targetKey === key ? { ...player, targetKey: '' } : player)))

  const validationError = (() => {
    if (!name.trim()) return t('localSaves.validationName')
    if (context.mode === 'CREATE' && seedMode === 'SPECIFIED' && !seed.trim()) return t('localSaves.validationSeed')
    if (!players.length) return t('localSaves.validationPlayer')
    const names = new Set<string>()
    let humans = 0
    for (const player of players) {
      if (!usernamePattern.test(player.username)) return t('localSaves.validationUsername', { username: player.username || '—' })
      if (names.has(player.username)) return t('localSaves.validationDuplicate', { username: player.username })
      names.add(player.username)
      if (player.controller === 'HUMAN') humans += 1
      if (!Number.isSafeInteger(player.team) || player.team < 1) return t('localSaves.validationTeam', { username: player.username })
      if (!Number.isSafeInteger(player.join_offset) || player.join_offset < 0) return t('localSaves.validationJoin', { username: player.username })
      if (!Number.isSafeInteger(player.distance_n) || player.distance_n < 1 || player.distance_n > 32) return t('localSaves.validationDistance', { username: player.username })
      if (player.spawn_mode === 'SPECIFIED' && !player.targetKey) return t('localSaves.validationTarget', { username: player.username })
      if (player.targetKey === player.clientKey) return t('localSaves.validationTargetSelf', { username: player.username })
    }
    if (humans > 1) return t('localSaves.validationHuman')
    if (context.mode === 'CREATE' && !players.some((player) => player.join_offset === 0)) return t('localSaves.validationInitial')
    return ''
  })()

  const playerPayload = () => players.map((player) => playerConfigPayload(player, players))

  const submit = async (mode: 'CREATE' | 'OVERWRITE' | 'SAVE_AS') => {
    if (validationError || busy) return
    setBusy(mode)
    setError('')
    try {
      if (mode === 'CREATE') {
        const input: LocalCreateSaveInput = {
          save_id: context.save.save_id,
          name: name.trim(),
          seed_mode: seedMode,
          ...(seedMode === 'SPECIFIED' ? { seed: seed.trim() } : {}),
          players: playerPayload(),
        }
        const created = await api.createLocalSave(input)
        await api.activateLocalSave(created.save.save_id)
        await onCompleted(created.save)
        return
      }
      const input: LocalEditSaveInput = {
        save_id: context.save.save_id,
        ...(context.matchId ? { match_id: context.matchId } : {}),
        tick: baseTick,
        mode,
        name: name.trim(),
        players: playerPayload(),
      }
      const edited = await api.editLocalSave(input)
      await onCompleted(edited.save)
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(null)
    }
  }

  const feedback = error || validationError

  return <main className="relative min-h-dvh overflow-x-hidden px-3 py-3 sm:px-5 sm:py-5">
    <div className="relative z-10 mx-auto max-w-[90rem]">
      <header className="panel flex h-14 items-center gap-2 rounded-gold px-2">
        <button type="button" onClick={onCancel} disabled={busy !== null} aria-label={t('common.cancel')} title={t('common.cancel')} className="focus-ring grid size-9 shrink-0 place-items-center rounded-gold text-zinc-400 hover:bg-white/[.05] hover:text-white"><ChevronLeft size={16} /></button>
        <h1 className="min-w-0 truncate font-display text-base font-semibold tracking-[-.02em] text-zinc-100">{context.mode === 'CREATE' ? t('localSaves.createTitle') : t('localSaves.editTitle')}</h1>
        {context.mode === 'EDIT' && <span className="ml-auto shrink-0 rounded-full bg-white/[.04] px-3 py-1 font-mono text-[9px] tabular-nums text-zinc-400">TICK {baseTick}</span>}
      </header>

      {loading ? <div className="grid min-h-[55dvh] place-items-center"><LoaderCircle className="animate-spin text-cyan-signal" /></div> : <div className="mt-3 grid gap-3">
        <section className="panel-strong rounded-gold p-3">
          <div className={`grid gap-2 ${context.mode === 'CREATE' ? 'md:grid-cols-[minmax(12rem,1fr)_12rem_minmax(12rem,1fr)]' : 'md:grid-cols-2'}`}>
            <label className="grid min-w-0 gap-1 text-[9px] text-zinc-500"><span className="truncate">{t('localSaves.saveName')}</span><input aria-label={t('localSaves.saveName')} className="focus-ring h-9 min-w-0 rounded-gold border border-white/10 bg-space-900 px-3 text-xs text-zinc-200" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></label>
            {context.mode === 'CREATE' ? <>
              <div className="grid gap-1 text-[9px] text-zinc-500"><span>Seed</span><div className="grid h-9 grid-cols-2 gap-1"><button type="button" onClick={() => setSeedMode('RANDOM')} className={`focus-ring flex h-9 items-center justify-center gap-1.5 rounded-gold border px-2 text-[10px] ${seedMode === 'RANDOM' ? 'border-cyan-signal/40 bg-cyan-signal/10 text-blue-soft' : 'border-white/10 text-zinc-400'}`}><Dices size={12} />{t('localSaves.seedRandom')}</button><button type="button" onClick={() => setSeedMode('SPECIFIED')} className={`focus-ring h-9 rounded-gold border px-2 text-[10px] ${seedMode === 'SPECIFIED' ? 'border-cyan-signal/40 bg-cyan-signal/10 text-blue-soft' : 'border-white/10 text-zinc-400'}`}>{t('localSaves.seedSpecified')}</button></div></div>
              <label className="grid min-w-0 gap-1 text-[9px] text-zinc-500"><span className="truncate">{t('localSaves.seedValue')}</span><input aria-label={t('localSaves.seedValue')} className="focus-ring h-9 min-w-0 rounded-gold border border-white/10 bg-space-900 px-3 font-mono text-[10px] text-zinc-200 disabled:opacity-35" value={seed} disabled={seedMode !== 'SPECIFIED'} maxLength={128} onChange={(event) => setSeed(event.target.value)} placeholder={seedMode === 'SPECIFIED' ? 'arena-hero-local-world' : '—'} /></label>
            </> : <label className="grid min-w-0 gap-1 text-[9px] text-zinc-500"><span>Seed</span><input aria-label="Seed" readOnly className="h-9 min-w-0 truncate rounded-gold border border-white/10 bg-white/[.025] px-3 font-mono text-[10px] text-zinc-400" value={seed} title={seed} /></label>}
          </div>
        </section>

        <section className="panel-strong overflow-hidden rounded-gold">
          <header className="flex h-11 items-center justify-between gap-3 border-b border-white/[.08] px-3">
            <div className="flex min-w-0 items-center gap-2"><h2 className="truncate text-sm font-semibold text-zinc-200">{t('localSaves.playerRoster')}</h2><span className="grid h-5 min-w-5 place-items-center rounded-full bg-white/[.05] px-1.5 font-mono text-[9px] tabular-nums text-zinc-500">{players.length}</span></div>
            <button type="button" onClick={addPlayer} className="secondary-button flex h-8 shrink-0 items-center gap-1.5 px-3 text-[10px]"><Plus size={12} />{t('localSaves.addPlayer')}</button>
          </header>

          <div className="max-w-full overflow-x-auto overscroll-x-contain">
            <div className="min-w-[72rem]">
              <div role="row" className="grid h-8 grid-cols-[2.5rem_minmax(9rem,1.2fr)_6.5rem_7.5rem_6rem_6rem_9rem_minmax(8rem,1fr)_5.5rem_2.5rem] items-center gap-2 bg-black/20 px-2 text-[9px] text-zinc-600">
                <span role="columnheader" className="text-center">#</span><span role="columnheader" className="truncate" title={t('localSaves.username')}>{t('localSaves.username')}</span><span role="columnheader" className="truncate" title={t('localSaves.playerType')}>{t('localSaves.playerType')}</span><span role="columnheader" className="truncate" title={t('localSaves.botVersion')}>{t('localSaves.botVersion')}</span><span role="columnheader" className="truncate" title={t('localSaves.team')}>{t('localSaves.team')}</span><span role="columnheader" className="truncate" title={t('localSaves.joinOffset')}>{t('localSaves.joinOffset')}</span><span role="columnheader" className="truncate" title={t('localSaves.spawnMode')}>{t('localSaves.spawnMode')}</span><span role="columnheader" className="truncate" title={t('localSaves.adjacentTo')}>{t('localSaves.adjacentTo')}</span><span role="columnheader" className="truncate" title={t('localSaves.distanceN')}>{t('localSaves.distanceN')}</span><span aria-hidden="true" />
              </div>
              {players.map((player, index) => <PlayerEditor key={player.clientKey} player={player} index={index} players={players} teamOptions={teamOptions} onChange={(patch) => updatePlayer(player.clientKey, patch)} onRemove={() => removePlayer(player.clientKey)} />)}
              {!players.length && <button type="button" onClick={addPlayer} className="focus-ring flex h-14 w-full items-center justify-center gap-2 border-t border-dashed border-white/10 text-xs text-zinc-600 hover:bg-cyan-signal/[.025] hover:text-cyan-signal"><Plus size={14} />{t('localSaves.addFirstPlayer')}</button>}
            </div>
          </div>

          <footer className="grid min-h-14 items-center gap-2 border-t border-white/[.08] px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="flex h-8 min-w-0 items-center">{feedback && <p role={error ? 'alert' : undefined} className={`min-w-0 truncate text-[10px] ${error ? 'text-coral-hostile' : 'text-amber-100'}`} title={feedback}><CircleAlert size={12} className="mr-1.5 inline shrink-0" />{feedback}</p>}</div>
            {context.mode === 'CREATE' ? <button type="button" disabled={Boolean(validationError) || busy !== null} onClick={() => { void submit('CREATE') }} className="primary-button flex h-9 min-w-36 items-center justify-center gap-2 px-4 text-xs">{busy === 'CREATE' ? <LoaderCircle size={13} className="animate-spin" /> : <Save size={13} />}{t('localSaves.createAndEnter')}</button> : <div className="grid grid-cols-2 gap-2"><button type="button" disabled={Boolean(validationError) || busy !== null} onClick={() => { void submit('OVERWRITE') }} className="primary-button flex h-9 min-w-28 items-center justify-center gap-2 px-3 text-xs">{busy === 'OVERWRITE' ? <LoaderCircle size={13} className="animate-spin" /> : <Save size={13} />}{t('localSaves.overwrite')}</button><button type="button" disabled={Boolean(validationError) || busy !== null} onClick={() => { void submit('SAVE_AS') }} className="secondary-button flex h-9 min-w-28 items-center justify-center gap-2 px-3 text-xs">{busy === 'SAVE_AS' ? <LoaderCircle size={13} className="animate-spin" /> : <GitBranch size={13} />}{t('localSaves.saveAs')}</button></div>}
          </footer>
        </section>
      </div>}
    </div>
  </main>
}

function PlayerEditor({ player, index, players, teamOptions, onChange, onRemove }: { player: EditorPlayer; index: number; players: EditorPlayer[]; teamOptions: number[]; onChange: (patch: Partial<EditorPlayer>) => void; onRemove: () => void }) {
  const { t } = useTranslation()
  const fixedSpawn = player.status === 'ACTIVE' || player.status === 'RESPAWNING'
  const otherPlayers = players.filter((candidate) => candidate.clientKey !== player.clientKey)
  const adjacent = player.spawn_mode !== 'RANDOM'
  const rowTitle = [player.status, player.planned_position ? `SPAWN [${player.planned_position[0]}, ${player.planned_position[1]}]` : ''].filter(Boolean).join(' · ')
  const controlClass = 'focus-ring h-9 min-w-0 w-full rounded-gold border border-white/10 bg-space-900 px-2 text-[10px] text-zinc-200 disabled:opacity-40'
  return <article className="grid min-h-14 grid-cols-[2.5rem_minmax(9rem,1.2fr)_6.5rem_7.5rem_6rem_6rem_9rem_minmax(8rem,1fr)_5.5rem_2.5rem] items-center gap-2 border-t border-white/[.07] px-2 py-2">
    <span className={`flex h-8 items-center justify-center gap-1 rounded-gold font-mono text-[9px] tabular-nums ${player.controller === 'HUMAN' ? 'bg-cyan-signal/10 text-cyan-signal' : 'bg-violet-cosmic/10 text-violet-300'}`} title={rowTitle || undefined}>{player.controller === 'HUMAN' ? <User size={11} /> : <Bot size={11} />}{index + 1}</span>
    <input aria-label={t('localSaves.username')} title={player.username} value={player.username} disabled={Boolean(player.id)} maxLength={24} onChange={(event) => onChange({ username: event.target.value.toLowerCase() })} className={controlClass} />
    <select aria-label={t('localSaves.playerType')} value={player.controller} onChange={(event) => onChange({ controller: event.target.value as 'HUMAN' | 'BOT', bot_version: event.target.value === 'BOT' ? '0.0' : null })} className={controlClass}><option value="BOT">{t('localSaves.bot')}</option><option value="HUMAN">{t('localSaves.human')}</option></select>
    <select aria-label={t('localSaves.botVersion')} value={player.controller === 'BOT' ? '0.0' : ''} disabled className={controlClass}><option value="">—</option><option value="0.0">{t('localSaves.baselineV0')}</option></select>
    <select aria-label={t('localSaves.team')} value={player.team} onChange={(event) => onChange({ team: Number(event.target.value) })} className={controlClass}>{teamOptions.map((team) => <option key={team} value={team}>{t('localSaves.teamName', { team })}</option>)}</select>
    <input aria-label={t('localSaves.joinOffset')} type="number" min={0} step={1} value={player.join_offset} disabled={fixedSpawn} onChange={(event) => onChange({ join_offset: Number(event.target.value) })} className={`${controlClass} font-mono tabular-nums`} />
    <select aria-label={t('localSaves.spawnMode')} value={player.spawn_mode} disabled={fixedSpawn} onChange={(event) => onChange({ spawn_mode: event.target.value as LocalSaveSpawnMode, targetKey: event.target.value === 'RANDOM' ? '' : player.targetKey })} className={controlClass}><option value="RANDOM">{t('localSaves.spawnRandom')}</option><option value="RANDOM_ADJACENT">{t('localSaves.spawnRandomAdjacent')}</option><option value="SPECIFIED">{t('localSaves.spawnSpecified')}</option></select>
    <select aria-label={t('localSaves.adjacentTo')} value={player.targetKey} disabled={!adjacent || fixedSpawn} onChange={(event) => onChange({ targetKey: event.target.value })} className={controlClass}><option value="">{adjacent && player.spawn_mode === 'RANDOM_ADJACENT' ? t('localSaves.anyPlayer') : adjacent ? t('localSaves.choosePlayer') : '—'}</option>{otherPlayers.map((candidate) => <option key={candidate.clientKey} value={candidate.clientKey}>{candidate.username || t('localSaves.unnamedPlayer')}</option>)}</select>
    <input aria-label={t('localSaves.distanceN')} type="number" min={1} max={32} step={1} value={player.distance_n} disabled={!adjacent || fixedSpawn} onChange={(event) => onChange({ distance_n: Number(event.target.value) })} className={`${controlClass} font-mono tabular-nums`} />
    <button type="button" onClick={onRemove} className="focus-ring grid size-9 place-items-center rounded-gold text-zinc-600 hover:bg-coral-hostile/10 hover:text-coral-hostile" aria-label={t('localSaves.removePlayer')}><Trash2 size={13} /></button>
  </article>
}
