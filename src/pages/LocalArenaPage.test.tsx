import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../lib/i18n'
import { LocalArenaPage } from './LocalArenaPage'

const mocks = vi.hoisted(() => {
  class MockAPIError extends Error {
    constructor(public code: string, public status: number, message?: string, public details?: unknown) {
      super(message || code)
    }
  }
  return {
    MockAPIError,
    startLocalSession: vi.fn(),
    localSaveCatalog: vi.fn(),
    createLocalSave: vi.fn(),
    activateLocalSave: vi.fn(),
    localSaveConfig: vi.fn(),
    editLocalSave: vi.fn(),
  }
})

vi.mock('../lib/api', () => ({ api: mocks, APIError: mocks.MockAPIError }))
vi.mock('./ArenaPage', () => ({
  ArenaPage: ({ onLocalEdit, onLocalExit }: { onLocalEdit?: (tick: number, matchId?: string) => void; onLocalExit?: () => void }) => <div>
    <div>LOCAL GAME</div>
    {onLocalEdit && <button type="button" onClick={() => onLocalEdit(7, 'branch-match')}>EDIT LOCAL</button>}
    {onLocalExit && <button type="button" onClick={onLocalExit}>EXIT LOCAL</button>}
  </div>,
}))

const emptySave = {
  slot: 1,
  save_id: 'save-1',
  name: 'Empty save 1',
  match_id: null,
  created_at: '2026-08-16T00:00:00Z',
  updated_at: '2026-08-16T00:00:00Z',
  latest_tick: null,
  seed: null,
  player_count: 0,
  empty: true,
  active: false,
}

const occupiedSave = {
  ...emptySave,
  name: 'Existing world',
  match_id: 'head-match',
  latest_tick: 7,
  seed: 'existing-seed',
  player_count: 1,
  empty: false,
}

describe('LocalArenaPage save flow', () => {
  beforeEach(() => {
    void i18n.changeLanguage('en')
    vi.clearAllMocks()
    mocks.startLocalSession.mockResolvedValue({ csrf_token: 'csrf', username: null, mode: 'step', match_id: null, save_id: null, god_mode: true })
    mocks.localSaveCatalog.mockResolvedValue({ saves: [emptySave], active_save_id: null, slot_count: 1 })
  })

  it('opens an empty slot, creates a default player, and enters the new world', async () => {
    const createdSave = { ...emptySave, name: 'Local world 1', match_id: 'match-1', latest_tick: 1, seed: 'random-seed', player_count: 1, empty: false }
    mocks.createLocalSave.mockResolvedValue({ accepted: true, save: createdSave })
    mocks.activateLocalSave.mockResolvedValue({ accepted: true, save: { ...createdSave, active: true }, match_id: 'match-1' })
    mocks.localSaveCatalog.mockResolvedValueOnce({ saves: [emptySave], active_save_id: null, slot_count: 1 }).mockResolvedValueOnce({ saves: [{ ...createdSave, active: true }], active_save_id: 'save-1', slot_count: 1 })

    const user = userEvent.setup()
    render(<LocalArenaPage />)

    await user.click(await screen.findByRole('button', { name: /Empty save 1/i }))
    await user.click(screen.getByRole('button', { name: /Add the first player/i }))
    await user.click(screen.getByRole('button', { name: /Create and enter/i }))

    await screen.findByText('LOCAL GAME')
    expect(mocks.createLocalSave).toHaveBeenCalledWith(expect.objectContaining({
      save_id: 'save-1',
      seed_mode: 'RANDOM',
      players: [expect.objectContaining({ username: 'player_1', controller: 'BOT', join_offset: 0 })],
    }))
    expect(mocks.activateLocalSave).toHaveBeenCalledWith('save-1')
  })

  it('keeps the editor open and exposes an immediate illegal-spawn error', async () => {
    mocks.createLocalSave.mockRejectedValue(new mocks.MockAPIError('NO_LEGAL_SPAWN', 409, '当前没有满足规则的合法出生位置，请调整后重试'))
    const user = userEvent.setup()
    render(<LocalArenaPage />)

    await user.click(await screen.findByRole('button', { name: /Empty save 1/i }))
    await user.click(screen.getByRole('button', { name: /Add the first player/i }))
    await user.click(screen.getByRole('button', { name: /Create and enter/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('当前没有满足规则的合法出生位置'))
    expect(mocks.activateLocalSave).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: /Configure a new world/i })).toBeInTheDocument()
  })

  it('loads an existing snapshot, locks born spawn fields, and preserves match_id on save-as', async () => {
    const branchedSave = { ...occupiedSave, save_id: 'save-branch', name: 'Existing branch', match_id: 'new-match' }
    mocks.localSaveCatalog.mockResolvedValue({ saves: [occupiedSave], active_save_id: null, slot_count: 1 })
    mocks.activateLocalSave.mockResolvedValue({ accepted: true, save: { ...occupiedSave, active: true }, match_id: 'head-match' })
    mocks.localSaveConfig.mockResolvedValue({
      save: occupiedSave,
      match_id: 'branch-match',
      tick: 7,
      config: {
        base_tick: 7,
        seed: 'existing-seed',
        players: [{
          id: '11111111-1111-4111-8111-111111111111',
          username: 'commander',
          controller: 'HUMAN',
          bot_version: null,
          team: 1,
          activation_tick: 0,
          join_offset: 0,
          spawn_mode: 'RANDOM',
          target_player_id: null,
          distance_n: 1,
          distance_tolerance: 5,
          planned_position: [4, 5],
          status: 'ACTIVE',
        }],
      },
    })
    mocks.editLocalSave.mockResolvedValue({ accepted: true, mode: 'SAVE_AS', save: branchedSave })

    const user = userEvent.setup()
    render(<LocalArenaPage />)

    await user.click(await screen.findByRole('button', { name: /Existing world/i }))
    await user.click(await screen.findByRole('button', { name: 'EDIT LOCAL' }))
    const username = await screen.findByLabelText('Username')

    expect(mocks.localSaveConfig).toHaveBeenCalledWith('save-1', 7, 'branch-match', expect.anything())
    expect(username).toBeDisabled()
    expect(screen.getByLabelText(/Birth time/)).toBeDisabled()
    expect(screen.getByLabelText('Spawn mode')).toBeDisabled()

    await user.click(screen.getByRole('button', { name: /Save as branch/i }))
    await waitFor(() => expect(mocks.editLocalSave).toHaveBeenCalledWith(expect.objectContaining({
      save_id: 'save-1',
      match_id: 'branch-match',
      tick: 7,
      mode: 'SAVE_AS',
    })))
  })

  it('blocks a second human player before sending the configuration', async () => {
    const user = userEvent.setup()
    render(<LocalArenaPage />)

    await user.click(await screen.findByRole('button', { name: /Empty save 1/i }))
    await user.click(screen.getByRole('button', { name: /Add the first player/i }))
    await user.click(screen.getByRole('button', { name: /Add player/i }))
    const controllerInputs = screen.getAllByLabelText('Player type')
    await user.selectOptions(controllerInputs[0], 'HUMAN')
    await user.selectOptions(controllerInputs[1], 'HUMAN')

    expect(screen.getByText(/at most one human player/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Create and enter/i })).toBeDisabled()
    expect(mocks.createLocalSave).not.toHaveBeenCalled()
  })

  it('shows numbered teams, defaults players to different teams, and can reuse an existing team', async () => {
    const user = userEvent.setup()
    render(<LocalArenaPage />)

    await user.click(await screen.findByRole('button', { name: /Empty save 1/i }))
    await user.click(screen.getByRole('button', { name: /Add the first player/i }))
    await user.click(screen.getByRole('button', { name: /Add player/i }))
    const teamInputs = screen.getAllByLabelText('Team')
    const joinInputs = screen.getAllByLabelText(/Birth time/)

    expect(teamInputs[0]).toHaveDisplayValue('Team 1')
    expect(teamInputs[1]).toHaveDisplayValue('Team 2')
    expect(joinInputs[0]).toHaveValue(0)
    expect(joinInputs[1]).toHaveValue(1)

    await user.selectOptions(teamInputs[1], '1')
    expect(teamInputs[1]).toHaveDisplayValue('Team 1')
  })

  it('returns a cancelled new-save editor to the catalog after leaving a running save', async () => {
    const secondEmpty = { ...emptySave, slot: 2, save_id: 'save-2', name: 'Empty save 2' }
    mocks.localSaveCatalog.mockResolvedValue({ saves: [occupiedSave, secondEmpty], active_save_id: 'save-1', slot_count: 2 })
    mocks.activateLocalSave.mockResolvedValue({ accepted: true, save: { ...occupiedSave, active: true }, match_id: 'head-match' })
    const user = userEvent.setup()
    render(<LocalArenaPage />)

    await user.click(await screen.findByRole('button', { name: /Existing world/i }))
    await user.click(await screen.findByRole('button', { name: 'EXIT LOCAL' }))
    await user.click(await screen.findByRole('button', { name: /Empty save 2/i }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByRole('heading', { name: 'Local worlds' })).toBeInTheDocument()
    expect(screen.queryByText('LOCAL GAME')).not.toBeInTheDocument()
  })
})
