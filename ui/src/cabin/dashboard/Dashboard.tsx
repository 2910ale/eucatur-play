import { GuidanceCard } from '../maps/GuidanceCard'
import { speedKmh } from '../../shared/format'
import { go, useLive } from '../state/store'
import { useAnyWidget } from './widgetState'
import { DestinationWidget, NowPlayingWidget, WeatherWidget } from './widgets'
import './dashboard.css'

/**
 * CarPlay-style Dashboard: the big tile on the left, and a column of one-job widgets on the right:
 * turn-by-turn on top while there's a route, the weather where there's room.
 *
 * Eucatur Play: the big tile is the way to the Ponte Eucatur's GPS (inside the Eucatur tablet), not
 * WestPlay's own map, which is off (state/apps.ts).
 */
export function Dashboard() {
  // No widget to show (those turned on in Settings have nothing, and no route): the map has the whole width.
  const anyWidget = useAnyWidget()
  return (
    <section className="screen dashboard" aria-label="Dashboard">
      <EucaturGpsTile />
      <div className="widgets" hidden={!anyWidget}>
        <GuidanceCard variant="widget" />
        <NowPlayingWidget />
        <DestinationWidget />
        <WeatherWidget />
      </div>
    </section>
  )
}

/** The Dashboard's big tile: the speed, the road's limit, and the button that opens the Eucatur tablet's GPS. */
function EucaturGpsTile() {
  const speed = useLive((state) => (state.telemetry ? Math.round(speedKmh(state.telemetry.speed)) : 0))
  const limit = useLive((state) => (state.telemetry ? Math.round(speedKmh(state.telemetry.navigationSpeedLimit)) : 0))
  return (
    <button type="button" className="eucatur-gps-tile" onClick={() => go({ type: 'openApp', app: 'eucatur' })}>
      <svg className="eucatur-gps-glyph" viewBox="0 0 24 24" aria-hidden>
        <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
        <circle cx="12" cy="10" r="2.4" />
      </svg>
      <span className="eucatur-gps-title">GPS Eucatur</span>
      <span className="eucatur-gps-sub">Rota, radares e copiloto no tablet Eucatur</span>
      <span className="eucatur-gps-speed">
        <b>{speed}</b> km/h{limit > 0 ? <span className="eucatur-gps-limit">{limit}</span> : null}
      </span>
      <span className="eucatur-gps-open">Abrir o GPS</span>
    </button>
  )
}
