import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../lib/i18n'
import type { LocalHistory, LocalMatchStatus, LocalReplay } from '../../lib/types'
import { LocalStepControl } from './LocalStepControl'

const status = (ready: boolean, error?: string, tick = 7, matchId = 'root-match'): LocalMatchStatus => ({
  mode: 'step',
  tick,
  phase: 'OPEN',
  human: 'commander',
  match_id: matchId,
  root_match_id: matchId,
  bots: [{ username: 'bot', ready, ...(error ? { error } : {}) }],
  god: { human_full_vision: false },
  participants: [
    { id: 'human-1', username: 'commander', controller: 'HUMAN', status: 'ACTIVE' },
    { id: 'bot-1', username: 'bot', controller: 'BOT', status: 'ACTIVE' },
  ],
})

const historyAt = (tick = 7, matchId = 'root-match'): LocalHistory => ({
  active_match_id: matchId,
  selected_match_id: matchId,
  matches: [{
    id: matchId,
    label: 'demo',
    created_at: '2026-08-06T00:00:00Z',
    updated_at: '2026-08-06T00:00:00Z',
    root_match_id: matchId,
    parent_match_id: null,
    parent_tick: null,
    first_tick: 1,
    latest_tick: tick,
    active: true,
  }],
  labels: [{ match_id: matchId, tick: 4, label: 'First contact', updated_at: '2026-08-06T00:00:00Z' }],
})

const history = historyAt()

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
  onAddParticipant: vi.fn().mockResolvedValue(undefined),
  onSetTickLabel: vi.fn().mockResolvedValue(undefined),
}

describe('LocalStepControl', () => {
  afterEach(() => vi.useRealTimers())

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

  it('requires the consecutive Tick count to be an integer', () => {
    render(<LocalStepControl {...baseProps} status={status(true)} />)

    const input = screen.getByRole('spinbutton', { name: 'Consecutive Ticks (integer)' })
    const button = screen.getByRole('button', { name: 'Advance 10 Ticks' })
    expect(input).toHaveAttribute('aria-invalid', 'false')
    expect(button).toBeEnabled()

    fireEvent.change(input, { target: { value: '2.5' } })
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('button', { name: 'Advance Ticks' })).toBeDisabled()
  })

  it('advances a batch once per newly ready Tick', async () => {
    vi.useFakeTimers()
    const advance = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(<LocalStepControl {...baseProps} status={status(true)} onAdvance={advance} />)

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Consecutive Ticks (integer)' }), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Advance 3 Ticks' }))
    await act(async () => { await vi.runOnlyPendingTimersAsync() })
    expect(advance).toHaveBeenCalledTimes(1)

    await act(async () => { await vi.runOnlyPendingTimersAsync() })
    expect(advance).toHaveBeenCalledTimes(1)

    rerender(<LocalStepControl {...baseProps} tick={8} liveTick={8} status={status(true, undefined, 8)} history={historyAt(8)} onAdvance={advance} />)
    await act(async () => { await vi.runOnlyPendingTimersAsync() })
    expect(advance).toHaveBeenCalledTimes(2)

    rerender(<LocalStepControl {...baseProps} tick={9} liveTick={9} status={status(true, undefined, 9)} history={historyAt(9)} onAdvance={advance} />)
    await act(async () => { await vi.runOnlyPendingTimersAsync() })
    expect(advance).toHaveBeenCalledTimes(3)
    expect(screen.getByRole('button', { name: 'Advance 3 Ticks' })).toBeEnabled()
  })

  it('uses a one-second Auto Tick interval by default', async () => {
    vi.useFakeTimers()
    const advance = vi.fn().mockResolvedValue(undefined)
    render(<LocalStepControl {...baseProps} status={status(true)} onAdvance={advance} />)

    fireEvent.click(screen.getByRole('button', { name: 'Start Auto Tick' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(999) })
    expect(advance).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(advance).toHaveBeenCalledOnce()
  })

  it('waits only for readiness when Tick settlement exceeds the Auto Tick interval', async () => {
    vi.useFakeTimers()
    const advance = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(<LocalStepControl {...baseProps} status={status(true)} onAdvance={advance} />)

    fireEvent.click(screen.getByRole('button', { name: 'Start Auto Tick' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000) })
    expect(advance).toHaveBeenCalledTimes(1)

    await act(async () => { await vi.advanceTimersByTimeAsync(1_500) })
    rerender(<LocalStepControl {...baseProps} tick={8} liveTick={8} status={status(true, undefined, 8)} history={historyAt(8)} onAdvance={advance} />)
    await act(async () => { await vi.runOnlyPendingTimersAsync() })
    expect(advance).toHaveBeenCalledTimes(2)
  })

  it('waits for the remaining interval when the next Tick is ready early', async () => {
    vi.useFakeTimers()
    const advance = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(<LocalStepControl {...baseProps} status={status(true)} onAdvance={advance} />)

    fireEvent.click(screen.getByRole('button', { name: 'Start Auto Tick' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000) })
    expect(advance).toHaveBeenCalledTimes(1)

    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    rerender(<LocalStepControl {...baseProps} tick={8} liveTick={8} status={status(true, undefined, 8)} history={historyAt(8)} onAdvance={advance} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(799) })
    expect(advance).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(advance).toHaveBeenCalledTimes(2)
  })

  it('never starts another Auto Tick while the current request is in flight', async () => {
    vi.useFakeTimers()
    let releaseFirst: (() => void) | undefined
    const firstRequest = new Promise<void>((resolve) => { releaseFirst = resolve })
    const advance = vi.fn()
      .mockImplementationOnce(() => firstRequest)
      .mockResolvedValue(undefined)
    const { rerender } = render(<LocalStepControl {...baseProps} status={status(true)} onAdvance={advance} />)

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Tick interval (seconds)' }), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start Auto Tick' }))
    await act(async () => { await vi.runOnlyPendingTimersAsync() })
    expect(advance).toHaveBeenCalledTimes(1)

    rerender(<LocalStepControl {...baseProps} tick={8} liveTick={8} status={status(true, undefined, 8)} history={historyAt(8)} onAdvance={advance} />)
    await act(async () => { await vi.runOnlyPendingTimersAsync() })
    expect(advance).toHaveBeenCalledTimes(1)

    await act(async () => {
      releaseFirst?.()
      await firstRequest
    })
    await act(async () => { await vi.runOnlyPendingTimersAsync() })
    expect(advance).toHaveBeenCalledTimes(2)
  })

  it('stops Auto Tick without advancing a later ready Tick', async () => {
    vi.useFakeTimers()
    const advance = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(<LocalStepControl {...baseProps} status={status(true)} onAdvance={advance} />)

    fireEvent.click(screen.getByRole('button', { name: 'Start Auto Tick' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000) })
    expect(advance).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Stop Auto Tick' }))

    rerender(<LocalStepControl {...baseProps} tick={8} liveTick={8} status={status(true, undefined, 8)} history={historyAt(8)} onAdvance={advance} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
    expect(advance).toHaveBeenCalledOnce()
  })

  it('steps through stored history and branches from a replay Tick', async () => {
    const replay: LocalReplay = {
      match_id: 'root-match',
      tick: 4,
      live: false,
      state: {
        status: 'ACTIVE', resources: 0, population: 0,
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

  it('saves labels and jumps directly to a labeled Tick', async () => {
    const saveLabel = vi.fn().mockResolvedValue(undefined)
    const showReplay = vi.fn().mockResolvedValue(undefined)
    render(<LocalStepControl {...baseProps} status={status(true)} onSetTickLabel={saveLabel} onReplay={showReplay} />)

    await userEvent.type(screen.getByRole('textbox', { name: 'Tick label' }), 'Before battle')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(saveLabel).toHaveBeenCalledWith('root-match', 7, 'Before battle')

    await userEvent.click(screen.getByRole('button', { name: 'T4 · First contact' }))
    expect(showReplay).toHaveBeenCalledWith('root-match', 4)
  })

  it('queues a new external Agent from the god console', async () => {
    const addParticipant = vi.fn().mockResolvedValue(undefined)
    render(<LocalStepControl {...baseProps} status={status(true)} onAddParticipant={addParticipant} />)

    await userEvent.click(screen.getByRole('button', { name: 'God mode' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Participant username' }), 'late_agent')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Participant controller' }), 'AGENT')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(addParticipant).toHaveBeenCalledWith('late_agent', 'AGENT')
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
      state: { status: 'ACTIVE', resources: 0, population: 0, champion_beacon: { position: [0, 0] }, objects: [], events: [] },
      receipts: {}, explored: [], god: { human_full_vision: true },
    }} onGodView={setGodView} onHumanFullVision={setHumanFullVision} />)
    expect(screen.getByRole('switch', { name: 'Human full vision' })).toBeDisabled()
  })
})
