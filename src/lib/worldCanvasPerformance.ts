import type { WorldObject } from './types'
import type { LocalChunkViewport } from './types'

const MAX_CANVAS_PIXEL_RATIO = 2
const MAX_CANVAS_BACKING_PIXELS = 9_000_000
const CANVAS_PIXEL_RATIO_STEP = 0.25
const WHEEL_LINE_PIXELS = 16
const MAX_WHEEL_PIXELS_PER_EVENT = 160
const WHEEL_ZOOM_SENSITIVITY = 0.0015

export const MIN_WORLD_CELL_SIZE = 12
export const MAX_WORLD_CELL_SIZE = 78
export const WORLD_OVERVIEW_CELL_SIZE = 20

export const TERRAIN_CHUNK_CELLS = 8
export const OVERVIEW_TERRAIN_CHUNK_CELLS = 16
export const WORLD_CHUNK_CELLS = 32

export interface TerrainRenderProfile {
  cell: number
  ratio: number
  chunkCells: number
  overview: boolean
}

export interface WorldCamera {
  x: number
  y: number
  cell: number
}

export function canvasPixelRatio(size: { width: number; height: number }, devicePixelRatio: number) {
  const cssPixels = Math.max(1, size.width * size.height)
  const areaLimit = Math.sqrt(MAX_CANVAS_BACKING_PIXELS / cssPixels)
  const capped = Math.min(Math.max(1, devicePixelRatio), MAX_CANVAS_PIXEL_RATIO, areaLimit)
  const stepped = Math.floor(capped / CANVAS_PIXEL_RATIO_STEP) * CANVAS_PIXEL_RATIO_STEP
  return Math.max(1, stepped)
}

export function wheelZoomCell(cell: number, deltaY: number, deltaMode: number, viewportHeight: number) {
  const modePixels = deltaMode === 1
    ? deltaY * WHEEL_LINE_PIXELS
    : deltaMode === 2
      ? deltaY * Math.max(1, viewportHeight)
      : deltaY
  const pixels = Math.max(-MAX_WHEEL_PIXELS_PER_EVENT, Math.min(MAX_WHEEL_PIXELS_PER_EVENT, modePixels))
  const next = cell * Math.exp(-pixels * WHEEL_ZOOM_SENSITIVITY)
  return Math.min(MAX_WORLD_CELL_SIZE, Math.max(MIN_WORLD_CELL_SIZE, next))
}

export function terrainRenderProfile(cell: number, pixelRatio: number): TerrainRenderProfile {
  const overview = cell < WORLD_OVERVIEW_CELL_SIZE
  return {
    cell: overview ? MIN_WORLD_CELL_SIZE : cell < 32 ? 24 : cell < 52 ? 40 : 64,
    ratio: overview ? 1 : Math.min(1.5, Math.max(1, pixelRatio)),
    chunkCells: overview ? OVERVIEW_TERRAIN_CHUNK_CELLS : TERRAIN_CHUNK_CELLS,
    overview,
  }
}

export function terrainChunkBounds(camera: WorldCamera, size: { width: number; height: number }, chunkCells = TERRAIN_CHUNK_CELLS) {
  const margin = 1
  const minWorldX = Math.floor(camera.x - size.width / camera.cell / 2) - margin
  const maxWorldX = Math.ceil(camera.x + size.width / camera.cell / 2) + margin
  const minWorldY = Math.floor(camera.y - size.height / camera.cell / 2) - margin
  const maxWorldY = Math.ceil(camera.y + size.height / camera.cell / 2) + margin
  return {
    minX: Math.floor(minWorldX / chunkCells),
    maxX: Math.floor(maxWorldX / chunkCells),
    minY: Math.floor(minWorldY / chunkCells),
    maxY: Math.floor(maxWorldY / chunkCells),
  }
}

export function observationChunkViewport(
  camera: WorldCamera,
  size: { width: number; height: number },
): LocalChunkViewport {
  const marginChunks = 1
  const minWorldX = Math.floor(camera.x - size.width / camera.cell / 2)
  const maxWorldX = Math.ceil(camera.x + size.width / camera.cell / 2)
  const minWorldY = Math.floor(camera.y - size.height / camera.cell / 2)
  const maxWorldY = Math.ceil(camera.y + size.height / camera.cell / 2)
  return {
    min_chunk_x: Math.floor(minWorldX / WORLD_CHUNK_CELLS) - marginChunks,
    max_chunk_x: Math.floor(maxWorldX / WORLD_CHUNK_CELLS) + marginChunks,
    min_chunk_y: Math.floor(minWorldY / WORLD_CHUNK_CELLS) - marginChunks,
    max_chunk_y: Math.floor(maxWorldY / WORLD_CHUNK_CELLS) + marginChunks,
  }
}

export function prioritizeSelectionCandidates(candidates: WorldObject[], preferredSelectionId?: string) {
  if (!preferredSelectionId) return candidates
  const preferred = candidates.find((object) => object.id === preferredSelectionId)
  if (!preferred) return candidates
  return [preferred, ...candidates.filter((object) => object !== preferred)]
}
