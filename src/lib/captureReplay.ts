import { observedCells, type ExploredCell } from './exploration'
import type { CaptureReplayFrame, GameEvent, Position } from './types'
import { positionKey } from './visibility'

export type CoreLifeStartBoundary = 'CAPTURE_START' | 'RESPAWNED' | 'AFTER_GAP' | 'OBSERVED'
export type CoreLifeEndBoundary = 'DESTROYED' | 'GAP' | 'CORE_CHANGED' | 'ONGOING' | 'CAPTURE_END'

export interface CoreLifeDestruction {
  eventTick: number
  observedTick: number
  reason: string | null
  destroyedBy: string[]
  position: Position | null
}

export interface CoreReplayLife {
  ordinal: number
  coreId: string
  startIndex: number
  endIndex: number
  startTick: number
  endTick: number
  frameCount: number
  startBoundary: CoreLifeStartBoundary
  endBoundary: CoreLifeEndBoundary
  destruction: CoreLifeDestruction | null
}

export interface ReplayExplorationIndex {
  interval: number
  updates: ExploredCell[][]
  checkpoints: Map<number, Map<string, ExploredCell>>
}

export function controlledCoreId(frame: CaptureReplayFrame): string | null {
  const core = frame.state.objects.find((object) => object.kind === 'CORE' && object.controlled)
  return core?.id ?? null
}

export function buildCoreReplayLives(frames: CaptureReplayFrame[], captureOpen: boolean): CoreReplayLife[] {
  const ranges: Array<Pick<CoreReplayLife, 'coreId' | 'startIndex' | 'endIndex' | 'startTick' | 'endTick'>> = []
  for (const [index, frame] of frames.entries()) {
    const coreId = controlledCoreId(frame)
    if (!coreId) continue
    const current = ranges.at(-1)
    if (current?.coreId === coreId) {
      current.endIndex = index
      current.endTick = frame.tick
    } else {
      ranges.push({ coreId, startIndex: index, endIndex: index, startTick: frame.tick, endTick: frame.tick })
    }
  }

  return ranges.map((range, index) => {
    const firstFrame = frames[range.startIndex]
    const previousFrame = frames[range.startIndex - 1]
    const nextFrame = frames[range.endIndex + 1]
    const respawn = firstFrame.state.events.find((event) => event.event_type === 'CORE_RESPAWNED' && event.target_id === range.coreId)
    const destructionEvent = nextFrame?.state.events.find((event) => event.event_type === 'CORE_DESTROYED' && event.target_id === range.coreId)
    const destruction = destructionEvent && nextFrame ? coreDestruction(destructionEvent, nextFrame.tick) : null
    const startBoundary: CoreLifeStartBoundary = respawn
      ? 'RESPAWNED'
      : range.startIndex === 0
        ? 'CAPTURE_START'
        : previousFrame && firstFrame.tick > previousFrame.tick + 1
          ? 'AFTER_GAP'
          : 'OBSERVED'
    let endBoundary: CoreLifeEndBoundary
    if (destruction) endBoundary = 'DESTROYED'
    else if (nextFrame && nextFrame.tick > range.endTick + 1) endBoundary = 'GAP'
    else if (nextFrame) endBoundary = 'CORE_CHANGED'
    else endBoundary = captureOpen ? 'ONGOING' : 'CAPTURE_END'

    return {
      ordinal: index + 1,
      ...range,
      frameCount: range.endIndex - range.startIndex + 1,
      startBoundary,
      endBoundary,
      destruction,
    }
  })
}

export function buildReplayExplorationIndex(frames: CaptureReplayFrame[], interval = 64): ReplayExplorationIndex {
  if (!Number.isInteger(interval) || interval < 1) throw new RangeError('replay exploration interval must be positive')
  const updates = frames.map((frame) => [...observedCells(frame.state).values()])
  const checkpoints = new Map<number, Map<string, ExploredCell>>()
  const explored = new Map<string, ExploredCell>()
  for (const [index, cells] of updates.entries()) {
    applyExplorationCells(explored, cells)
    if ((index + 1) % interval === 0) checkpoints.set(index, new Map(explored))
  }
  return { interval, updates, checkpoints }
}

export function replayExploredAt(timeline: ReplayExplorationIndex, index: number): Map<string, ExploredCell> {
  if (!timeline.updates.length || index < 0) return new Map()
  const boundedIndex = Math.min(index, timeline.updates.length - 1)
  const completeBlocks = Math.floor((boundedIndex + 1) / timeline.interval)
  const checkpointIndex = completeBlocks * timeline.interval - 1
  const checkpoint = checkpointIndex >= 0 ? timeline.checkpoints.get(checkpointIndex) : undefined
  const explored = checkpoint ? new Map(checkpoint) : new Map<string, ExploredCell>()
  for (let current = checkpointIndex + 1; current <= boundedIndex; current++) {
    applyExplorationCells(explored, timeline.updates[current])
  }
  return explored
}

function coreDestruction(event: GameEvent, observedTick: number): CoreLifeDestruction {
  const rawDestroyers = event.values?.destroyed_by
  return {
    eventTick: event.tick,
    observedTick,
    reason: event.reason_code ?? null,
    destroyedBy: Array.isArray(rawDestroyers) ? rawDestroyers.filter((value): value is string => typeof value === 'string') : [],
    position: event.position ?? null,
  }
}

function applyExplorationCells(explored: Map<string, ExploredCell>, cells: ExploredCell[]) {
  for (const cell of cells) explored.set(positionKey(cell.position), cell)
}
