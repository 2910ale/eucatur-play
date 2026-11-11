//! Eucatur Play (nov/2026): "abre uma vez só, depois não abre mais — só reiniciando o PC".
//!
//! A second Eucatur Play (the player opening it again) used to show "already running" and quit. The one
//! running may be hidden (its window closed, kept alive by another window), run as administrator (the
//! normal one can't reach it), or stuck. So the second one now:
//!  1. asks the running one to show its window (a named event both can open, normal or administrator), and
//!     waits a few seconds for its answer;
//!  2. without an answer, the running one is stuck: it ends it (every other `westplay.exe` of this user that
//!     it can) and starts in its place.

use std::time::Duration;

use windows::Win32::Foundation::{CloseHandle, HANDLE, WAIT_OBJECT_0};
use windows::Win32::System::Threading::{
    CreateEventW, EVENT_MODIFY_STATE, INFINITE, OpenEventW, SYNCHRONIZATION_SYNCHRONIZE, SetEvent, WaitForSingleObject,
};
use windows::core::w;

/// Raised by a second Eucatur Play: "show your window".
const SHOW: windows::core::PCWSTR = w!(r"Local\EucaturPlay.Mostrar");
/// Raised by the running one once it showed its window.
const SHOWN: windows::core::PCWSTR = w!(r"Local\EucaturPlay.Mostrado");
/// How long the second one waits for the running one to answer.
const ANSWER: Duration = Duration::from_secs(4);

fn event(name: windows::core::PCWSTR) -> Option<HANDLE> {
    // Auto-reset, open to the PC's users at medium integrity (with_users_access): a normal Eucatur Play can
    // raise the one of an Eucatur Play run as administrator, and the other way round.
    westplay_shared::with_users_access(|attributes| unsafe { CreateEventW(attributes, false, false, name) }).ok()
}

/// The running Eucatur Play: listens for a second one asking it to show, on its own thread, and calls `show`.
pub fn listen(show: impl Fn() + Send + 'static) {
    let (Some(asked), Some(answer)) = (event(SHOW), event(SHOWN)) else {
        crate::log!("[instancia] the events for a second Eucatur Play couldn't be made");
        return;
    };
    let (asked, answer) = (asked.0 as isize, answer.0 as isize);
    std::thread::spawn(move || {
        let (asked, answer) = (HANDLE(asked as *mut _), HANDLE(answer as *mut _));
        loop {
            // SAFETY: the events this process made, kept open for its whole life.
            if unsafe { WaitForSingleObject(asked, INFINITE) } != WAIT_OBJECT_0 {
                return;
            }
            crate::log!("[instancia] Eucatur Play was opened again: showing the window");
            show();
            // SAFETY: as above.
            let _ = unsafe { SetEvent(answer) };
        }
    });
}

/// A second Eucatur Play: asks the running one to show. Whether it answered (then this one just quits).
pub fn ask_to_show() -> bool {
    // SAFETY: events opened by name and closed below; the waits are bounded.
    unsafe {
        let Ok(asked) = OpenEventW(EVENT_MODIFY_STATE, false, SHOW) else { return false };
        let answer = OpenEventW(SYNCHRONIZATION_SYNCHRONIZE, false, SHOWN).ok();
        let _ = SetEvent(asked);
        let answered = answer.is_some_and(|a| WaitForSingleObject(a, ANSWER.as_millis() as u32) == WAIT_OBJECT_0);
        let _ = CloseHandle(asked);
        if let Some(a) = answer {
            let _ = CloseHandle(a);
        }
        answered
    }
}

/// Ends the other Eucatur Plays (same program, not this process) that it can: a stuck one. How many ended.
pub fn end_others() -> usize {
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW, TH32CS_SNAPPROCESS,
    };
    use windows::Win32::System::Threading::{GetCurrentProcessId, OpenProcess, PROCESS_TERMINATE, TerminateProcess};
    let Ok(me) = std::env::current_exe() else { return 0 };
    let Some(name) = me.file_name().map(|n| n.to_string_lossy().to_string()) else { return 0 };
    let mut ended = 0;
    // SAFETY: a snapshot of the PC's processes, closed below; each process opened is closed after.
    unsafe {
        let Ok(snapshot) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else { return 0 };
        let mut entry = PROCESSENTRY32W { dwSize: size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
        let mut more = Process32FirstW(snapshot, &mut entry).is_ok();
        let own = GetCurrentProcessId();
        while more {
            let length = entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(entry.szExeFile.len());
            let exe = String::from_utf16_lossy(&entry.szExeFile[..length]);
            if entry.th32ProcessID != own && exe.eq_ignore_ascii_case(&name) {
                if let Ok(process) = OpenProcess(PROCESS_TERMINATE, false, entry.th32ProcessID) {
                    if TerminateProcess(process, 1).is_ok() {
                        ended += 1;
                    }
                    let _ = CloseHandle(process);
                }
            }
            more = Process32NextW(snapshot, &mut entry).is_ok();
        }
        let _ = CloseHandle(snapshot);
    }
    ended
}

/// Tells the player, in Portuguese, that Eucatur Play is open but couldn't be brought up (run as administrator
/// by Windows, so a normal one can't end it).
pub fn tell_cant_show() {
    use windows::Win32::UI::WindowsAndMessaging::{MB_ICONINFORMATION, MB_OK, MessageBoxW};
    // SAFETY: a message box with static strings, no owner window.
    unsafe {
        MessageBoxW(
            None,
            w!("O Eucatur Play já está aberto, mas não respondeu.\n\nProcure o ícone dele perto do relógio do Windows. Se não achar, abra o Gerenciador de Tarefas (Ctrl+Shift+Esc), finalize \"westplay.exe\" e abra o Eucatur Play de novo."),
            w!("Eucatur Play"),
            MB_OK | MB_ICONINFORMATION,
        );
    }
}
