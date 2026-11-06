//! Eucatur Play (nov/2026): the Eucatur warnings over the game itself (the diretoria asked for every warning
//! of the phone and the tablet to show in the game too, the urgent ones blinking).
//!
//! A see-through window (`ui/aviso.html`) at the top of the main screen, on top of everything, that lets the
//! mouse through and is never activated (`westplay_host::overlay`): the game keeps the keyboard. It's made
//! hidden at the start, shown for a warning and hidden again a few seconds later. Windows shows it over a game
//! in a window or in borderless full screen; a game in exclusive full screen hides it (then the warning still
//! shows on the truck's screen).

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use westplay_host::EucaturAviso;

const LABEL: &str = "aviso";
const WIDTH: f64 = 620.0;
const HEIGHT: f64 = 130.0;
/// How long a warning shows: an urgent one longer.
const SHOWS: Duration = Duration::from_secs(8);
const SHOWS_URGENT: Duration = Duration::from_secs(15);
/// The page is given a moment to draw the warning before the window shows (no empty frame).
const DRAWS: Duration = Duration::from_millis(150);

/// Bumped with every warning: the one hiding the window is the last one's.
static SHOWN: AtomicU64 = AtomicU64::new(0);

/// Makes the window (hidden), at the start, so its page is ready by the first warning.
pub fn make(app: &AppHandle) {
    if app.get_webview_window(LABEL).is_some() {
        return;
    }
    let built = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("aviso.html".into()))
        .title("Aviso Eucatur")
        .transparent(true)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(false)
        .visible(false)
        .resizable(false)
        .shadow(false)
        .inner_size(WIDTH, HEIGHT)
        .build();
    match built {
        Ok(window) => {
            let _ = window.set_ignore_cursor_events(true);
            westplay_host::overlay::prepare(raw(&window));
            place(&window);
        }
        Err(error) => westplay_host::log!("[aviso] the window over the game couldn't be made: {error}"),
    }
}

fn raw(window: &WebviewWindow) -> isize {
    window.hwnd().map(|h| h.0 as isize).unwrap_or(0)
}

/// At the top, in the middle, of the main screen (where the game usually is).
fn place(window: &WebviewWindow) {
    let monitor = window.primary_monitor().ok().flatten().or_else(|| window.current_monitor().ok().flatten());
    if let Some(monitor) = monitor {
        let (size, at, scale) = (monitor.size(), monitor.position(), monitor.scale_factor());
        let width = (WIDTH * scale) as i32;
        let x = at.x + (size.width as i32 - width) / 2;
        let y = at.y + (24.0 * scale) as i32;
        let _ = window.set_position(PhysicalPosition::new(x, y));
    }
}

/// Shows a warning over the game (called by the host, with the game running and showing).
pub fn show(app: &AppHandle, aviso: &EucaturAviso) {
    let Some(window) = app.get_webview_window(LABEL) else {
        make(app);
        return;
    };
    let _ = app.emit_to(LABEL, "eucatur-aviso", aviso);
    let turn = SHOWN.fetch_add(1, Ordering::Relaxed) + 1;
    let hwnd = raw(&window);
    let lasts = if aviso.urgent { SHOWS_URGENT } else { SHOWS };
    place(&window);
    std::thread::spawn(move || {
        std::thread::sleep(DRAWS);
        if SHOWN.load(Ordering::Relaxed) == turn {
            westplay_host::overlay::show(hwnd);
        }
        std::thread::sleep(lasts);
        if SHOWN.load(Ordering::Relaxed) == turn {
            westplay_host::overlay::hide(hwnd);
        }
    });
}
