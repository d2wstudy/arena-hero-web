import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEffect } from 'react'
import '../lib/i18n'
import { defaultLocalWorkspaceState, localWorkspaceStorageKey } from '../lib/localWorkspace'
import type { LocalHistory, LocalMatchStatus, LocalObservation, LocalReplay, LocalSession, LocalViewSelection } from '../lib/types'
import { observationChunkViewport } from '../lib/worldCanvasPerformance'
import { ArenaPage } from './ArenaPage'

const useGameStreamMock = vi.hoisted(() => vi.fn())
const game = vi.hoisted(() => ({
  tick: 42,
  liveTick: 42,
  state: {
    view_mode: undefined as 'GOD' | undefined,
    status: 'ACTIVE' as const,
    resources: 8,
    population: 2,
    champion_beacon: { position: [0, 0] as [number, number] },
    objects: [
      { kind: 'CORE' as const, id: 'core', controlled: true, team: 1, position: [0, 0] as [number, number], hp: 5, shield: 5, state: 'NORMAL' as const },
      { kind: 'UNIT' as const, id: 'worker', controlled: true, team: 1, position: [12, -7] as [number, number], hp: 2, unit_type: 'WORKER' as const, cargo: 0 },
      { kind: 'UNIT' as const, id: 'ranger', controlled: true, team: 1, position: [0, 0] as [number, number], hp: 2, unit_type: 'RANGER' as const },
      { kind: 'UNIT' as const, id: 'high', controlled: false, team: 2, position: [3, 1] as [number, number], hp: 4, unit_type: 'VANGUARD' as const },
      { kind: 'UNIT' as const, id: 'low', controlled: false, team: 2, position: [4, 0] as [number, number], hp: 1, unit_type: 'WORKER' as const },
    ],
    events: [],
  },
  explored: new Map(),
  phase: 'open' as const,
  stateReceivedAt: Date.now(),
  receipts: {},
  submit: vi.fn(),
  error: null,
  observation: null as LocalObservation | null,
  localSession: null as LocalSession | null,
  localStatus: null as LocalMatchStatus | null,
  localHistory: null as LocalHistory | null,
  replay: null as LocalReplay | null,
  localView: { mode: 'HUMAN' } as LocalViewSelection,
  observationPending: false,
  godSnapshot: null,
  readOnly: false,
  submissionSource: 'MANUAL' as const,
  advance: vi.fn().mockResolvedValue(undefined),
  showReplay: vi.fn().mockResolvedValue(undefined),
  returnLive: vi.fn(),
  branchFromReplay: vi.fn().mockResolvedValue(undefined),
  setLocalObservation: vi.fn().mockResolvedValue(undefined),
  setObservationViewport: vi.fn(),
  loadGodDiagnostics: vi.fn().mockResolvedValue(undefined),
  setHumanFullVision: vi.fn().mockResolvedValue(undefined),
  addLocalParticipant: vi.fn().mockResolvedValue(undefined),
  setTickLabel: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../hooks/useGameStream', () => ({ useGameStream: (...args: unknown[]) => { useGameStreamMock(...args); return game } }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { username: 'player' } }) }))
vi.mock('../components/game/WorldCanvas', () => ({
  WorldCanvas: ({ centerPosition, centerRequest, selectedId, initialCamera, attackPositions = [], tacticMovements = [], onAttackPosition, onAnchorChange }: { centerPosition?: [number, number] | null; centerRequest: number; selectedId: string | null; initialCamera?: { x: number; y: number; cell: number } | null; attackPositions?: [number, number][]; tacticMovements?: unknown[]; onAttackPosition?: (position: [number, number]) => void; onAnchorChange: (anchor: { x: number; y: number; side: 'right' } | null) => void }) => {
    useEffect(() => { onAnchorChange(selectedId ? { x: 100, y: 100, side: 'right' } : null) }, [onAnchorChange, selectedId])
    return <div
        data-testid="world-canvas"
        data-center-position={centerPosition ? JSON.stringify(centerPosition) : ''}
        data-center-request={centerRequest}
        data-selected-id={selectedId ?? ''}
        data-initial-camera={initialCamera ? JSON.stringify(initialCamera) : ''}
        data-tactic-movements={JSON.stringify(tacticMovements)}
      >
        {attackPositions.some(([x, y]) => x === 3 && y === 0) && <button type="button" onClick={() => onAttackPosition?.([3, 0])}>Attack predicted cell</button>}
      </div>
  },
}))

describe('ArenaPage asset selection', () => {
  beforeEach(() => {
    localStorage.clear()
    useGameStreamMock.mockClear()
    game.submit.mockReset()
    game.observation = null
    game.localSession = null
    game.localStatus = null
    game.localHistory = null
    game.replay = null
    game.localView = { mode: 'HUMAN' }
    game.observationPending = false
    game.readOnly = false
    game.state.view_mode = undefined
  })

  it('centers the map on a Unit selected from the asset list', async () => {
    render(<ArenaPage demo />)
    const map = screen.getByTestId('world-canvas')
    expect(map).toHaveAttribute('data-center-position', '')
    expect(map).toHaveAttribute('data-center-request', '0')

    await userEvent.click(screen.getByText('Worker'))

    expect(map).toHaveAttribute('data-center-position', '[12,-7]')
    expect(map).toHaveAttribute('data-center-request', '1')
  })

	it('submits a Ranger cell shot without requiring a visible target', async () => {
    const user = userEvent.setup()
    render(<ArenaPage demo />)

    await user.click(screen.getByText('Ranger'))
    await user.click(screen.getByRole('button', { name: 'Shoot' }))
    await user.click(screen.getByRole('button', { name: 'Attack predicted cell' }))

		await waitFor(() => expect(game.submit).toHaveBeenCalledWith({
			tick: 42,
			unit_actions: { ranger: { type: 'SHOOT', expected_cell: [3, 0] } },
		}))
  })

  it('passes local tactic movement diagnostics to the world map', () => {
    game.observation = {
      match_id: 'match-1',
      tick: 42,
      live: true,
      view: { mode: 'PLAYER', player_id: 'bot-1', username: 'bot' },
      state: game.state,
      exploration: { ranges: [], obstacles: [], resources: [] },
      tactics: [{
        player_id: 'bot-1',
        username: 'bot',
        movement: [{ object_id: 'worker', purpose: 'RESOURCE', target: [14, -7], path: [[12, -7], [13, -7], [14, -7]], blocked: false }],
      }],
    }

    render(<ArenaPage local />)

    expect(screen.getByTestId('world-canvas')).toHaveAttribute('data-tactic-movements', JSON.stringify(game.observation.tactics![0].movement))
  })

  it('restores a save workspace before showing the arena', async () => {
    const workspace = {
      ...defaultLocalWorkspaceState(),
      view: { mode: 'GLOBAL' as const },
      selectedTeam: 2,
      selectedObjectId: 'high',
      camera: { x: 31.5, y: -18, cell: 36 },
      control: { drawerOpen: true, activeTab: 'view' as const, batchTickText: '25', autoTickSecondsText: '.4' },
    }
    localStorage.setItem(localWorkspaceStorageKey('save-1'), JSON.stringify(workspace))
    game.state.view_mode = 'GOD'
    game.localView = { mode: 'GLOBAL' }
    game.readOnly = true
    game.localSession = { csrf_token: 'local', username: 'commander', mode: 'step', match_id: 'match-1', save_id: 'save-1', observer_only: false, god_mode: true }
    game.localStatus = {
      mode: 'step', tick: 42, phase: 'OPEN', human: 'commander', bots: [], match_id: 'match-1', root_match_id: 'match-1', god: { human_full_vision: false },
      participants: [
        { id: 'human-1', username: 'commander', controller: 'HUMAN', status: 'ACTIVE' },
        { id: 'bot-1', username: 'bot', controller: 'BOT', status: 'ACTIVE' },
      ],
    }
    game.observation = {
      match_id: 'match-1', tick: 42, live: true, view: { mode: 'GLOBAL' }, state: game.state,
      exploration: { ranges: [], obstacles: [], resources: [] }, player_fog: [],
    }

    render(<ArenaPage local localSaveId="save-1" />)

    const map = await screen.findByTestId('world-canvas')
    expect(useGameStreamMock).toHaveBeenLastCalledWith(false, 'local:save-1', true, false, { mode: 'GLOBAL' }, observationChunkViewport(workspace.camera, {
      width: Math.max(1, window.innerWidth - (window.innerWidth >= 1024 ? 260 : 0)),
      height: Math.max(1, window.innerHeight),
    }))
    expect(map).toHaveAttribute('data-initial-camera', JSON.stringify(workspace.camera))
    expect(map).toHaveAttribute('data-selected-id', 'high')
    expect(screen.getByRole('button', { name: 'Team 2' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: /^Core \[/ })).not.toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Control panel sections' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Tick interval (seconds)' })).toHaveValue(0.4)
  })
})
