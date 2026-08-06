import { describe, expect, it } from 'vitest'
import { skipsSessionAuthentication } from './AuthContext'

describe('development session authentication', () => {
  it('skips account Session/OAuth only for development-only arena routes', () => {
    expect(skipsSessionAuthentication('/demo', true)).toBe(true)
    expect(skipsSessionAuthentication('/local', true)).toBe(true)
    expect(skipsSessionAuthentication('/official', true)).toBe(true)
    expect(skipsSessionAuthentication('/official/', true)).toBe(true)
    expect(skipsSessionAuthentication('/arena', true)).toBe(false)
    expect(skipsSessionAuthentication('/official', false)).toBe(false)
  })
})
