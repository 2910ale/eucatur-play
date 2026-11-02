import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLive } from '../../state/store'
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
 */

/** The Ponte Eucatur's local API (`apilocal.go`). */
const PONTE = 'http://127.0.0.1:47402'

/** The site the Ponte signs in to: only messages from it are listened to. */
const SITES = ['https://telemetria.comunidadeucatur.top', 'https://comunidadeucatur.top']

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

export function EucaturApp() {
  const [state, setState] = useState<State>({ kind: 'asking' })
  const [attempt, setAttempt] = useState(0)
  const frame = useRef<HTMLIFrameElement>(null)
  const language = languageOf(useLive((live) => live.gameLanguage))

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
  const typing = useRef<{ field: PageField; text: string } | null>(null)
  const send = useCallback((message: Record<string, unknown>) => {
    const target = frame.current?.contentWindow
    if (!target) return
    for (const site of SITES) {
      try {
        target.postMessage(message, site)
      } catch {
        // Not that site: the other one.
      }
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
      if (!fromSite(event.origin) || event.source !== frame.current?.contentWindow) return
      const data = event.data as { tipo?: string; id?: unknown; valor?: unknown; tipoCampo?: unknown } | null
      if (!data || typeof data !== 'object') return
      if (data.tipo === 'eucatur:campo' && typeof data.id === 'string') {
        const chosen: PageField = {
          id: data.id.slice(0, 80),
          value: typeof data.valor === 'string' ? data.valor.slice(0, 500) : '',
          kind: data.tipoCampo === 'search' ? 'search' : data.tipoCampo === 'go' ? 'go' : 'done',
        }
        typing.current = { field: chosen, text: chosen.value }
        useKeyboard.getState().attach(keyboardField(chosen), language)
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

  const retry = useMemo(
    () => () => {
      setState({ kind: 'asking' })
      setAttempt((n) => n + 1)
    },
    [],
  )

  return (
    <section className="app-panel eucatur-app" aria-label="Eucatur">
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
                A tela Eucatur precisa da <b>Ponte Eucatur 0.35</b> ou mais nova rodando neste PC (ela liga sozinha com
                o jogo). Instale ou atualize pelo site: Meu caminhão → Instalador Eucatur.
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
