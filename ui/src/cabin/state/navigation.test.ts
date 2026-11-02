import { describe, expect, it } from 'vitest'
import {
  eucaturHomeTarget,
  homeButtonTarget,
  INITIAL_NAVIGATION,
  navigate,
  type NavigationState,
  RECENTS_LIMIT,
  routeKey,
} from './navigation'

describe('navigate', () => {
  it('starts on the Eucatur tablet', () => {
    expect(INITIAL_NAVIGATION.route).toEqual({ kind: 'app', app: 'eucatur' })
    expect(INITIAL_NAVIGATION.recents[0]).toBe('eucatur')
  })

  it('opens an app and moves it to the front of the recents', () => {
    const state = navigate(INITIAL_NAVIGATION, { type: 'openApp', app: 'youtube' })
    expect(state.route).toEqual({ kind: 'app', app: 'youtube' })
    expect(state.recents).toEqual(['youtube', 'eucatur', 'spotify', 'music', 'youtubeMusic'])
  })

  it('adds a new app to the recents and keeps the limit', () => {
    const state = navigate(INITIAL_NAVIGATION, { type: 'openApp', app: 'settings' })
    expect(state.recents).toEqual(['settings', 'eucatur', 'spotify', 'youtube', 'music'])
    expect(state.recents).toHaveLength(RECENTS_LIMIT)
  })

  it('takes the Home button from any app back to the Eucatur tablet', () => {
    const inApp = navigate(INITIAL_NAVIGATION, { type: 'openApp', app: 'music' })
    expect(eucaturHomeTarget(inApp)).toBe('eucatur')
    const back = navigate(inApp, { type: 'pressHome' })
    expect(back.route).toEqual({ kind: 'app', app: 'eucatur' })
    expect(back.recents[0]).toBe('eucatur')
  })

  it('goes from the tablet to the app grid, and from the grid or the Dashboard back to the tablet', () => {
    expect(eucaturHomeTarget(INITIAL_NAVIGATION)).toBe('home')
    const grid = navigate(INITIAL_NAVIGATION, { type: 'pressHome' })
    expect(grid.route).toEqual({ kind: 'home' })
    expect(navigate(grid, { type: 'pressHome' }).route).toEqual({ kind: 'app', app: 'eucatur' })
    const dashboard: NavigationState = { ...INITIAL_NAVIGATION, route: { kind: 'dashboard' }, base: 'dashboard' }
    expect(navigate(dashboard, { type: 'pressHome' }).route).toEqual({ kind: 'app', app: 'eucatur' })
  })

  it('still says where an app was opened from', () => {
    const fromHome = navigate(
      { ...INITIAL_NAVIGATION, route: { kind: 'home' }, base: 'home' },
      { type: 'openApp', app: 'music' },
    )
    expect(homeButtonTarget(fromHome)).toBe('home')
  })

  it('shows the Dashboard', () => {
    const inApp: NavigationState = { ...INITIAL_NAVIGATION, route: { kind: 'app', app: 'maps' } }
    expect(navigate(inApp, { type: 'showDashboard' }).route).toEqual({ kind: 'dashboard' })
    expect(navigate(inApp, { type: 'showHome' }).route).toEqual({ kind: 'home' })
    const home = navigate(inApp, { type: 'showHome' })
    expect(navigate(home, { type: 'showHome' })).toEqual(home)
  })
})

describe('routeKey', () => {
  it('is distinct per route', () => {
    expect(routeKey({ kind: 'home' })).toBe('home')
    expect(routeKey({ kind: 'dashboard' })).toBe('dashboard')
    expect(routeKey({ kind: 'app', app: 'maps' })).toBe('app:maps')
  })
})
