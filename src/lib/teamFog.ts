import type { LocalPlayerFog, Position } from './types'

export interface TeamFogBoundaryEdge {
  from: Position
  to: Position
}

export interface TeamFogLayer {
  key: string
  team: number
  playerIds: string[]
  visibilityRanges: LocalPlayerFog['visibility']['ranges']
  boundary: TeamFogBoundaryEdge[]
}

interface MutableTeamFogLayer {
  key: string
  team: number
  playerIds: string[]
  visibility: Map<number, Array<[startX: number, endX: number]>>
  exploration: Map<string, Position>
}

export function buildTeamFogLayers(players: LocalPlayerFog[]): TeamFogLayer[] {
  const configuredTeams = players
    .map((player) => player.team)
    .filter((team): team is number => Number.isSafeInteger(team) && team !== undefined && team >= 1)
  let nextFallbackTeam = Math.max(0, ...configuredTeams) + 1
  const groups = new Map<string, MutableTeamFogLayer>()

  for (const player of players) {
    const hasTeam = Number.isSafeInteger(player.team) && player.team !== undefined && player.team >= 1
    const key = hasTeam ? `team:${player.team}` : `player:${player.player_id}`
    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        team: hasTeam ? player.team! : nextFallbackTeam++,
        playerIds: [],
        visibility: new Map(),
        exploration: new Map(),
      }
      groups.set(key, group)
    }
    group.playerIds.push(player.player_id)
    addCoverageRanges(group.visibility, player.visibility.ranges)
    addCells(group.exploration, player.exploration.ranges)
  }

  return [...groups.values()]
    .sort((left, right) => left.team - right.team || left.key.localeCompare(right.key))
    .map((group) => {
      const exploration = sortedPositions(group.exploration.values())
      return {
        key: group.key,
        team: group.team,
        playerIds: [...group.playerIds].sort(),
        visibilityRanges: mergedCoverageRanges(group.visibility),
        boundary: explorationBoundaryEdges(exploration),
      }
    })
}

export function explorationBoundaryEdges(cells: Iterable<Position>): TeamFogBoundaryEdge[] {
  const positions = sortedPositions(cells)
  const covered = new Set(positions.map(cellKey))
  const edges: TeamFogBoundaryEdge[] = []
  for (const [x, y] of positions) {
    if (!covered.has(cellKey([x, y - 1]))) edges.push({ from: [x - .5, y - .5], to: [x + .5, y - .5] })
    if (!covered.has(cellKey([x + 1, y]))) edges.push({ from: [x + .5, y - .5], to: [x + .5, y + .5] })
    if (!covered.has(cellKey([x, y + 1]))) edges.push({ from: [x + .5, y + .5], to: [x - .5, y + .5] })
    if (!covered.has(cellKey([x - 1, y]))) edges.push({ from: [x - .5, y + .5], to: [x - .5, y - .5] })
  }
  return edges
}

function addCoverageRanges(target: Map<number, Array<[startX: number, endX: number]>>, ranges: LocalPlayerFog['visibility']['ranges']) {
  for (const [y, startX, endX] of ranges) {
    const row = target.get(y)
    if (row) row.push([startX, endX])
    else target.set(y, [[startX, endX]])
  }
}

function mergedCoverageRanges(rows: Map<number, Array<[startX: number, endX: number]>>): LocalPlayerFog['visibility']['ranges'] {
  const merged: LocalPlayerFog['visibility']['ranges'] = []
  for (const y of [...rows.keys()].sort((left, right) => left - right)) {
    const intervals = [...rows.get(y)!].sort((left, right) => left[0] - right[0] || left[1] - right[1])
    let [start, end] = intervals[0]
    for (let index = 1; index < intervals.length; index++) {
      const [nextStart, nextEnd] = intervals[index]
      if (nextStart <= end + 1) {
        end = Math.max(end, nextEnd)
        continue
      }
      merged.push([y, start, end])
      start = nextStart
      end = nextEnd
    }
    merged.push([y, start, end])
  }
  return merged
}

function addCells(target: Map<string, Position>, ranges: LocalPlayerFog['visibility']['ranges']) {
  for (const [y, startX, endX] of ranges) {
    for (let x = startX; x <= endX; x++) {
      const position: Position = [x, y]
      target.set(cellKey(position), position)
    }
  }
}

function sortedPositions(cells: Iterable<Position>) {
  return [...cells].sort((left, right) => left[1] - right[1] || left[0] - right[0])
}

function cellKey([x, y]: Position) {
  return `${x},${y}`
}
