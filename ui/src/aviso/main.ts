import { listen } from '@tauri-apps/api/event'
import { beepFor, isWarning, type Warning } from './warning'
import './aviso.css'

/**
 * Eucatur Play (nov/2026): the Eucatur warnings over the game itself, in a see-through window on top of it
 * that never takes the mouse or the keyboard (the app shows it without activating it, and hides it again).
 * It shows the warning the app sends (`eucatur-aviso`); an urgent one blinks and beeps.
 */
const root = document.getElementById('aviso') as HTMLDivElement

function show(warning: Warning) {
  root.className = warning.urgent ? 'card urgent' : 'card'
  root.replaceChildren()
  const title = document.createElement('b')
  title.textContent = warning.title
  root.append(title)
  if (warning.text) {
    const text = document.createElement('span')
    text.textContent = warning.text
    root.append(text)
  }
  if (warning.urgent) beepFor(warning)
}

listen<unknown>('eucatur-aviso', (event) => {
  if (isWarning(event.payload)) show(event.payload)
}).catch(() => {})
