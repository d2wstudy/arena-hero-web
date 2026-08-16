import type { LocalViewSelection } from './types'
import { MAX_WORLD_CELL_SIZE, MIN_WORLD_CELL_SIZE, type WorldCamera } from './worldCanvasPerformance'

export type LocalControlTab = 'advance' | 'view' | 'history' | 'lab'

export interface LocalControlWorkspace {
  drawerOpen: boolean
  activeTab: LocalControlTab
  batchTickText: string
  autoTickSecondsText: string
}

export interface LocalReplayWorkspace {
  matchId: string
  tick: number
}

export interface LocalWorkspaceState {
  version: 1
  view: LocalViewSelection
  selectedTeam: number | null
  selectedObjectId: string | null
  camera: WorldCamera | null
  control: LocalControlWorkspace
  replay: LocalReplayWorkspace | null
}

export function localWorkspaceStorageKey(saveId: string) {
  return `arena-hero.local-workspace.${saveId}`
}

export function defaultLocalWorkspaceState(): LocalWorkspaceState {
  return {
    version: 1,
    view: { mode: 'HUMAN' },
    selectedTeam: null,
    selectedObjectId: null,
    camera: null,
    control: {
      drawerOpen: false,
      activeTab: 'advance',
      batchTickText: '10',
      autoTickSecondsText: '1',
    },
    replay: null,
  }
}

export function readLocalWorkspaceState(serialized: string | null): LocalWorkspaceState {
  if (!serialized) return defaultLocalWorkspaceState()
  try {
    return normalizeLocalWorkspaceState(JSON.parse(serialized))
  } catch {
    return defaultLocalWorkspaceState()
  }
}

export function normalizeLocalWorkspaceState(value: unknown): LocalWorkspaceState {
  const fallback = defaultLocalWorkspaceState()
  const candidate = record(value)
  const control = record(candidate.control)
  return {
    version: 1,
    view: normalizeView(candidate.view),
    selectedTeam: positiveInteger(candidate.selectedTeam),
    selectedObjectId: nonEmptyString(candidate.selectedObjectId),
    camera: normalizeCamera(candidate.camera),
    control: {
      drawerOpen: typeof control.drawerOpen === 'boolean' ? control.drawerOpen : fallback.control.drawerOpen,
      activeTab: controlTab(control.activeTab),
      batchTickText: shortText(control.batchTickText, fallback.control.batchTickText),
      autoTickSecondsText: shortText(control.autoTickSecondsText, fallback.control.autoTickSecondsText),
    },
    replay: normalizeReplay(candidate.replay),
  }
}

export function workspaceAfterWorldEdit(workspace: LocalWorkspaceState): LocalWorkspaceState {
  return { ...workspace, replay: null }
}

function normalizeView(value: unknown): LocalViewSelection {
  const view = record(value)
  if (view.mode === 'GLOBAL') return { mode: 'GLOBAL' }
  if (view.mode === 'PLAYER') {
    const playerId = nonEmptyString(view.playerId)
    if (playerId) return { mode: 'PLAYER', playerId }
  }
  return { mode: 'HUMAN' }
}

function normalizeCamera(value: unknown): WorldCamera | null {
  const camera = record(value)
  if (!finiteNumber(camera.x) || !finiteNumber(camera.y) || !finiteNumber(camera.cell)) return null
  return {
    x: camera.x,
    y: camera.y,
    cell: Math.min(MAX_WORLD_CELL_SIZE, Math.max(MIN_WORLD_CELL_SIZE, camera.cell)),
  }
}

function normalizeReplay(value: unknown): LocalReplayWorkspace | null {
  const replay = record(value)
  const matchId = nonEmptyString(replay.matchId)
  if (!matchId || !Number.isSafeInteger(replay.tick) || typeof replay.tick !== 'number' || replay.tick < 0) return null
  return { matchId, tick: replay.tick }
}

function controlTab(value: unknown): LocalControlTab {
  return value === 'view' || value === 'history' || value === 'lab' ? value : 'advance'
}

function positiveInteger(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 ? value : null
}

function nonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.slice(0, 256) : null
}

function shortText(value: unknown, fallback: string) {
  return typeof value === 'string' ? value.slice(0, 32) : fallback
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}
