export interface TeamFogDisplaySettings {
  visibilityEnabled: boolean
  visibilityOpacity: number
  explorationEnabled: boolean
  explorationOpacity: number
}

export const TEAM_FOG_DISPLAY_STORAGE_KEY = 'arena-hero.team-fog-display'

export const DEFAULT_TEAM_FOG_DISPLAY_SETTINGS: TeamFogDisplaySettings = {
  visibilityEnabled: true,
  visibilityOpacity: .2,
  explorationEnabled: true,
  explorationOpacity: .6,
}

const LEGACY_DEFAULT_VISIBILITY_OPACITY = .09
const LEGACY_DEFAULT_EXPLORATION_OPACITY = .82

export function normalizeTeamFogDisplaySettings(value: unknown): TeamFogDisplaySettings {
  const settings = value && typeof value === 'object' ? value as Partial<TeamFogDisplaySettings> : {}
  return {
    visibilityEnabled: typeof settings.visibilityEnabled === 'boolean' ? settings.visibilityEnabled : DEFAULT_TEAM_FOG_DISPLAY_SETTINGS.visibilityEnabled,
    visibilityOpacity: normalizeOpacity(settings.visibilityOpacity, DEFAULT_TEAM_FOG_DISPLAY_SETTINGS.visibilityOpacity),
    explorationEnabled: typeof settings.explorationEnabled === 'boolean' ? settings.explorationEnabled : DEFAULT_TEAM_FOG_DISPLAY_SETTINGS.explorationEnabled,
    explorationOpacity: normalizeOpacity(settings.explorationOpacity, DEFAULT_TEAM_FOG_DISPLAY_SETTINGS.explorationOpacity),
  }
}

export function readTeamFogDisplaySettings(serialized: string | null): TeamFogDisplaySettings {
  if (!serialized) return { ...DEFAULT_TEAM_FOG_DISPLAY_SETTINGS }
  try {
    const parsed: unknown = JSON.parse(serialized)
    const normalized = normalizeTeamFogDisplaySettings(parsed)
    if (usesLegacyDefaultOpacity(parsed)) {
      return {
        ...normalized,
        visibilityOpacity: DEFAULT_TEAM_FOG_DISPLAY_SETTINGS.visibilityOpacity,
        explorationOpacity: DEFAULT_TEAM_FOG_DISPLAY_SETTINGS.explorationOpacity,
      }
    }
    return normalized
  } catch {
    return { ...DEFAULT_TEAM_FOG_DISPLAY_SETTINGS }
  }
}

function usesLegacyDefaultOpacity(value: unknown) {
  if (!value || typeof value !== 'object') return false
  const settings = value as Partial<TeamFogDisplaySettings>
  return settings.visibilityOpacity === LEGACY_DEFAULT_VISIBILITY_OPACITY
    && settings.explorationOpacity === LEGACY_DEFAULT_EXPLORATION_OPACITY
}

function normalizeOpacity(value: unknown, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(1, Math.max(0, value))
}
