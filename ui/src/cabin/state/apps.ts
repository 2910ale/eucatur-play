import type { AppIconRole } from '../../shared/icons'

/** Every app WestPlay knows, in Home grid order. */
export const APP_IDS = [
  'eucatur',
  'maps',
  'music',
  'spotify',
  'youtube',
  'youtubeMusic',
  'podcasts',
  'phone',
  'messages',
  'weather',
  'settings',
] as const

export type AppId = (typeof APP_IDS)[number]

/** An app: its id and icon (its name is in the cabin's language: state/text.ts). */
export interface AppDefinition {
  id: AppId
  icon: AppIconRole
}

export const APPS: Record<AppId, AppDefinition> = {
  eucatur: { id: 'eucatur', icon: 'eucatur' },
  maps: { id: 'maps', icon: 'maps' },
  music: { id: 'music', icon: 'music' },
  spotify: { id: 'spotify', icon: 'spotify' },
  youtube: { id: 'youtube', icon: 'youtube' },
  youtubeMusic: { id: 'youtubeMusic', icon: 'youtubeMusic' },
  podcasts: { id: 'podcasts', icon: 'podcasts' },
  phone: { id: 'phone', icon: 'phone' },
  messages: { id: 'messages', icon: 'messages' },
  weather: { id: 'weather', icon: 'weather' },
  settings: { id: 'settings', icon: 'settings' },
}

export function isAppId(value: unknown): value is AppId {
  return typeof value === 'string' && (APP_IDS as readonly string[]).includes(value)
}

/** Not in this release: Podcasts, Phone and Messages come in the one after 1.0 (PLAN.md). Their ids stay (their
 * icons, players' icon sets), but they're not on Home, and a saved screen or recent can't open them.
 *
 * Eucatur Play: Maps is off too — the route is the Ponte Eucatur's GPS, inside the Eucatur tablet (the
 * game's own map isn't built: westplay_host::maps). */
const NEXT_RELEASE: ReadonlySet<AppId> = new Set<AppId>(['maps', 'podcasts', 'phone', 'messages'])

/** The apps this release has, in Home grid order. */
export const RELEASED_APP_IDS: readonly AppId[] = APP_IDS.filter((id) => !NEXT_RELEASE.has(id))

/** An app this release has (`isAppId`, less the ones still to come). */
export function isReleasedApp(value: unknown): value is AppId {
  return isAppId(value) && !NEXT_RELEASE.has(value)
}
