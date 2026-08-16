import { describe, expect, it } from 'vitest'
import { DEFAULT_TEAM_FOG_DISPLAY_SETTINGS, normalizeTeamFogDisplaySettings, readTeamFogDisplaySettings } from './teamFogDisplay'

describe('team fog display settings', () => {
  it('uses the existing layer appearance as the enabled default', () => {
    expect(readTeamFogDisplaySettings(null)).toEqual(DEFAULT_TEAM_FOG_DISPLAY_SETTINGS)
    expect(readTeamFogDisplaySettings('{invalid')).toEqual(DEFAULT_TEAM_FOG_DISPLAY_SETTINGS)
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
