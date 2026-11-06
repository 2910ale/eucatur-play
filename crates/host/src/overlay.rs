//! Eucatur Play (nov/2026): the window of Eucatur warnings over the game. The app makes it (a see-through
//! Tauri window that lets the mouse through); these make it never take the keyboard or the game's place in
//! front: it's a tool window that isn't activated, shown and hidden without activating it.
//!
//! The window is the app's, given here as its raw `HWND` (Tauri's own `windows` crate may be another version).

use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{
    GWL_EXSTYLE, GetWindowLongPtrW, HWND_TOPMOST, SW_HIDE, SW_SHOWNOACTIVATE, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
    SWP_SHOWWINDOW, SetWindowLongPtrW, SetWindowPos, ShowWindow, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
};

fn hwnd(raw: isize) -> HWND {
    HWND(raw as *mut core::ffi::c_void)
}

/// Makes the window one that's never activated and isn't in the taskbar or Alt+Tab.
pub fn prepare(raw: isize) {
    if raw == 0 {
        return;
    }
    // SAFETY: the app's own window, alive while it calls; only its extended style is changed.
    unsafe {
        let style = GetWindowLongPtrW(hwnd(raw), GWL_EXSTYLE);
        let _ = SetWindowLongPtrW(hwnd(raw), GWL_EXSTYLE, style | (WS_EX_NOACTIVATE.0 | WS_EX_TOOLWINDOW.0) as isize);
    }
}

/// Shows the window on top of everything (the game too) without activating it: the game keeps the keyboard.
pub fn show(raw: isize) {
    if raw == 0 {
        return;
    }
    // SAFETY: the app's own window; shown and put on top, neither moved, sized nor activated.
    unsafe {
        let _ = ShowWindow(hwnd(raw), SW_SHOWNOACTIVATE);
        let _ = SetWindowPos(
            hwnd(raw),
            Some(HWND_TOPMOST),
            0,
            0,
            0,
            0,
            SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
        );
    }
}

/// Hides the window.
pub fn hide(raw: isize) {
    if raw == 0 {
        return;
    }
    // SAFETY: the app's own window, only hidden.
    unsafe {
        let _ = ShowWindow(hwnd(raw), SW_HIDE);
    }
}
