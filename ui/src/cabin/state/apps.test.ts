import { describe, expect, it } from 'vitest'
import { isReleasedApp, RELEASED_APP_IDS } from './apps'

describe('the apps this release has', () => {
  it('leaves Podcasts, Phone and Messages for the release after 1.0, keeping Home’s order (Eucatur first)', () => {
    expect(RELEASED_APP_IDS).toEqual([
      'eucatur',
      'maps',
      'music',
      'spotify',
      'youtube',
      'youtubeMusic',
      'weather',
      'settings',
    ])
  })

  it('opens none of them from a saved screen or recent', () => {
    expect(isReleasedApp('podcasts')).toBe(false)
    expect(isReleasedApp('phone')).toBe(false)
    expect(isReleasedApp('messages')).toBe(false)
    expect(isReleasedApp('youtubeMusic')).toBe(true)
    expect(isReleasedApp('nonsense')).toBe(false)
  })
})
