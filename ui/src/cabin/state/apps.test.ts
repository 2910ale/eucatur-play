import { describe, expect, it } from 'vitest'
import { isReleasedApp, RELEASED_APP_IDS } from './apps'

describe('the apps this release has', () => {
  // Eucatur Play: no Maps (the GPS is the Ponte Eucatur's), and Phone and Messages stay out with Podcasts.
  it('leaves Maps, Podcasts, Phone and Messages out, keeping Home’s order (Eucatur first)', () => {
    expect(RELEASED_APP_IDS).toEqual([
      'eucatur',
      'music',
      'spotify',
      'youtube',
      'youtubeMusic',
      'player',
      'safari',
      'calendar',
      'weather',
      'settings',
    ])
  })

  it('opens none of the later ones from a saved screen or recent', () => {
    expect(isReleasedApp('podcasts')).toBe(false)
    expect(isReleasedApp('phone')).toBe(false)
    expect(isReleasedApp('maps')).toBe(false)
    expect(isReleasedApp('calendar')).toBe(true)
    expect(isReleasedApp('nonsense')).toBe(false)
  })
})
