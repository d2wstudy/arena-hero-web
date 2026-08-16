export interface TeamTone {
  key: string
  color: string
  labelColor: string
  filter: string
}

const BASE_SPRITE_HUE = 205
const FIXED_TEAM_HUES = [205, 270, 145, 42, 185, 325, 24, 96, 235, 165, 300, 62] as const
const GOLDEN_ANGLE = 137.508

export function teamTone(team: number | undefined): TeamTone | null {
  if (!Number.isSafeInteger(team) || team === undefined || team < 1) return null
  const hue = team <= FIXED_TEAM_HUES.length
    ? FIXED_TEAM_HUES[team - 1]
    : Math.round((BASE_SPRITE_HUE + (team - 1) * GOLDEN_ANGLE) % 360)
  const shift = ((hue - BASE_SPRITE_HUE + 540) % 360) - 180
  return {
    key: `team:${team}:${hue}`,
    color: team === 1 ? '#4591c5' : `hsl(${hue} 62% 60%)`,
    labelColor: team === 1 ? '#a8c8dd' : `hsl(${hue} 72% 79%)`,
    filter: shift === 0 ? 'none' : `hue-rotate(${shift}deg) saturate(1.08) brightness(1.02)`,
  }
}
