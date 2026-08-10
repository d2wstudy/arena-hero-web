import { describe, expect, it } from 'vitest'
import type { CaptureReplayFrame, GameEvent, Position, WorldObject } from './types'
import { buildCoreReplayLives, buildReplayExplorationIndex, replayExploredAt } from './captureReplay'

const core = (id: string, position: Position): WorldObject => ({
  kind: 'CORE', id, controlled: true, owner_username: 'commander', position, hp: 5, shield: 5, state: 'NORMAL',
})

const frame = (tick: number, coreId: string, position: Position = [0, 0], terrain: WorldObject[] = [], events: GameEvent[] = []): CaptureReplayFrame => ({
  tick,
  session_id: 'session-1',
  observed_at: `2026-08-10T00:00:${String(tick).padStart(2, '0')}Z`,
  state: {
    status: 'ACTIVE', resources: 5, population: 1,
    champion_beacon: { position: [0, 0] },
    objects: [...terrain, core(coreId, position)],
    events,
  },
  receipts: {},
})

describe('capture replay Core lives', () => {
  it('splits frames by controlled Core UUID and attributes the transition outcome', () => {
    const frames = [
      frame(10, 'core-a'),
      frame(11, 'core-a'),
      frame(12, 'core-b', [20, 20], [], [
        { event_id: 'destroyed', tick: 11, event_type: 'CORE_DESTROYED', reason_code: 'ATTACK', target_id: 'core-a', position: [0, 0], values: { destroyed_by: ['enemy'] } },
        { event_id: 'respawned', tick: 11, event_type: 'CORE_RESPAWNED', target_id: 'core-b', position: [20, 20] },
      ]),
      frame(13, 'core-b', [20, 20]),
    ]

    const lives = buildCoreReplayLives(frames, true)

    expect(lives).toHaveLength(2)
    expect(lives[0]).toMatchObject({ ordinal: 1, coreId: 'core-a', startTick: 10, endTick: 11, frameCount: 2, startBoundary: 'CAPTURE_START', endBoundary: 'DESTROYED' })
    expect(lives[0].destruction).toEqual({ eventTick: 11, observedTick: 12, reason: 'ATTACK', destroyedBy: ['enemy'], position: [0, 0] })
    expect(lives[1]).toMatchObject({ ordinal: 2, coreId: 'core-b', startTick: 12, endTick: 13, frameCount: 2, startBoundary: 'RESPAWNED', endBoundary: 'ONGOING' })
  })

  it('marks an unobserved Core transition across a capture gap without inventing a death', () => {
    const lives = buildCoreReplayLives([frame(10, 'core-a'), frame(14, 'core-b')], false)

    expect(lives[0]).toMatchObject({ endBoundary: 'GAP', destruction: null })
    expect(lives[1]).toMatchObject({ startBoundary: 'AFTER_GAP', endBoundary: 'CAPTURE_END' })
  })
})

describe('capture replay exploration memory', () => {
  it('keeps observed fog terrain and lets later visibility invalidate a stale resource', () => {
    const obstacle: WorldObject = { kind: 'OBSTACLE', positions: [[1, 0]] }
    const resource: WorldObject = { kind: 'RESOURCE', positions: [[0, 1]] }
    const frames = [
      frame(1, 'core-a', [0, 0], [obstacle, resource]),
      frame(2, 'core-b', [20, 20]),
      frame(3, 'core-b', [0, 0], [obstacle]),
    ]
    const timeline = buildReplayExplorationIndex(frames, 2)

    const fogged = replayExploredAt(timeline, 1)
    expect(fogged.get('1,0')?.kind).toBe('OBSTACLE')
    expect(fogged.get('0,1')?.kind).toBe('RESOURCE')
    expect(fogged.get('-1,0')?.kind).toBe('EMPTY')

    const revisited = replayExploredAt(timeline, 2)
    expect(revisited.get('1,0')?.kind).toBe('OBSTACLE')
    expect(revisited.get('0,1')?.kind).toBe('EMPTY')
  })
})
