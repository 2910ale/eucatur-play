import { formatGameTime } from '../../shared/format'
import { useAppIcon, useScreenProfile } from '../state/hooks'
import { type AppId, APPS } from '../state/apps'
import { LAUNCH_STYLE, useCarriesLaunch } from '../state/launch'
import { eucaturHomeTarget } from '../state/navigation'
import { go, useCabin, useLive } from '../state/store'
import { useText } from '../state/text'
import { cabClock } from '../../shared/host'

/**
 * The CarPlay sidebar: clock and signal, the recent apps (the open one on top), and at the bottom the truck
 * button (back to the truck's own screen, like CarPlay's car button) and the Home button.
 */
export function Sidebar() {
  const recents = useCabin((state) => state.navigation.recents)
  const route = useCabin((state) => state.navigation.route)
  const homeTarget = useCabin((state) => eucaturHomeTarget(state.navigation))
  const tabletIcon = useAppIcon(APPS.eucatur.icon)
  const gameTime = useLive((state) => (state.telemetry ? cabClock(state.telemetry, state.clockShift) : null))
  const shown = useScreenProfile().recents ?? 3

  return (
    // Its own transition name: it stays put while screens change (shell/transitions.css).
    <aside className="sidebar glass" style={{ viewTransitionName: 'sidebar' }}>
      <div className="status">
        <div className="time">{gameTime === null ? '--:--' : formatGameTime(gameTime)}</div>
        {/* Placeholder until the phone remote (planned) reports the real phone. */}
        <div className="signal">
          <SignalBars /> 5G
        </div>
      </div>
      <nav className="recent" aria-label="Recent apps">
        {recents.slice(0, shown).map((app) => (
          <RecentApp key={app} app={app} current={route.kind === 'app' && route.app === app} />
        ))}
      </nav>
      <div className="sidebar-actions">
        <button
          type="button"
          className="sidebar-button"
          aria-label="Truck screen"
          onClick={() => useCabin.getState().setTruckScreen(true)}
        >
          <TruckGlyph />
        </button>
        {/* Its icon is where it goes: the app grid, or back to the Eucatur tablet. */}
        <button
          type="button"
          className="sidebar-button home-button"
          aria-label={homeTarget === 'home' ? 'Apps' : 'Eucatur'}
          onClick={() => go({ type: 'pressHome' })}
        >
          {/* Eucatur Play: back to the tablet (its icon), or from the tablet to the app grid. */}
          <GridGlyph shown={homeTarget === 'home'} />
          {homeTarget === 'eucatur' && <img className="home-tablet" src={tabletIcon} alt="" />}
        </button>
      </div>
    </aside>
  )
}

/**
 * A recent app. Its icon has a transition name of its own, so it slides to its new place when the order
 * changes, pushing the others along (like moving an icon on iOS). When it opens its app, the window grows
 * out of a copy laid exactly over it for that moment, so the icon itself is still free to slide to the top.
 */
function RecentApp({ app, current }: { app: AppId; current: boolean }) {
  const launching = useCarriesLaunch(app, { kind: 'icon', origin: 'sidebar' })
  const icon = useAppIcon(APPS[app].icon)
  const text = useText()
  return (
    <button
      type="button"
      aria-current={current ? 'page' : undefined}
      aria-label={text.apps[app]}
      onClick={() => go({ type: 'openApp', app }, 'sidebar')}
    >
      <img src={icon} alt="" style={{ viewTransitionName: `recent-${app}`, viewTransitionClass: 'recent' }} />
      {launching && <img className="launch-copy" src={icon} alt="" style={LAUNCH_STYLE} />}
    </button>
  )
}

/** Home: the app grid. */
function GridGlyph({ shown }: { shown: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="34" height="34" className={shown ? 'shown' : undefined} aria-hidden>
      {[4, 10.25, 16.5].flatMap((x) =>
        [4, 10.25, 16.5].map((y) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="3.5" height="3.5" rx="1" fill="currentColor" />
        )),
      )}
    </svg>
  )
}


/** Back to the truck: the front of a truck cab (our own glyph, not CarPlay's car). */
function TruckGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="36"
      height="36"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M6.5 3.5h11a2 2 0 0 1 2 2V17h-15V5.5a2 2 0 0 1 2-2Z" />
      <path d="M7 6.5h10v4.5H7Z" />
      <path d="M7.5 14h1.5M15 14h1.5" />
      <path d="M6 17v2.5h2.5V17M15.5 17v2.5H18V17" />
    </svg>
  )
}

function SignalBars() {
  return (
    <svg viewBox="0 0 20 14" width="26" height="18" aria-hidden>
      {[0, 1, 2, 3].map((bar) => (
        <rect
          key={bar}
          x={bar * 5.5}
          y={10 - bar * 3.3}
          width="3.6"
          height={4 + bar * 3.3}
          rx="1"
          fill="currentColor"
        />
      ))}
    </svg>
  )
}
