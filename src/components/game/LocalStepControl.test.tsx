import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  localView: { mode: 'HUMAN' as const },
  observationPending: false,
  godSnapshot: null,
  onAdvance: vi.fn().mockResolvedValue(undefined),
  onReplay: vi.fn().mockResolvedValue(undefined),
  onReturnLive: vi.fn(),
  onBranch: vi.fn().mockResolvedValue(undefined),
  onObservation: vi.fn().mockResolvedValue(undefined),
  onLoadGodDiagnostics: vi.fn().mockResolvedValue(undefined),
  onHumanFullVision: vi.fn().mockResolvedValue(undefined),
  onAddParticipant: vi.fn().mockResolvedValue(undefined),
  onSetTickLabel: vi.fn().mockResolvedValue(undefined),
}

function openPanel(tab?: 'Advance' | 'View' | 'History' | 'Lab') {
  fireEvent.click(screen.getByRole('button', { name: 'Open control panel' }))
  if (!tab) return
  const navigation = screen.getByRole('navigation', { name: 'Control panel sections' })
  fireEvent.click(within(navigation).getByRole('button', { name: tab }))
}

describe('LocalStepControl', () => {
  afterEach(() => vi.useRealTimers())

  it('keeps the map clear by default and exposes a collapsible drawer', () => {
    render(<LocalStepControl {...baseProps} />)
    expect(screen.getByRole('spinbutton', { name: 'Tick interval (seconds)' })).toHaveValue(1)
    const autoTick = screen.getByRole('button', { name: 'Start Auto Tick' })
    expect(autoTick.querySelector('.lucide-repeat-2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resolve Tick 7' }).querySelector('.lucide-play')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Control panel sections' })).not.toBeInTheDocument()
    openPanel()
    expect(screen.getByRole('navigation', { name: 'Control panel sections' })).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Close control panel' })[0])
    expect(screen.queryByRole('navigation', { name: 'Control panel sections' })).not.toBeInTheDocument()
  })

  it('advances only after every bot is ready', async () => {
    const advance = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(<LocalStepControl {...baseProps} onAdvance={advance} />)
    const button = screen.getByRole('button', { name: 'Resolve Tick 7' })
    expect(button).toBeDisabled()
    rerender(<LocalStepControl {...baseProps} status={status(true)} onAdvance={advance} />)
    await userEvent.click(button)
    expect(advance).toHaveBeenCalledOnce()
  })

  it('shows bot failures inside the Advance drawer and keeps resolution disabled', () => {
    render(<LocalStepControl {...baseProps} status={status(false, 'RuntimeError: failed')} />)
    openPanel('Advance')
    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resolve Tick 7' })).toBeDisabled()
  })

  it('requires an integer batch size and advances once per newly ready Tick', async () => {
    vi.useFakeTimers()
    const advance = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(<LocalStepControl {...baseProps} status={status(true)} onAdvance={advance} />)
    openPanel('Advance')

    const input = screen.getByRole('spinbutton', { name: 'Consecutive Ticks (integer)' })
    fireEvent.change(input, { target: { value: '2.5' } })
    expect(input).toHaveAttribute('aria-invalid', 'true')
    fireEvent.change(input, { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Advance 3 Ticks' }))
    await act(async () => { await vi.runOnlyPendingTimersAsync() })
    expect(advance).toHaveBeenCalledTimes(1)

    rerender(<LocalStepControl {...baseProps} tick={8} liveTick={8} status={status(true, undefined, 8)} history={historyAt(8)} onAdvance={advance} />)
    await act(async () => { await vi.runOnlyPendingTimersAsync() })
    expect(advance).toHaveBeenCalledTimes(2)
    rerender(<LocalStepControl {...baseProps} tick={9} liveTick={9} status={status(true, undefined, 9)} history={historyAt(9)} onAdvance={advance} />)
    await act(async () => { await vi.runOnlyPendingTimersAsync() })
    expect(advance).toHaveBeenCalledTimes(3)
  })

  it('uses a one-second Auto Tick interval and never overlaps requests', async () => {
    vi.useFakeTimers()
    let releaseFirst: (() => void) | undefined
    const firstRequest = new Promise<void>((resolve) => { releaseFirst = resolve })
    const advance = vi.fn().mockImplementationOnce(() => firstRequest).mockResolvedValue(undefined)
    const { rerender } = render(<LocalStepControl {...baseProps} status={status(true)} onAdvance={advance} />)

    fireEvent.click(screen.getByRole('button', { name: 'Start Auto Tick' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(999) })
    expect(advance).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(advance).toHaveBeenCalledOnce()

    rerender(<LocalStepControl {...baseProps} tick={8} liveTick={8} status={status(true, undefined, 8)} history={historyAt(8)} onAdvance={advance} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })
    expect(advance).toHaveBeenCalledOnce()
    await act(async () => { releaseFirst?.(); await firstRequest })
    await act(async () => { await Promise.resolve() })
    await act(async () => { await vi.runOnlyPendingTimersAsync() })
    expect(advance).toHaveBeenCalledTimes(2)
  })

  it('switches to robot and global read-only perspectives', async () => {
    const observe = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(<LocalStepControl {...baseProps} status={status(true)} onObservation={observe} />)
    openPanel('View')

    await userEvent.click(screen.getByRole('radio', { name: /@bot/ }))
    expect(observe).toHaveBeenCalledWith({ mode: 'PLAYER', playerId: 'bot-1' })
    await userEvent.click(screen.getByRole('radio', { name: /Global view/ }))
    expect(observe).toHaveBeenCalledWith({ mode: 'GLOBAL' })

    rerender(<LocalStepControl {...baseProps} status={status(true)} localView={{ mode: 'PLAYER', playerId: 'bot-1' }} observationPending />)
    expect(screen.getAllByRole('button', { name: 'View' })[0]).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByText(/previous frame stays visible/i)).not.toBeInTheDocument()
    expect(screen.getByText(/strictly read-only/i)).toBeInTheDocument()
  })

  it('does not offer an invalid human view in a bot-only save', () => {
    render(<LocalStepControl {...baseProps} status={status(true)} localView={{ mode: 'PLAYER', playerId: 'bot-1' }} observerOnly />)
    openPanel('View')

    expect(screen.queryByRole('radio', { name: /commander/i })).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /@bot/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Global view/ })).toBeInTheDocument()
  })

  it('steps through stored history, labels a Tick, and branches from replay', async () => {
    const replay: LocalReplay = {
      match_id: 'root-match', tick: 4, live: false,
      state: { status: 'ACTIVE', resources: 0, population: 0, champion_beacon: { position: [0, 0] }, objects: [], events: [] },
      receipts: {}, explored: [], god: { human_full_vision: false },
    }
    const showReplay = vi.fn().mockResolvedValue(undefined)
    const branch = vi.fn().mockResolvedValue(undefined)
    const returnLive = vi.fn()
    const saveLabel = vi.fn().mockResolvedValue(undefined)
    render(<LocalStepControl {...baseProps} tick={4} phase="replay" replay={replay} onReplay={showReplay} onBranch={branch} onReturnLive={returnLive} onSetTickLabel={saveLabel} />)
    openPanel('History')

    await userEvent.click(screen.getByRole('button', { name: 'Next Tick' }))
    expect(showReplay).toHaveBeenCalledWith('root-match', 5)
    await userEvent.click(screen.getByRole('button', { name: 'Edit from Tick 4' }))
    expect(branch).toHaveBeenCalledOnce()
    await userEvent.clear(screen.getByRole('textbox', { name: 'Tick label' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Tick label' }), 'Before battle')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(saveLabel).toHaveBeenCalledWith('root-match', 4, 'Before battle')
    await userEvent.click(screen.getAllByRole('button', { name: 'Live' })[0])
    expect(returnLive).toHaveBeenCalledOnce()
  })

  it('loads a scrubbed Tick only after the timeline interaction is committed', async () => {
    const replay: LocalReplay = {
      match_id: 'root-match', tick: 4, live: false,
      state: { status: 'ACTIVE', resources: 0, population: 0, champion_beacon: { position: [0, 0] }, objects: [], events: [] },
      receipts: {}, explored: [], god: { human_full_vision: false },
    }
    const showReplay = vi.fn().mockResolvedValue(undefined)
    render(<LocalStepControl {...baseProps} tick={4} phase="replay" replay={replay} onReplay={showReplay} />)
    openPanel('History')

    const timeline = screen.getByRole('slider', { name: 'History timeline' })
    fireEvent.change(timeline, { target: { value: '6' } })
    expect(timeline).toHaveValue('6')
    expect(showReplay).not.toHaveBeenCalled()

    fireEvent.pointerUp(timeline)
    await waitFor(() => expect(showReplay).toHaveBeenCalledWith('root-match', 6))
    fireEvent.blur(timeline)
    expect(showReplay).toHaveBeenCalledOnce()
  })

  it('loads heavyweight diagnostics only from the Lab and keeps replay operations disabled', async () => {
    const diagnostics = vi.fn().mockResolvedValue(undefined)
    const fullVision = vi.fn().mockResolvedValue(undefined)
    const addParticipant = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(<LocalStepControl {...baseProps} status={status(true)} onLoadGodDiagnostics={diagnostics} onHumanFullVision={fullVision} onAddParticipant={addParticipant} />)
    openPanel('Lab')

    await userEvent.click(screen.getByRole('button', { name: 'Load diagnostics' }))
    expect(diagnostics).toHaveBeenCalledOnce()
    await userEvent.click(screen.getByRole('switch', { name: 'Human full vision' }))
    expect(fullVision).toHaveBeenCalledWith(true)
    await userEvent.type(screen.getByRole('textbox', { name: 'Participant username' }), 'late_agent')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Participant controller' }), 'AGENT')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(addParticipant).toHaveBeenCalledWith('late_agent', 'AGENT')

    rerender(<LocalStepControl {...baseProps} status={status(true)} replay={{
      match_id: 'root-match', tick: 4, live: false,
      state: { status: 'ACTIVE', resources: 0, population: 0, champion_beacon: { position: [0, 0] }, objects: [], events: [] },
      receipts: {}, explored: [], god: { human_full_vision: true },
    }} onLoadGodDiagnostics={diagnostics} onHumanFullVision={fullVision} onAddParticipant={addParticipant} />)
    expect(screen.getByRole('switch', { name: 'Human full vision' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
  })

  it('keeps an invalid scheduled spawn paused and opens the world editor to fix it', async () => {
    const editWorld = vi.fn()
    render(<LocalStepControl
      {...baseProps}
      status={{
        ...status(true),
        configuration_error: {
          code: 'SPAWN_PLAN_INVALIDATED',
          message: 'late_bot 的预定出生位置已不再合法',
        },
      }}
      onEditWorld={editWorld}
    />)

    expect(screen.getByRole('button', { name: 'Resolve Tick 7' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('late_bot 的预定出生位置已不再合法')
    await userEvent.click(screen.getByRole('button', { name: 'Edit player configuration' }))
    expect(editWorld).toHaveBeenCalledWith(7, 'root-match')
  })

  it('routes save-world player management through the paused editor', () => {
    render(<LocalStepControl {...baseProps} status={status(true)} onEditWorld={vi.fn()} />)
    openPanel('Lab')

    expect(screen.getByText('Manage save players')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Participant username' })).not.toBeInTheDocument()
    expect(screen.getByText(/use Edit paused world/i)).toBeInTheDocument()
  })
})
