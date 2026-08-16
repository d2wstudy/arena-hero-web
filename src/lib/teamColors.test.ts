import { describe, expect, it } from 'vitest'
import { teamTone } from './teamColors'

describe('teamTone', () => {
  it('assigns stable distinct tones to the initial team palette', () => {
    const tones = Array.from({ length: 12 }, (_, index) => teamTone(index + 1))
    expect(new Set(tones.map((tone) => tone?.color)).size).toBe(12)
    expect(teamTone(4)).toEqual(teamTone(4))
  })

  it('continues deterministically beyond the fixed palette', () => {
    expect(teamTone(13)).toEqual(teamTone(13))
    expect(teamTone(13)?.color).not.toBe(teamTone(14)?.color)
  })

  it('does not invent a team tone for invalid metadata', () => {
    expect(teamTone(undefined)).toBeNull()
    expect(teamTone(0)).toBeNull()
    expect(teamTone(1.5)).toBeNull()
  })
})
