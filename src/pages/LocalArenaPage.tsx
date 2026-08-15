import { Bot, ChevronLeft, CircleAlert, Database, Dices, FolderOpen, GitBranch, LoaderCircle, Plus, RefreshCw, Save, Settings2, Trash2, User } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { APIError, api } from '../lib/api'
import { getErrorMessage } from '../lib/errorMessage'
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
      setActiveSave(save)
      setEditor(null)
      setScreen('GAME')
      await refreshCatalog()
    }} />
  }

  return <main className="relative min-h-dvh overflow-x-hidden px-5 py-8 sm:px-8 lg:px-12">
    <div className="relative z-10 mx-auto w-full max-w-6xl">
      <header className="flex flex-col gap-5 border-b border-white/10 pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">LOCAL WORLD ARCHIVE</p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-[-.04em] text-zinc-100 sm:text-5xl">{t('localSaves.title')}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-500">{t('localSaves.subtitle')}</p>
        </div>
        <button type="button" disabled={loading} onClick={() => { setLoading(true); void refreshCatalog().catch((cause) => setError(errorText(cause))).finally(() => setLoading(false)) }} className="secondary-button flex items-center justify-center gap-2 self-start sm:self-auto"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} />{t('localSaves.refresh')}</button>
      </header>

      {error && <div role="alert" className="mt-5 flex items-start gap-3 rounded-gold border border-coral-hostile/25 bg-coral-hostile/[.07] px-4 py-3 text-sm text-coral-hostile"><CircleAlert size={17} className="mt-0.5 shrink-0" /><span>{error}</span></div>}

      {loading && !catalog ? <div className="grid min-h-[50dvh] place-items-center"><LoaderCircle className="animate-spin text-cyan-signal" aria-label={t('common.loading')} /></div> : <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label={t('localSaves.list')}>
        {catalog?.saves.map((save) => save.empty
          ? <button key={save.save_id} type="button" onClick={() => openCreate(save)} className="focus-ring group flex min-h-52 flex-col items-center justify-center rounded-gold-lg border border-dashed border-white/12 bg-white/[.018] p-6 text-center transition hover:border-cyan-signal/35 hover:bg-cyan-signal/[.035]">
              <span className="grid size-12 place-items-center rounded-full border border-white/10 bg-white/[.035] text-zinc-500 transition group-hover:border-cyan-signal/30 group-hover:text-cyan-signal"><Plus size={20} /></span>
              <span className="mt-4 font-display text-base font-semibold text-zinc-300">{t('localSaves.emptySlot', { slot: save.slot })}</span>
              <span className="mt-1 text-xs text-zinc-600">{t('localSaves.createHint')}</span>
            </button>
          : <button key={save.save_id} type="button" disabled={busySaveId !== null} onClick={() => { void enterSave(save) }} className="focus-ring group relative min-h-52 overflow-hidden rounded-gold-lg border border-white/10 bg-space-900/85 p-5 text-left transition hover:border-cyan-signal/30 hover:bg-space-850 disabled:opacity-55">
              <span className="absolute right-4 top-4 font-mono text-[9px] tracking-[.14em] text-zinc-600">SLOT {String(save.slot).padStart(2, '0')}</span>
              <span className="flex items-center gap-2 text-cyan-signal"><Database size={15} /><span className="font-mono text-[9px] tracking-[.14em]">{save.active ? t('localSaves.active') : t('localSaves.saved')}</span></span>
              <h2 className="mt-4 truncate font-display text-xl font-semibold text-zinc-100">{save.name}</h2>
              <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                <div><dt className="text-zinc-600">Tick</dt><dd className="mt-1 font-mono text-zinc-300">{save.latest_tick ?? '—'}</dd></div>
                <div><dt className="text-zinc-600">{t('localSaves.players')}</dt><dd className="mt-1 font-mono text-zinc-300">{save.player_count}</dd></div>
                <div className="col-span-2"><dt className="text-zinc-600">Seed</dt><dd className="mt-1 truncate font-mono text-[10px] text-zinc-400" title={save.seed ?? ''}>{save.seed ?? '—'}</dd></div>
              </dl>
              <span className="mt-5 flex items-center gap-2 text-xs font-medium text-blue-soft">{busySaveId === save.save_id ? <LoaderCircle size={13} className="animate-spin" /> : <FolderOpen size={13} />}{t('localSaves.enter')}</span>
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
  const sequenceRef = useRef(0)

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
      setPlayers(keyed.map((player) => ({ ...player, targetKey: player.target_player_id ? keyById.get(player.target_player_id) ?? '' : '' })))
      setError('')
    }).catch((cause) => {
      if (!(cause instanceof Error && cause.name === 'AbortError')) setError(errorText(cause))
    }).finally(() => setLoading(false))
    return () => controller.abort()
  }, [context])

  const teams = useMemo(() => Array.from(new Set(players.map((player) => player.team))).sort((a, b) => a - b), [players])
  const nextTeam = useMemo(() => {
    const occupied = new Set(teams)
    let candidate = 1
    while (occupied.has(candidate)) candidate += 1
    return candidate
  }, [teams])
  const addPlayer = () => {
    sequenceRef.current += 1
    const number = players.length + 1
    const existingNames = new Set(players.map((player) => player.username))
    let username = `player_${number}`
    while (existingNames.has(username)) {
      sequenceRef.current += 1
      username = `player_${number + sequenceRef.current}`
    }
    const team = Math.max(0, ...teams) + 1
    setPlayers((current) => [...current, {
      clientKey: crypto.randomUUID(),
      targetKey: '',
      username,
      controller: 'BOT',
      bot_version: '0.0',
      team,
      join_offset: current.length ? 1 : 0,
      spawn_mode: current.length ? 'RANDOM_ADJACENT' : 'RANDOM',
      distance_n: 1,
      distance_tolerance: 5,
    }])
  }

  const updatePlayer = (key: string, patch: Partial<EditorPlayer>) => setPlayers((current) => current.map((player) => player.clientKey === key ? { ...player, ...patch } : player))
  const removePlayer = (key: string) => setPlayers((current) => current.filter((player) => player.clientKey !== key).map((player) => player.targetKey === key ? { ...player, targetKey: '' } : player))

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

  return <main className="relative min-h-dvh px-4 py-6 sm:px-8 lg:px-12">
    <div className="relative z-10 mx-auto max-w-6xl">
      <header className="flex items-start gap-4 border-b border-white/10 pb-6">
        <button type="button" onClick={onCancel} disabled={busy !== null} aria-label={t('common.cancel')} title={t('common.cancel')} className="focus-ring grid size-11 shrink-0 place-items-center rounded-gold border border-white/10 text-zinc-400 hover:bg-white/[.04] hover:text-white"><ChevronLeft size={18} /></button>
        <div className="min-w-0">
          <p className="eyebrow">{context.mode === 'CREATE' ? 'NEW WORLD' : `WORLD SNAPSHOT · TICK ${baseTick}`}</p>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-[-.035em] text-zinc-100 sm:text-4xl">{context.mode === 'CREATE' ? t('localSaves.createTitle') : t('localSaves.editTitle')}</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-500">{context.mode === 'CREATE' ? t('localSaves.createSubtitle') : t('localSaves.editSubtitle', { tick: baseTick })}</p>
        </div>
      </header>

      {error && <div role="alert" className="mt-5 flex items-start gap-3 rounded-gold border border-coral-hostile/25 bg-coral-hostile/[.07] px-4 py-3 text-sm text-coral-hostile"><CircleAlert size={17} className="mt-0.5 shrink-0" /><span>{error}</span></div>}
      {loading ? <div className="grid min-h-[55dvh] place-items-center"><LoaderCircle className="animate-spin text-cyan-signal" /></div> : <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="panel-strong rounded-gold-lg p-4 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-xs text-zinc-500"><span>{t('localSaves.saveName')}</span><input className="input" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></label>
            <div className="grid gap-2 text-xs text-zinc-500"><span>Seed</span>{context.mode === 'CREATE' ? <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setSeedMode('RANDOM')} className={`focus-ring min-h-12 rounded-gold border text-sm ${seedMode === 'RANDOM' ? 'border-cyan-signal/40 bg-cyan-signal/10 text-blue-soft' : 'border-white/10 text-zinc-400'}`}><Dices size={14} className="mr-2 inline" />{t('localSaves.seedRandom')}</button><button type="button" onClick={() => setSeedMode('SPECIFIED')} className={`focus-ring min-h-12 rounded-gold border text-sm ${seedMode === 'SPECIFIED' ? 'border-cyan-signal/40 bg-cyan-signal/10 text-blue-soft' : 'border-white/10 text-zinc-400'}`}>{t('localSaves.seedSpecified')}</button></div> : <div className="flex min-h-12 items-center rounded-gold border border-white/10 bg-white/[.025] px-4 font-mono text-xs text-zinc-400">{seed}</div>}</div>
          </div>
          {context.mode === 'CREATE' && seedMode === 'SPECIFIED' && <label className="mt-4 grid gap-2 text-xs text-zinc-500"><span>{t('localSaves.seedValue')}</span><input className="input font-mono" value={seed} maxLength={128} onChange={(event) => setSeed(event.target.value)} placeholder="arena-hero-local-world" /></label>}

          <div className="mt-7 flex items-center justify-between gap-4 border-b border-white/[.08] pb-3">
            <div><p className="font-display text-lg font-semibold text-zinc-200">{t('localSaves.playerRoster')}</p><p className="mt-1 text-xs text-zinc-600">{t('localSaves.playerHint')}</p></div>
            <button type="button" onClick={addPlayer} className="secondary-button flex items-center gap-2"><Plus size={14} />{t('localSaves.addPlayer')}</button>
          </div>

          <div className="mt-4 grid gap-4">
            {players.map((player, index) => <PlayerEditor key={player.clientKey} player={player} index={index} players={players} teams={teams} nextTeam={nextTeam} onChange={(patch) => updatePlayer(player.clientKey, patch)} onRemove={() => removePlayer(player.clientKey)} />)}
            {!players.length && <button type="button" onClick={addPlayer} className="focus-ring flex min-h-36 flex-col items-center justify-center rounded-gold border border-dashed border-white/12 text-zinc-600 hover:border-cyan-signal/30 hover:text-cyan-signal"><Plus size={20} /><span className="mt-2 text-sm">{t('localSaves.addFirstPlayer')}</span></button>}
          </div>
        </section>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="panel rounded-gold-lg p-5">
            <div className="flex items-center gap-2 text-blue-soft"><Settings2 size={15} /><p className="font-mono text-[10px] tracking-[.13em]">{t('localSaves.summary')}</p></div>
            <dl className="mt-5 grid gap-3 text-xs"><div className="flex justify-between gap-4"><dt className="text-zinc-600">{t('localSaves.players')}</dt><dd className="font-mono text-zinc-300">{players.length}</dd></div><div className="flex justify-between gap-4"><dt className="text-zinc-600">{t('localSaves.humans')}</dt><dd className="font-mono text-zinc-300">{players.filter((player) => player.controller === 'HUMAN').length}</dd></div><div className="flex justify-between gap-4"><dt className="text-zinc-600">{t('localSaves.teams')}</dt><dd className="font-mono text-zinc-300">{teams.length}</dd></div><div className="flex justify-between gap-4"><dt className="text-zinc-600">{t('localSaves.baseTick')}</dt><dd className="font-mono text-zinc-300">{baseTick}</dd></div></dl>
            {validationError && <p className="mt-4 rounded-gold border border-amber-300/20 bg-amber-300/[.06] px-3 py-2 text-xs leading-5 text-amber-100">{validationError}</p>}
            {context.mode === 'CREATE' ? <button type="button" disabled={Boolean(validationError) || busy !== null} onClick={() => { void submit('CREATE') }} className="primary-button mt-5 flex w-full items-center justify-center gap-2">{busy === 'CREATE' ? <LoaderCircle size={14} className="animate-spin" /> : <Save size={14} />}{t('localSaves.createAndEnter')}</button> : <div className="mt-5 grid gap-2"><button type="button" disabled={Boolean(validationError) || busy !== null} onClick={() => { void submit('OVERWRITE') }} className="primary-button flex w-full items-center justify-center gap-2">{busy === 'OVERWRITE' ? <LoaderCircle size={14} className="animate-spin" /> : <Save size={14} />}{t('localSaves.overwrite')}</button><button type="button" disabled={Boolean(validationError) || busy !== null} onClick={() => { void submit('SAVE_AS') }} className="secondary-button flex w-full items-center justify-center gap-2">{busy === 'SAVE_AS' ? <LoaderCircle size={14} className="animate-spin" /> : <GitBranch size={14} />}{t('localSaves.saveAs')}</button><p className="text-[10px] leading-4 text-zinc-600">{t('localSaves.editWarning')}</p></div>}
          </div>
        </aside>
      </div>}
    </div>
  </main>
}

function PlayerEditor({ player, index, players, teams, nextTeam, onChange, onRemove }: { player: EditorPlayer; index: number; players: EditorPlayer[]; teams: number[]; nextTeam: number; onChange: (patch: Partial<EditorPlayer>) => void; onRemove: () => void }) {
  const { t } = useTranslation()
  const fixedSpawn = player.status === 'ACTIVE' || player.status === 'RESPAWNING'
  const otherPlayers = players.filter((candidate) => candidate.clientKey !== player.clientKey)
  const adjacent = player.spawn_mode !== 'RANDOM'
  return <article className="rounded-gold border border-white/[.09] bg-black/20 p-4">
    <header className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3"><span className={`grid size-9 shrink-0 place-items-center rounded-full ${player.controller === 'HUMAN' ? 'bg-cyan-signal/10 text-cyan-signal' : 'bg-violet-cosmic/10 text-violet-300'}`}>{player.controller === 'HUMAN' ? <User size={15} /> : <Bot size={15} />}</span><div className="min-w-0"><p className="truncate text-sm font-semibold text-zinc-200">{player.username || t('localSaves.unnamedPlayer')}</p><p className="mt-0.5 font-mono text-[9px] text-zinc-600">PLAYER {String(index + 1).padStart(2, '0')}{player.status ? ` · ${player.status}` : ''}</p></div></div>
      <button type="button" onClick={onRemove} className="focus-ring grid size-9 place-items-center rounded-gold text-zinc-600 hover:bg-coral-hostile/10 hover:text-coral-hostile" aria-label={t('localSaves.removePlayer')}><Trash2 size={14} /></button>
    </header>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <label className="grid gap-1.5 text-[10px] text-zinc-500"><span>{t('localSaves.username')}</span><input value={player.username} disabled={Boolean(player.id)} maxLength={24} onChange={(event) => onChange({ username: event.target.value.toLowerCase() })} className="focus-ring min-h-11 rounded-gold border border-white/10 bg-space-900 px-3 text-sm text-zinc-200 disabled:opacity-55" /></label>
      <label className="grid gap-1.5 text-[10px] text-zinc-500"><span>{t('localSaves.playerType')}</span><select value={player.controller} onChange={(event) => onChange({ controller: event.target.value as 'HUMAN' | 'BOT', bot_version: event.target.value === 'BOT' ? '0.0' : null })} className="focus-ring min-h-11 rounded-gold border border-white/10 bg-space-900 px-3 text-sm text-zinc-200"><option value="BOT">{t('localSaves.bot')}</option><option value="HUMAN">{t('localSaves.human')}</option></select></label>
      <label className="grid gap-1.5 text-[10px] text-zinc-500"><span>{t('localSaves.team')}</span><select value={player.team} onChange={(event) => onChange({ team: Number(event.target.value) })} className="focus-ring min-h-11 rounded-gold border border-white/10 bg-space-900 px-3 text-sm text-zinc-200">{teams.map((team) => <option key={team} value={team}>{t('localSaves.teamName', { team })}</option>)}<option value={nextTeam}>{t('localSaves.newTeamName', { team: nextTeam })}</option></select></label>
      {player.controller === 'BOT' && <label className="grid gap-1.5 text-[10px] text-zinc-500"><span>{t('localSaves.botVersion')}</span><select value="0.0" disabled className="focus-ring min-h-11 rounded-gold border border-white/10 bg-space-900 px-3 text-sm text-zinc-400"><option value="0.0">{t('localSaves.baselineV0')}</option></select></label>}
      <label className="grid gap-1.5 text-[10px] text-zinc-500"><span>{t('localSaves.joinOffset')}</span><input type="number" min={0} step={1} value={player.join_offset} disabled={fixedSpawn} onChange={(event) => onChange({ join_offset: Number(event.target.value) })} className="focus-ring min-h-11 rounded-gold border border-white/10 bg-space-900 px-3 font-mono text-sm text-zinc-200 disabled:opacity-45" /></label>
      <label className="grid gap-1.5 text-[10px] text-zinc-500"><span>{t('localSaves.spawnMode')}</span><select value={player.spawn_mode} disabled={fixedSpawn} onChange={(event) => onChange({ spawn_mode: event.target.value as LocalSaveSpawnMode, targetKey: event.target.value === 'RANDOM' ? '' : player.targetKey })} className="focus-ring min-h-11 rounded-gold border border-white/10 bg-space-900 px-3 text-sm text-zinc-200 disabled:opacity-45"><option value="RANDOM">{t('localSaves.spawnRandom')}</option><option value="RANDOM_ADJACENT">{t('localSaves.spawnRandomAdjacent')}</option><option value="SPECIFIED">{t('localSaves.spawnSpecified')}</option></select></label>
      {adjacent && <><label className="grid gap-1.5 text-[10px] text-zinc-500"><span>{t('localSaves.adjacentTo')}</span><select value={player.targetKey} disabled={fixedSpawn} onChange={(event) => onChange({ targetKey: event.target.value })} className="focus-ring min-h-11 rounded-gold border border-white/10 bg-space-900 px-3 text-sm text-zinc-200 disabled:opacity-45"><option value="">{player.spawn_mode === 'RANDOM_ADJACENT' ? t('localSaves.anyPlayer') : t('localSaves.choosePlayer')}</option>{otherPlayers.map((candidate) => <option key={candidate.clientKey} value={candidate.clientKey}>{candidate.username || t('localSaves.unnamedPlayer')}</option>)}</select></label><label className="grid gap-1.5 text-[10px] text-zinc-500"><span>{t('localSaves.distanceN')}</span><input type="number" min={1} max={32} step={1} value={player.distance_n} disabled={fixedSpawn} onChange={(event) => onChange({ distance_n: Number(event.target.value) })} className="focus-ring min-h-11 rounded-gold border border-white/10 bg-space-900 px-3 font-mono text-sm text-zinc-200 disabled:opacity-45" /></label></>}
    </div>
    {player.planned_position && <p className="mt-3 font-mono text-[9px] text-zinc-600">SPAWN [{player.planned_position[0]}, {player.planned_position[1]}] · {t('localSaves.spawnValidated')}</p>}
  </article>
}
