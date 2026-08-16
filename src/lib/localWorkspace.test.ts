import { describe, expect, it } from 'vitest'
import { defaultLocalWorkspaceState, normalizeLocalWorkspaceState, readLocalWorkspaceState, workspaceAfterWorldEdit } from './localWorkspace'

describe('local workspace state', () => {
  it('defaults to a safe live human workspace', () => {
    expect(readLocalWorkspaceState(null)).toEqual(defaultLocalWorkspaceState())
    expect(readLocalWorkspaceState('{invalid')).toEqual(defaultLocalWorkspaceState())
  })

  it('restores observation, camera, filters, selection, controls, and replay', () => {
    expect(normalizeLocalWorkspaceState({
      view: { mode: 'PLAYER', playerId: 'bot-2' },
      selectedTeam: 3,
      selectedObjectId: 'unit-9',
      camera: { x: 120.5, y: -42.25, cell: 999 },
      control: { drawerOpen: true, activeTab: 'history', batchTickText: '250', autoTickSecondsText: '.4' },
      replay: { matchId: 'branch-4', tick: 88 },
    })).toEqual({
      version: 1,
      view: { mode: 'PLAYER', playerId: 'bot-2' },
      selectedTeam: 3,
      selectedObjectId: 'unit-9',
      camera: { x: 120.5, y: -42.25, cell: 78 },
      control: { drawerOpen: true, activeTab: 'history', batchTickText: '250', autoTickSecondsText: '.4' },
      replay: { matchId: 'branch-4', tick: 88 },
    })
  })

  it('keeps the visual workspace but returns an edited or branched world to live state', () => {
    const workspace = normalizeLocalWorkspaceState({
      view: { mode: 'GLOBAL' },
      selectedTeam: 2,
      camera: { x: 5, y: 7, cell: 36 },
      replay: { matchId: 'old-match', tick: 14 },
    })

    expect(workspaceAfterWorldEdit(workspace)).toEqual({ ...workspace, replay: null })
  })
})
