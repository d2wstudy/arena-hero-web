import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../lib/i18n'
import type { CaptureReplayFrame, CaptureReplayManifest } from '../../lib/types'
import { OfficialReplayControl } from './OfficialReplayControl'

const manifest: CaptureReplayManifest = {
  schema_version: 1,
  capture: 'champion-v3.sqlite3',
  open_session: true,
  live: false,
  sessions: [],
  frame_count: 3,
  ticks: [10, 11, 13],
  first_tick: 10,
  latest_tick: 13,
  gaps: [{ from_tick: 12, to_tick: 12, count: 1 }],
  latest_observed_at: '2026-08-10T00:00:11Z',
}

const frame: CaptureReplayFrame = {
  tick: 11,
  session_id: 'session-1',
  observed_at: '2026-08-10T00:00:11Z',
  state: {
    status: 'ACTIVE',
    resources: 4,
    population: 1,
    champion_beacon: { position: [0, 0] },
    objects: [],
    events: [{ event_id: 'event-1', tick: 10, event_type: 'CORE_DESTROYED' }],
  },
  receipts: {},
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

describe('OfficialReplayControl', () => {
  it('shows a stale open capture as waiting and exposes replay navigation', async () => {
    const user = userEvent.setup()
    const onTogglePlay = vi.fn()
    const onIndexChange = vi.fn()
    const onIntervalChange = vi.fn()
    const onJump = vi.fn()
    render(<OfficialReplayControl
      manifest={manifest}
      frame={frame}
      index={1}
      frameCount={3}
      playing={false}
      intervalMs={250}
      jumps={[{ label: 'Core destroyed', index: 2 }]}
      previousTick={9}
      onTogglePlay={onTogglePlay}
      onIndexChange={onIndexChange}
      onIntervalChange={onIntervalChange}
      onJump={onJump}
    />)

    expect(screen.getByText('WAITING FOR NEW TURNS')).toBeInTheDocument()
    expect(screen.getByText(/1 Tick\(s\) not captured/)).toBeInTheDocument()
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
    expect(screen.getByText('TICK 10 — 13')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Fast · 4 Ticks / second' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Play replay' }))
    await user.click(screen.getByRole('button', { name: 'Previous Tick' }))
    await user.click(screen.getByRole('button', { name: 'Next Tick' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Replay speed' }), '1000')
    await user.click(screen.getByRole('button', { name: 'Core destroyed' }))

    expect(onTogglePlay).toHaveBeenCalledOnce()
    expect(onIndexChange).toHaveBeenNthCalledWith(1, 0)
    expect(onIndexChange).toHaveBeenNthCalledWith(2, 2)
    expect(onIntervalChange).toHaveBeenCalledWith(1000)
    expect(onJump).toHaveBeenCalledWith(2)
  })

  it('shows recording and pause states while a capture is actively growing', () => {
    render(<OfficialReplayControl
      manifest={{ ...manifest, live: true }}
      frame={frame}
      index={1}
      frameCount={3}
      playing
      intervalMs={250}
      jumps={[]}
      previousTick={10}
      onTogglePlay={vi.fn()}
      onIndexChange={vi.fn()}
      onIntervalChange={vi.fn()}
      onJump={vi.fn()}
    />)

    expect(screen.getByText('RECORDING')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pause replay' })).toBeInTheDocument()
  })
})
