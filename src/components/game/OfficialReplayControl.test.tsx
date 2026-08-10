import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CoreReplayLife } from '../../lib/captureReplay'
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

const lives: CoreReplayLife[] = [{
  ordinal: 1,
  coreId: 'core-1',
  startIndex: 0,
  endIndex: 2,
  startTick: 10,
  endTick: 13,
  frameCount: 3,
  startBoundary: 'CAPTURE_START',
  endBoundary: 'DESTROYED',
  destruction: { eventTick: 12, observedTick: 13, reason: 'ATTACK', destroyedBy: ['enemy'], position: [0, 0] },
}, {
  ordinal: 2,
  coreId: 'core-2',
  startIndex: 3,
  endIndex: 4,
  startTick: 14,
  endTick: 15,
  frameCount: 2,
  startBoundary: 'RESPAWNED',
  endBoundary: 'ONGOING',
  destruction: null,
}]

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

describe('OfficialReplayControl', () => {
  it('shows a stale open capture as waiting and exposes replay navigation', async () => {
    const user = userEvent.setup()
    const onTogglePlay = vi.fn()
    const onLifeChange = vi.fn()
    const onIndexChange = vi.fn()
    const onIntervalChange = vi.fn()
    const onJump = vi.fn()
    render(<OfficialReplayControl
      manifest={manifest}
      frame={frame}
      lives={lives}
      life={lives[0]}
      index={1}
      frameCount={3}
      playing={false}
      intervalMs={250}
      jumps={[{ label: 'Core destroyed', index: 2 }]}
      previousTick={9}
      onTogglePlay={onTogglePlay}
      onLifeChange={onLifeChange}
      onIndexChange={onIndexChange}
      onIntervalChange={onIntervalChange}
      onJump={onJump}
    />)

    expect(screen.getByText('WAITING FOR NEW TURNS')).toBeInTheDocument()
    expect(screen.getByText(/1 Tick\(s\) not captured/)).toBeInTheDocument()
    expect(screen.getByText('LIFE 1 / 2')).toBeInTheDocument()
    expect(screen.getByText(/Destroyed on resolved Tick 12 by enemy/)).toBeInTheDocument()
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
    expect(screen.getByText('TICK 10 — 13')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Fast · 4 Ticks / second' })).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Core life' }), '1')
    await user.click(screen.getByRole('button', { name: 'Play replay' }))
    await user.click(screen.getByRole('button', { name: 'Previous Tick' }))
    await user.click(screen.getByRole('button', { name: 'Next Tick' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Replay speed' }), '1000')
    await user.click(screen.getByRole('button', { name: 'Core destroyed' }))

    expect(onLifeChange).toHaveBeenCalledWith(1)
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
      lives={lives}
      life={lives[1]}
      index={1}
      frameCount={2}
      playing
      intervalMs={250}
      jumps={[]}
      previousTick={10}
      onTogglePlay={vi.fn()}
      onLifeChange={vi.fn()}
      onIndexChange={vi.fn()}
      onIntervalChange={vi.fn()}
      onJump={vi.fn()}
    />)

    expect(screen.getByText('RECORDING')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pause replay' })).toBeInTheDocument()
  })
})
