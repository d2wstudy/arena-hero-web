import { describe, expect, it, vi } from 'vitest'
import type { TeamFogLayer } from '../../lib/teamFog'
import type { WorldObject } from '../../lib/types'
import { canvasPixelRatio, observationChunkViewport, prioritizeSelectionCandidates, terrainChunkBounds, wheelZoomCell } from '../../lib/worldCanvasPerformance'
import { drawTeamFog } from './WorldCanvas'

const fogLayer: TeamFogLayer = {
  key: 'team:1',
  team: 1,
  playerIds: ['player-1'],
  visibility: [[0, 0]],
  exploration: [[0, 0]],
  boundary: [{ from: [-.5, -.5], to: [.5, -.5] }],
}

describe('prioritizeSelectionCandidates', () => {
  it('lets a tutorial target win the first click when units share a cell', () => {
    const core: WorldObject = { kind: 'CORE', id: 'core', controlled: true, position: [0, 0] }
    const worker: WorldObject = { kind: 'UNIT', id: 'worker', controlled: true, position: [0, 0], unit_type: 'WORKER' }

    expect(prioritizeSelectionCandidates([core, worker], worker.id)).toEqual([worker, core])
  })

  it('preserves normal stack order without a preferred target', () => {
    const objects: WorldObject[] = [
      { kind: 'CORE', id: 'core', controlled: true, position: [0, 0] },
      { kind: 'UNIT', id: 'worker', controlled: true, position: [0, 0], unit_type: 'WORKER' },
    ]

    expect(prioritizeSelectionCandidates(objects)).toBe(objects)
  })
})

describe('canvasPixelRatio', () => {
  it('keeps a Retina desktop arena at native density', () => {
    expect(canvasPixelRatio({ width: 1124, height: 738 }, 2)).toBe(2)
  })

  it('caps very dense screens at two device pixels per CSS pixel', () => {
    expect(canvasPixelRatio({ width: 390, height: 844 }, 3)).toBe(2)
  })

  it('only reduces density for unusually large backing stores', () => {
    expect(canvasPixelRatio({ width: 1920, height: 1080 }, 1)).toBe(1)
    expect(canvasPixelRatio({ width: 1920, height: 1080 }, 2)).toBe(2)
    expect(canvasPixelRatio({ width: 3840, height: 2160 }, 2)).toBe(1)
  })
})

describe('wheelZoomCell', () => {
  it('keeps tiny trackpad deltas proportional instead of turning them into full zoom steps', () => {
    expect(wheelZoomCell(44, 1, 0, 720)).toBeCloseTo(43.934, 3)
    expect(44 - wheelZoomCell(44, 1, 0, 720)).toBeLessThan(0.1)
  })

  it('normalizes line and page wheel modes before zooming', () => {
    expect(wheelZoomCell(44, 3, 1, 720)).toBeCloseTo(wheelZoomCell(44, 48, 0, 720), 8)
    expect(wheelZoomCell(44, 1, 2, 720)).toBeCloseTo(wheelZoomCell(44, 160, 0, 720), 8)
  })

  it('clamps zoom to the supported cell range', () => {
    expect(wheelZoomCell(24, 10_000, 0, 720)).toBe(24)
    expect(wheelZoomCell(78, -10_000, 0, 720)).toBe(78)
  })
})

describe('terrainChunkBounds', () => {
  it('covers the viewport with a chunk margin', () => {
    expect(terrainChunkBounds({ x: 0, y: 0, cell: 40 }, { width: 800, height: 600 })).toEqual({
      minX: -2,
      maxX: 1,
      minY: -2,
      maxY: 1,
    })
  })

  it('uses floor division for negative world coordinates', () => {
    expect(terrainChunkBounds({ x: -17, y: -17, cell: 44 }, { width: 1124, height: 738 })).toEqual({
      minX: -4,
      maxX: -1,
      minY: -4,
      maxY: -1,
    })
  })
})

describe('drawTeamFog', () => {
  it('draws and configures the visibility and exploration layers independently', () => {
    const boundaryOnly = canvasContext()
    drawTeamFog(boundaryOnly.context, { width: 200, height: 200 }, { x: 0, y: 0, cell: 20 }, [fogLayer], {
      visibilityEnabled: false,
      visibilityOpacity: .27,
      explorationEnabled: true,
      explorationOpacity: .42,
    })
    expect(boundaryOnly.context.fillRect).not.toHaveBeenCalled()
    expect(boundaryOnly.context.stroke).toHaveBeenCalledOnce()
    expect(boundaryOnly.alphaValues).toEqual([.42])

    const visibilityOnly = canvasContext()
    drawTeamFog(visibilityOnly.context, { width: 200, height: 200 }, { x: 0, y: 0, cell: 20 }, [fogLayer], {
      visibilityEnabled: true,
      visibilityOpacity: .31,
      explorationEnabled: false,
      explorationOpacity: .76,
    })
    expect(visibilityOnly.context.fillRect).toHaveBeenCalledOnce()
    expect(visibilityOnly.context.stroke).not.toHaveBeenCalled()
    expect(visibilityOnly.alphaValues).toEqual([.31])
  })
})

describe('observationChunkViewport', () => {
  it('requests only the visible 32-cell world chunks plus a prefetch margin', () => {
    expect(observationChunkViewport({ x: 0, y: 0, cell: 40 }, { width: 800, height: 600 })).toEqual({
      min_chunk_x: -2,
      max_chunk_x: 1,
      min_chunk_y: -2,
      max_chunk_y: 1,
    })
  })

  it('remains sparse and uses floor division at negative coordinates', () => {
    expect(observationChunkViewport({ x: -65, y: 64, cell: 44 }, { width: 800, height: 600 })).toEqual({
      min_chunk_x: -4,
      max_chunk_x: -1,
      min_chunk_y: 0,
      max_chunk_y: 3,
    })
  })
})

function canvasContext() {
  const alphaValues: number[] = []
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    shadowColor: '',
    shadowBlur: 0,
  } as unknown as CanvasRenderingContext2D
  Object.defineProperty(context, 'globalAlpha', {
    configurable: true,
    get: () => alphaValues.at(-1) ?? 1,
    set: (value: number) => { alphaValues.push(value) },
  })
  return { context, alphaValues }
}
