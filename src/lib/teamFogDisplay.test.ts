import { describe, expect, it } from 'vitest'
import { DEFAULT_TEAM_FOG_DISPLAY_SETTINGS, normalizeTeamFogDisplaySettings, readTeamFogDisplaySettings } from './teamFogDisplay'

describe('team fog display settings', () => {
  it('uses the requested layer appearance as the enabled default', () => {
    expect(readTeamFogDisplaySettings(null)).toEqual(DEFAULT_TEAM_FOG_DISPLAY_SETTINGS)
    expect(readTeamFogDisplaySettings('{invalid')).toEqual(DEFAULT_TEAM_FOG_DISPLAY_SETTINGS)
  })

  it('migrates the previous untouched opacity defaults without replacing other preferences', () => {
    expect(readTeamFogDisplaySettings(JSON.stringify({
      visibilityEnabled: false,
      visibilityOpacity: .09,
      explorationEnabled: true,
      explorationOpacity: .82,
    }))).toEqual({
      visibilityEnabled: false,
      visibilityOpacity: .2,
      explorationEnabled: true,
      explorationOpacity: .6,
    })
    expect(readTeamFogDisplaySettings(JSON.stringify({
      visibilityEnabled: true,
      visibilityOpacity: .09,
      explorationEnabled: false,
      explorationOpacity: .5,
    }))).toEqual({
      visibilityEnabled: true,
      visibilityOpacity: .09,
      explorationEnabled: false,
      explorationOpacity: .5,
    })
  })

  it('preserves valid preferences and clamps opacity to the drawable range', () => {
    expect(normalizeTeamFogDisplaySettings({
      visibilityEnabled: false,
      visibilityOpacity: 3,
      explorationEnabled: true,
      explorationOpacity: -.4,
    })).toEqual({
      visibilityEnabled: false,
      visibilityOpacity: 1,
      explorationEnabled: true,
      explorationOpacity: 0,
    })
  })
})
