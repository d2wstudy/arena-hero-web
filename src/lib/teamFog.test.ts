import { describe, expect, it } from 'vitest'
import type { LocalPlayerFog, Position } from './types'
import { buildTeamFogLayers, explorationBoundaryEdges } from './teamFog'

function fog(playerId: string, team: number, visibility: LocalPlayerFog['visibility']['ranges'], exploration = visibility): LocalPlayerFog {
  return {
    player_id: playerId,
    username: playerId,
    team,
    visibility: { ranges: visibility },
    exploration: { ranges: exploration },
  }
}

describe('buildTeamFogLayers', () => {
  it('unions same-team visibility before drawing', () => {
    const [layer] = buildTeamFogLayers([
      fog('one', 3, [[0, 0, 1]]),
      fog('two', 3, [[0, 1, 2]]),
    ])

    expect(layer.playerIds).toEqual(['one', 'two'])
    expect(layer.visibility).toEqual([[0, 0], [1, 0], [2, 0]])
  })

  it('keeps different teams in independent layers', () => {
    const layers = buildTeamFogLayers([
      fog('one', 1, [[0, 0, 0]]),
      fog('two', 2, [[0, 0, 0]]),
    ])

    expect(layers).toHaveLength(2)
    expect(layers.map((layer) => layer.team)).toEqual([1, 2])
  })
})

describe('explorationBoundaryEdges', () => {
  it('does not draw the internal edge between adjacent explored cells', () => {
    const edges = explorationBoundaryEdges([[0, 0], [1, 0]])

    expect(edges).toHaveLength(6)
    expect(hasEdge(edges, [.5, -.5], [.5, .5])).toBe(false)
  })

  it('preserves the inner boundary of an unexplored hole', () => {
    const ring: Position[] = [
      [-1, -1], [0, -1], [1, -1],
      [-1, 0], [1, 0],
      [-1, 1], [0, 1], [1, 1],
    ]
    const edges = explorationBoundaryEdges(ring)

    expect(hasEdge(edges, [-.5, -.5], [.5, -.5])).toBe(true)
    expect(hasEdge(edges, [.5, -.5], [.5, .5])).toBe(true)
    expect(hasEdge(edges, [.5, .5], [-.5, .5])).toBe(true)
    expect(hasEdge(edges, [-.5, .5], [-.5, -.5])).toBe(true)
  })
})

function hasEdge(edges: ReturnType<typeof explorationBoundaryEdges>, first: Position, second: Position) {
  return edges.some((edge) => (
    edge.from[0] === first[0] && edge.from[1] === first[1]
    && edge.to[0] === second[0] && edge.to[1] === second[1]
  ) || (
    edge.from[0] === second[0] && edge.from[1] === second[1]
    && edge.to[0] === first[0] && edge.to[1] === first[1]
  ))
}
