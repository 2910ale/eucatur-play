import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { go, useCabin, useLive } from '../../state/store'
import { isInHost, postToHost } from '../../../shared/host'
import { isReleasedApp } from '../../state/apps'
import { languageOf } from '../../state/strings'
import { type Typing, useKeyboard } from '../../keyboard/store'
import './eucatur.css'

/**
 * Eucatur Play: the Comunidade Eucatur's own screen (its GPS, documents, loads, bank, tachograph and the rest),
 * the community's site in a frame, signed in through the Ponte Eucatur running on the same PC.
 *
 * The Ponte's local API (127.0.0.1:47402, Ponte 0.35+) hands a one-time sign-in link (`/cabine-link`); the site
 * signs the frame in with a cookie meant for a frame (SameSite=None, Partitioned) and opens its tablet layout.
 *
 * Typing: the page inside never has the keyboard (the game does). When one of its fields is chosen it tells this
 * app (`eucatur:campo`), which brings WestPlay's own keyboard up for it, and every change is sent back to the page
 * (`eucatur:texto`, `eucatur:enviar`).
 *
 * The tablet is Eucatur Play's base screen: it stays loaded under every other app (`shown` false only hides it),
 * so its GPS, radio and warnings keep running. It opens Eucatur Play's own apps (`eucatur:app`: Spotify,
 * YouTube...), and its warnings (`eucatur:aviso`) show over whatever app is open.
 */

/** The Ponte Eucatur's local API (`apilocal.go`). */
const PONTE = 'http://127.0.0.1:47402'

/** The game's route sent to the Eucatur GPS: this many points at most (a long route's nodes are thinned). */
const MAX_ROUTE_POINTS = 6000

/** The site the Ponte signs in to: only messages from it are listened to. */
const SITES = ['https://telemetria.comunidadeucatur.top', 'https://comunidadeucatur.top']

/** A warning from the tablet, shown over another app. */
interface Warning {
  id: string
  title: string
  text: string
  /** Something to do (a button on the tablet): "Toque para resolver". */
  action: boolean
  /** Urgent (a breakdown, a blitz, a red alert): it blinks and beeps (nov/2026). */
  urgent: boolean
}

let beeps: AudioContext | null = null
/** Three short beeps for an urgent warning (nothing if sound can't play). */
function beep() {
  try {
    beeps ??= new AudioContext()
    const start = beeps.currentTime + 0.02
    for (let i = 0; i < 3; i++) {
      const tone = beeps.createOscillator()
      const gain = beeps.createGain()
      tone.frequency.value = 880
      gain.gain.setValueAtTime(0.0001, start + i * 0.28)
      gain.gain.exponentialRampToValueAtTime(0.25, start + i * 0.28 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + i * 0.28 + 0.18)
      tone.connect(gain).connect(beeps.destination)
      tone.start(start + i * 0.28)
      tone.stop(start + i * 0.28 + 0.2)
    }
  } catch {
    // No sound here.
  }
}

type State =
  { kind: 'asking' } | { kind: 'open'; url: string } | { kind: 'noBridge' } | { kind: 'refused'; reason: string }

/** A field chosen inside the page, as it says. */
interface PageField {
  id: string
  value: string
  kind: 'search' | 'go' | 'done'
}

function fromSite(origin: string): boolean {
  return SITES.some((site) => origin === site)
}

/** Whether a message's window is the tablet's frame or a frame inside it (a few levels down at most). */
function insideFrame(source: MessageEventSource | null, tablet: Window | null): boolean {
  if (!source || !tablet || !('parent' in source)) return false
  let page: Window = source
  for (let level = 0; level < 4; level++) {
    if (page === tablet) return true
    if (page.parent === page) return false
    page = page.parent
  }
  return false
}

export function EucaturLayer({ shown }: { shown: boolean }) {
  const [state, setState] = useState<State>({ kind: 'asking' })
  const [attempt, setAttempt] = useState(0)
  const frame = useRef<HTMLIFrameElement>(null)
  const language = languageOf(useLive((live) => live.gameLanguage))
  const [warning, setWarning] = useState<Warning | null>(null)

  // A sign-in link from the Ponte, every time the app opens (or "Tentar de novo").
  useEffect(() => {
    let gone = false
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    fetch(`${PONTE}/cabine-link`, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const answer = (await response.json().catch(() => null)) as { ok?: boolean; url?: string; erro?: string } | null
        if (gone) return
        if (
          response.ok &&
          answer?.ok &&
          typeof answer.url === 'string' &&
          SITES.some((s) => answer.url!.startsWith(`${s}/`))
        ) {
          setState({ kind: 'open', url: answer.url })
        } else {
          setState({ kind: 'refused', reason: answer?.erro ?? `A Ponte respondeu ${response.status}.` })
        }
      })
      .catch(() => {
        if (!gone) setState({ kind: 'noBridge' })
      })
      .finally(() => clearTimeout(timer))
    return () => {
      gone = true
      clearTimeout(timer)
      controller.abort()
    }
  }, [attempt])

  // The page's fields, typed with WestPlay's keyboard.
  // A field can be in the tablet itself or in one of its own frames (the GPS, the loads...): the answer goes
  // back to the page it came from.
  const typing = useRef<{ field: PageField; text: string; page: Window; origin: string } | null>(null)
  const send = useCallback((message: Record<string, unknown>) => {
    const to = typing.current
    if (!to) return
    try {
      to.page.postMessage(message, to.origin)
    } catch {
      // The page has gone.
    }
  }, [])
  const keyboardField = useCallback(
    (chosen: PageField): Typing => ({
      id: `eucatur:${chosen.id}`,
      returnKind: chosen.kind,
      read: () => typing.current?.text ?? '',
      write: (text) => {
        if (typing.current) typing.current.text = text
        send({ tipo: 'eucatur:texto', id: chosen.id, valor: text })
      },
      submit: () => send({ tipo: 'eucatur:enviar', id: chosen.id }),
    }),
    [send],
  )
  useEffect(() => {
    const listen = (event: MessageEvent) => {
      if (!fromSite(event.origin) || !insideFrame(event.source, frame.current?.contentWindow ?? null)) return
      const data = event.data as {
        tipo?: string
        id?: unknown
        valor?: unknown
        tipoCampo?: unknown
        app?: unknown
        titulo?: unknown
        texto?: unknown
        acao?: unknown
        urgente?: unknown
        cls?: unknown
      } | null
      if (!data || typeof data !== 'object') return
      if (data.tipo === 'eucatur:campo' && typeof data.id === 'string') {
        const chosen: PageField = {
          id: data.id.slice(0, 80),
          value: typeof data.valor === 'string' ? data.valor.slice(0, 500) : '',
          kind: data.tipoCampo === 'search' ? 'search' : data.tipoCampo === 'go' ? 'go' : 'done',
        }
        typing.current = { field: chosen, text: chosen.value, page: event.source as Window, origin: event.origin }
        useKeyboard.getState().attach(keyboardField(chosen), language)
      } else if (data.tipo === 'eucatur:app' && isReleasedApp(data.app) && data.app !== 'eucatur') {
        go({ type: 'openApp', app: data.app })
      } else if (data.tipo === 'eucatur:aviso' && typeof data.titulo === 'string') {
        const urgent = data.urgente === true || data.cls === 'vermelho' || data.cls === 'critico'
        const shownWarning: Warning = {
          id: String(data.id ?? Date.now()).slice(0, 80),
          title: data.titulo.slice(0, 140),
          text: typeof data.texto === 'string' ? data.texto.slice(0, 280) : '',
          action: data.acao === true,
          urgent,
        }
        // Over the game too (the app's window over it, if the player keeps that on).
        if (isInHost()) {
          postToHost({ type: 'eucaturAviso', title: shownWarning.title, text: shownWarning.text, urgent: urgent || shownWarning.action })
        }
        if (useCabin.getState().eucaturAvisosTela) {
          setWarning(shownWarning)
          if (urgent) beep()
        }
      } else if (data.tipo === 'eucatur:soltou' && typeof data.id === 'string') {
        useKeyboard.getState().detach(`eucatur:${data.id.slice(0, 80)}`)
        if (typing.current?.field.id === data.id) typing.current = null
      }
    }
    window.addEventListener('message', listen)
    return () => {
      window.removeEventListener('message', listen)
      const id = typing.current?.field.id
      if (id) useKeyboard.getState().detach(`eucatur:${id}`)
    }
  }, [keyboardField, language])

  // Eucatur Play (nov/2026): the route marked in the game's map goes to the Eucatur GPS (the tablet sends it to
  // the site): as it changes, when the tablet asks (it loaded) and once a minute (so the site knows it's still
  // there). Its points in order, in metres, at most `MAX_ROUTE_POINTS`.
  const route = useLive((live) => live.route)
  const sentRoute = useRef<{ id: number | null; at: number }>({ id: null, at: 0 })
  const sendRoute = useCallback(() => {
    const tablet = frame.current?.contentWindow
    if (!tablet || state.kind !== 'open') return
    const origin = new URL(state.url).origin
    const nodes = route?.nodes ?? []
    const step = Math.max(1, Math.ceil(nodes.length / MAX_ROUTE_POINTS))
    const points: number[] = []
    for (let i = 0; i < nodes.length; i += step) points.push(Math.round(nodes[i].position[0]), Math.round(nodes[i].position[1]))
    const last = nodes[nodes.length - 1]
    if (last && (nodes.length - 1) % step !== 0) points.push(Math.round(last.position[0]), Math.round(last.position[1]))
    try {
      tablet.postMessage({ tipo: 'eucatur:rotaJogo', id: route?.id ?? null, pontos: points.length >= 4 ? points : null }, origin)
      sentRoute.current = { id: route?.id ?? null, at: Date.now() }
    } catch {
      // The page has gone.
    }
  }, [route, state])
  useEffect(() => {
    if ((route?.id ?? null) !== sentRoute.current.id) sendRoute()
    const timer = setInterval(() => {
      if (route && Date.now() - sentRoute.current.at > 55000) sendRoute()
    }, 60000)
    return () => clearInterval(timer)
  }, [route, sendRoute])
  useEffect(() => {
    const ask = (event: MessageEvent) => {
      const data = event.data as { tipo?: string } | null
      if (fromSite(event.origin) && data?.tipo === 'eucatur:pedirRota' && event.source === frame.current?.contentWindow) sendRoute()
    }
    window.addEventListener('message', ask)
    return () => window.removeEventListener('message', ask)
  }, [sendRoute])

  // Hidden behind another app: its field lets go of the keyboard.
  useEffect(() => {
    if (shown || !typing.current) return
    useKeyboard.getState().detach(`eucatur:${typing.current.field.id}`)
    typing.current = null
  }, [shown])

  // A warning shows a while over the other apps (on the tablet, the tablet shows its own).
  useEffect(() => {
    if (!warning) return
    const timer = setTimeout(() => setWarning(null), warning.urgent ? 15000 : warning.action ? 12000 : 7000)
    return () => clearTimeout(timer)
  }, [warning])

  const retry = useMemo(
    () => () => {
      setState({ kind: 'asking' })
      setAttempt((n) => n + 1)
    },
    [],
  )

  return (
    <>
      <section className={shown ? 'eucatur-layer shown' : 'eucatur-layer'} aria-label="Eucatur" aria-hidden={!shown}>
        {state.kind === 'open' ? (
          <iframe
            ref={frame}
            className="eucatur-frame"
            title="Eucatur"
            src={state.url}
            allow="autoplay; microphone; geolocation; clipboard-write"
          />
        ) : (
          <div className="eucatur-status">
            <EucaturMark />
            {state.kind === 'asking' && <p>Conectando com a Ponte Eucatur…</p>}
            {state.kind === 'noBridge' && (
              <>
                <h2>Ponte Eucatur não encontrada</h2>
                <p>
                  A tela Eucatur precisa da <b>Ponte Eucatur 0.35</b> ou mais nova rodando neste PC (ela liga sozinha
                  com o jogo). Instale ou atualize pelo site: Meu caminhão → Instalador Eucatur.
                </p>
                <button type="button" className="eucatur-button" onClick={retry}>
                  Tentar de novo
                </button>
              </>
            )}
            {state.kind === 'refused' && (
              <>
                <h2>Não deu para entrar</h2>
                <p>{state.reason}</p>
                <button type="button" className="eucatur-button" onClick={retry}>
                  Tentar de novo
                </button>
              </>
            )}
          </div>
        )}
      </section>
      {warning && !shown && (
        <button
          type="button"
          className={['eucatur-warning', warning.action ? 'action' : '', warning.urgent ? 'urgent' : ''].filter(Boolean).join(' ')}
          onClick={() => {
            setWarning(null)
            go({ type: 'openApp', app: 'eucatur' })
          }}
        >
          <EucaturMark />
          <span>
            <b>{warning.title}</b>
            {warning.text && <span>{warning.text}</span>}
            {warning.action && <i>Toque para resolver no tablet</i>}
          </span>
        </button>
      )}
    </>
  )
}

/** The community's mark: a truck in amber. */
function EucaturMark() {
  return (
    <svg className="eucatur-mark" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 17h-2v-11a1 1 0 0 1 1 -1h9v12m-4 0h6m4 0h2v-6h-8m0 -5h5l3 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="7" cy="17" r="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="17" cy="17" r="2" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}
