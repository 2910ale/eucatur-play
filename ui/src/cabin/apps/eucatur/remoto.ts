import { useEffect, useRef } from 'react'
import type { KeybindAction } from '../../../shared/host'
import { go, useCabin, useLive } from '../../state/store'
import { isReleasedApp } from '../../state/apps'
import type { AppId } from '../../state/apps'
import { useNowPlayingTrack } from '../../dashboard/useNowPlaying'
import { openResults as youtubeResults, play as youtubePlay, goHome as youtubeHome } from '../youtube/youtube'
import { openView as spotifyView } from '../spotify/spotify'
import { openView as youtubeMusicView } from '../youtubeMusic/youtubeMusic'
import { openView as appleMusicView } from '../music/appleMusic'

/**
 * Eucatur Play (nov/2026): the cab's screen driven from the driver's phone (the Eucatur app on Android or the
 * site): the phone sends a command to the site, the Eucatur tablet (the site in this frame) picks it up and
 * passes the media ones here as `eucatur:midia`. The mouse keeps working as always: these only press what the
 * player could press.
 *
 *   play/pause, next, previous, volume up/down: the cab's keybinds (keybinds.ts, the music playing here or
 *   the one that last played), with the volume shown as a keybind shows it;
 *   brightness up/down; Home, the Dashboard, the Eucatur tablet; an app opened;
 *   a search in YouTube, Spotify, YouTube Music or Apple Music; a YouTube video played by its id.
 *
 * And what plays now goes back to the tablet (`eucatur:tocando`), for the phone to show.
 */

const KEYBINDS: readonly KeybindAction[] = ['playPause', 'nextTrack', 'previousTrack', 'volumeUp', 'volumeDown', 'brightnessUp', 'brightnessDown']

function press(action: KeybindAction): void {
  useLive.setState((live) => ({ keybind: { action, count: (live.keybind?.count ?? 0) + 1 } }))
}

/** After the app opens (its screen mounted), `then`. */
function opening(app: AppId, then: () => void): void {
  go({ type: 'openApp', app })
  setTimeout(then, 450)
}

/** Acts on a command from the phone; `false`: not a command known here. */
export function obeyRemote(data: { acao?: unknown; valor?: unknown; app?: unknown }): boolean {
  const action = typeof data.acao === 'string' ? data.acao : ''
  const value = typeof data.valor === 'string' ? data.valor.trim().slice(0, 200) : ''
  if ((KEYBINDS as readonly string[]).includes(action)) {
    press(action as KeybindAction)
    return true
  }
  switch (action) {
    case 'home':
      go({ type: 'showHome' })
      return true
    case 'painel':
      go({ type: 'showDashboard' })
      return true
    case 'tablet':
      go({ type: 'openApp', app: 'eucatur' })
      return true
    case 'abrir':
      if (isReleasedApp(data.app)) go({ type: 'openApp', app: data.app })
      return true
    case 'buscar': {
      if (!value) return true
      const app = data.app
      if (app === 'spotify') opening('spotify', () => spotifyView({ kind: 'results', query: value }))
      else if (app === 'youtubeMusic') opening('youtubeMusic', () => youtubeMusicView({ kind: 'results', query: value }))
      else if (app === 'music') opening('music', () => appleMusicView({ kind: 'results', query: value }))
      else opening('youtube', () => { youtubeHome(); youtubeResults(value) })
      return true
    }
    case 'video': {
      if (!/^[\w-]{6,20}$/.test(value)) return true
      opening('youtube', () =>
        youtubePlay({ video: value, title: '', channel: '', avatar: null, thumbnail: null, duration: '', views: '', age: '', live: false }),
      )
      return true
    }
  }
  return false
}

/** Sends the tablet what plays now and which screen shows, as it changes (and every few seconds). */
export function useReportNowPlaying(frame: { current: HTMLIFrameElement | null }, origin: string | null): void {
  const track = useNowPlayingTrack()
  const route = useCabin((state) => state.navigation.route)
  const screen = route.kind === 'app' ? route.app : route.kind
  const brightness = useCabin((state) => state.brightness)
  const message = {
    tipo: 'eucatur:tocando',
    tela: screen,
    titulo: track?.title ?? '',
    por: track?.by ?? '',
    capa: track?.artwork ?? '',
    tocando: track?.playing ?? false,
    brilho: Math.round(brightness * 100),
  }
  const key = JSON.stringify(message)
  const last = useRef('')
  useEffect(() => {
    if (!origin) return
    const now = JSON.parse(key) as typeof message
    const send = () => {
      try {
        frame.current?.contentWindow?.postMessage(now, origin)
      } catch {
        // The tablet is reloading.
      }
    }
    if (key !== last.current) {
      last.current = key
      send()
    }
    const timer = setInterval(send, 5000)
    return () => clearInterval(timer)
  }, [key, origin, frame])
}
