import type { LocalPlayerFog, Position } from './types'

export interface TeamFogBoundaryEdge {
  from: Position
  to: Position
}

export interface TeamFogLayer {
  key: string
  team: number
  playerIds: string[]
  visibility: Position[]
  exploration: Position[]
  boundary: TeamFogBoundaryEdge[]
}

interface MutableTeamFogLayer {
  key: string
  team: number
  playerIds: string[]
  visibility: Map<string, Position>
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
    addRanges(group.visibility, player.visibility.ranges)
    addRanges(group.exploration, player.exploration.ranges)
  }

  return [...groups.values()]
    .sort((left, right) => left.team - right.team || left.key.localeCompare(right.key))
    .map((group) => {
      const visibility = sortedPositions(group.visibility.values())
      const exploration = sortedPositions(group.exploration.values())
      return {
        key: group.key,
        team: group.team,
        playerIds: [...group.playerIds].sort(),
        visibility,
        exploration,
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

function addRanges(target: Map<string, Position>, ranges: LocalPlayerFog['visibility']['ranges']) {
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
