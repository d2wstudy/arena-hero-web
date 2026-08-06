import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import '../../lib/i18n'
import type { LocalHistory, LocalMatchStatus, LocalReplay } from '../../lib/types'
import { LocalStepControl } from './LocalStepControl'

const status = (ready: boolean, error?: string): LocalMatchStatus => ({
  mode: 'step',
  tick: 7,
  phase: 'OPEN',
  human: 'commander',
  match_id: 'root-match',
  root_match_id: 'root-match',
  bots: [{ username: 'bot', ready, ...(error ? { error } : {}) }],
  god: { human_full_vision: false },
})

const history: LocalHistory = {
  active_match_id: 'root-match',
  selected_match_id: 'root-match',
  matches: [{
    id: 'root-match',
    label: 'demo',
    created_at: '2026-08-06T00:00:00Z',
    updated_at: '2026-08-06T00:00:00Z',
    root_match_id: 'root-match',
    parent_match_id: null,
    parent_tick: null,
    first_tick: 1,
    latest_tick: 7,
    active: true,
  }],
}

const baseProps = {
  tick: 7,
  liveTick: 7,
  phase: 'open' as const,
  status: status(false),
  history,
  replay: null,
  godView: false,
  godSnapshot: null,
  onAdvance: vi.fn().mockResolvedValue(undefined),
  onReplay: vi.fn().mockResolvedValue(undefined),
  onReturnLive: vi.fn(),
  onBranch: vi.fn().mockResolvedValue(undefined),
  onGodView: vi.fn().mockResolvedValue(undefined),
  onHumanFullVision: vi.fn().mockResolvedValue(undefined),
}

describe('LocalStepControl', () => {
  it('advances only after every bot is ready', async () => {
    const advance = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(<LocalStepControl {...baseProps} onAdvance={advance} />)

    const button = screen.getByRole('button', { name: 'Resolve Tick 7' })
    expect(button).toBeDisabled()
    rerender(<LocalStepControl {...baseProps} status={status(true)} onAdvance={advance} />)
    await userEvent.click(button)
    expect(advance).toHaveBeenCalledOnce()
  })

  it('shows a bot failure and keeps resolution disabled', () => {
    render(<LocalStepControl {...baseProps} status={status(false, 'RuntimeError: failed')} />)
    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resolve Tick 7' })).toBeDisabled()
  })

  it('steps through stored history and branches from a replay Tick', async () => {
    const replay: LocalReplay = {
      match_id: 'root-match',
      tick: 4,
      live: false,
      state: {
        status: 'ACTIVE', resources: 0, population: 0, population_tier: 0, upkeep_next_tick: 0,
        champion_beacon: { position: [0, 0] }, objects: [], events: [],
      },
      receipts: {},
      explored: [],
      god: { human_full_vision: false },
    }
    const showReplay = vi.fn().mockResolvedValue(undefined)
    const branch = vi.fn().mockResolvedValue(undefined)
    const returnLive = vi.fn()
    render(<LocalStepControl
      {...baseProps}
      tick={4}
      phase="replay"
      replay={replay}
      onReplay={showReplay}
      onBranch={branch}
      onReturnLive={returnLive}
    />)

    await userEvent.click(screen.getByRole('button', { name: 'Next Tick' }))
    expect(showReplay).toHaveBeenCalledWith('root-match', 5)
    await userEvent.click(screen.getByRole('button', { name: 'Branch from Tick 4' }))
    expect(branch).toHaveBeenCalledOnce()
    await userEvent.click(screen.getByRole('button', { name: 'Return to live Tick 7' }))
    expect(returnLive).toHaveBeenCalledOnce()
  })

  it('opens the god console and keeps historical operations read-only', async () => {
    const setGodView = vi.fn().mockResolvedValue(undefined)
    const setHumanFullVision = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(<LocalStepControl {...baseProps} status={status(true)} onGodView={setGodView} onHumanFullVision={setHumanFullVision} />)

    await userEvent.click(screen.getByRole('button', { name: 'God mode' }))
    await userEvent.click(screen.getByRole('switch', { name: 'Global observation' }))
    expect(setGodView).toHaveBeenCalledWith(true)
    await userEvent.click(screen.getByRole('switch', { name: 'Human full vision' }))
    expect(setHumanFullVision).toHaveBeenCalledWith(true)

    rerender(<LocalStepControl {...baseProps} status={status(true)} replay={{
      match_id: 'root-match', tick: 4, live: false,
      state: { status: 'ACTIVE', resources: 0, population: 0, population_tier: 0, upkeep_next_tick: 0, champion_beacon: { position: [0, 0] }, objects: [], events: [] },
      receipts: {}, explored: [], god: { human_full_vision: true },
    }} onGodView={setGodView} onHumanFullVision={setHumanFullVision} />)
    expect(screen.getByRole('switch', { name: 'Human full vision' })).toBeDisabled()
  })
})
