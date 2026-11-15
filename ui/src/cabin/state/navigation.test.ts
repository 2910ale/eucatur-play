import { describe, expect, it } from 'vitest'
import {
  eucaturHomeTarget,
  homeButtonTarget,
  INITIAL_NAVIGATION,
  navigate,
  type NavigationState,
  RECENTS_LIMIT,
  routeKey,
  sidebarApps,
} from './navigation'
import { APP_IDS } from './apps'

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

  it('adds a new app to the recents, keeping every app used', () => {
    const state = navigate(INITIAL_NAVIGATION, { type: 'openApp', app: 'settings' })
    expect(state.recents).toEqual(['settings', 'eucatur', 'spotify', 'youtube', 'music', 'youtubeMusic'])
    expect(RECENTS_LIMIT).toBe(APP_IDS.length)
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

describe('sidebarApps', () => {
  // Eucatur Play: the Eucatur tablet in the maps app's slot; Phone and Messages aren't in it, so their slot is left
  // out and the fourth (Calendar, Weather, Settings or Safari) comes third.
  it('shows one app of each kind, the last used of it, in a fixed order', () => {
    expect(sidebarApps(['weather', 'spotify', 'youtube', 'music', 'maps'], 3)).toEqual(['eucatur', 'spotify', 'weather'])
    expect(sidebarApps(['youtubeMusic', 'messages', 'spotify', 'phone'], 3)).toEqual([
      'eucatur',
      'youtubeMusic',
      'calendar',
    ])
  })

  it("takes each kind's first app until one of it is used", () => {
    expect(sidebarApps([], 3)).toEqual(['eucatur', 'music', 'calendar'])
    expect(sidebarApps(['settings'], 3)).toEqual(['eucatur', 'music', 'settings'])
  })

  it('shows only as many as the screen has room for', () => {
    expect(sidebarApps(['spotify'], 1)).toEqual(['eucatur'])
    expect(sidebarApps(['safari', 'weather', 'spotify'], 4)).toEqual(['eucatur', 'spotify', 'safari'])
    expect(sidebarApps(['spotify'], 9)).toHaveLength(3)
  })

  it('remembers a music app however many others were opened since', () => {
    let state = navigate(INITIAL_NAVIGATION, { type: 'openApp', app: 'youtubeMusic' })
    for (const app of ['weather', 'settings', 'youtube', 'eucatur'] as const) {
      state = navigate(state, { type: 'openApp', app })
    }
    expect(sidebarApps(state.recents, 3)).toEqual(['eucatur', 'youtubeMusic', 'settings'])
  })
})

describe('routeKey', () => {
  it('is distinct per route', () => {
    expect(routeKey({ kind: 'home' })).toBe('home')
    expect(routeKey({ kind: 'dashboard' })).toBe('dashboard')
    expect(routeKey({ kind: 'app', app: 'maps' })).toBe('app:maps')
  })
})
