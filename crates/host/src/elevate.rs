//! Eucatur Play (2026-11): a game run as administrator, without changing the game or Steam.
//!
//! Windows doesn't let a program run normally read a program run as administrator, so with the game run that way
//! Eucatur Play couldn't see its route, guidance or weather. Then Eucatur Play starts itself again as
//! administrator too. So that Windows asks only once (not each time), it does that through a task in the
//! Task Scheduler ("Eucatur Play\Administrador", "run with highest privileges"), made the first time with the
//! player's yes to Windows' prompt; started again later, the task runs with no prompt.
//!
//! Only ever when the game runs as administrator, only once for each start of Eucatur Play, and never by an
//! Eucatur Play the task started (no loop, should the task not give administrator rights: a PC user who
//! isn't an administrator).

use std::os::windows::process::CommandExt;
use std::path::Path;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};

/// The argument Eucatur Play is started with by the task.
pub const ELEVATED_ARGUMENT: &str = "--eucatur-administrador";
/// The task in the Task Scheduler (in its "Eucatur Play" folder).
const TASK: &str = r"\Eucatur Play\Administrador";
/// Programs run without a console window showing.
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Tried already in this run (or started by the task, or the player said no): not again.
static DONE: AtomicBool = AtomicBool::new(false);

/// For `main`: Eucatur Play was started by the task (it then waits for the one before it to end).
pub fn started_by_task(args: &[String]) -> bool {
    let by_task = args.iter().any(|a| a == ELEVATED_ARGUMENT);
    if by_task {
        DONE.store(true, Ordering::Relaxed);
    }
    by_task
}

/// Whether Eucatur Play itself runs as administrator.
pub fn is_self_elevated() -> bool {
    use windows::Win32::Foundation::{CloseHandle, HANDLE};
    use windows::Win32::Security::{GetTokenInformation, TOKEN_ELEVATION, TOKEN_QUERY, TokenElevation};
    use windows::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};
    // SAFETY: the process's own token, opened and closed once; `elevation` and `length` are locals the call
    // writes, its size given.
    unsafe {
        let mut token = HANDLE::default();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token).is_err() {
            return false;
        }
        let mut elevation = TOKEN_ELEVATION::default();
        let mut length = 0;
        let read = GetTokenInformation(
            token,
            TokenElevation,
            Some((&raw mut elevation).cast()),
            size_of::<TOKEN_ELEVATION>() as u32,
            &mut length,
        );
        let _ = CloseHandle(token);
        read.is_ok() && elevation.TokenIsElevated != 0
    }
}

/// The game was found run as administrator: Eucatur Play starts itself again as administrator (on its own
/// thread: Windows' prompt, the first time, waits for the player). On success this Eucatur Play ends.
pub fn game_is_elevated() {
    if DONE.swap(true, Ordering::Relaxed) || is_self_elevated() {
        return;
    }
    std::thread::spawn(|| match restart_elevated() {
        Ok(()) => {
            log!("[administrador] Eucatur Play starts again as administrator (the game runs as administrator)");
            std::process::exit(0);
        }
        Err(why) => log!("[administrador] it couldn't start again as administrator: {why}"),
    });
}

fn restart_elevated() -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    if !task_is_for(&exe) {
        make_task(&exe)?;
    }
    let ran = schtasks(&["/Run", "/TN", TASK])?;
    if ran { Ok(()) } else { Err("the task wouldn't run".into()) }
}

/// Runs `schtasks` (hidden): whether it succeeded.
fn schtasks(args: &[&str]) -> Result<bool, String> {
    Command::new("schtasks.exe")
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map(|out| out.status.success())
        .map_err(|e| e.to_string())
}

/// Whether the task is there and starts this Eucatur Play (its path: an Eucatur Play installed elsewhere
/// needs it made again).
fn task_is_for(exe: &Path) -> bool {
    let Ok(out) = Command::new("schtasks.exe")
        .args(["/Query", "/TN", TASK, "/XML"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
    else {
        return false;
    };
    if !out.status.success() {
        return false;
    }
    // The XML comes out in the console's code page or as UTF-16: looked for both ways.
    let wanted = xml_escape(&exe.to_string_lossy()).to_lowercase();
    let as_text = String::from_utf8_lossy(&out.stdout).to_lowercase();
    let as_utf16 = {
        let units: Vec<u16> = out.stdout.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
        String::from_utf16_lossy(&units).to_lowercase()
    };
    as_text.contains(&wanted) || as_utf16.contains(&wanted)
}

/// Makes the task, as administrator (Windows asks the player, this once).
fn make_task(exe: &Path) -> Result<(), String> {
    let user = match (std::env::var("USERDOMAIN"), std::env::var("USERNAME")) {
        (Ok(domain), Ok(name)) if !domain.is_empty() => format!("{domain}\\{name}"),
        (_, Ok(name)) => name,
        _ => return Err("the Windows user isn't known".into()),
    };
    let xml = task_xml(&exe.to_string_lossy(), &user);
    let file = std::env::temp_dir().join("eucatur-play-administrador.xml");
    // UTF-16 with its mark, as the Task Scheduler reads it.
    let mut bytes = vec![0xFF, 0xFE];
    for unit in xml.encode_utf16() {
        bytes.extend_from_slice(&unit.to_le_bytes());
    }
    std::fs::write(&file, bytes).map_err(|e| e.to_string())?;
    let arguments = format!("/Create /TN \"{TASK}\" /XML \"{}\" /F", file.display());
    let made = run_as_administrator("schtasks.exe", &arguments);
    let _ = std::fs::remove_file(&file);
    match made {
        Ok(0) => Ok(()),
        Ok(code) => Err(format!("schtasks ended with {code}")),
        Err(why) => Err(why),
    }
}

/// Runs `program` with `arguments` as administrator (Windows' prompt), hidden, waited for: its exit code.
fn run_as_administrator(program: &str, arguments: &str) -> Result<u32, String> {
    use windows::Win32::Foundation::{CloseHandle, ERROR_CANCELLED, WAIT_OBJECT_0};
    use windows::Win32::System::Threading::{GetExitCodeProcess, INFINITE, WaitForSingleObject};
    use windows::Win32::UI::Shell::{SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW, ShellExecuteExW};
    use windows::Win32::UI::WindowsAndMessaging::SW_HIDE;
    use windows::core::{HSTRING, PCWSTR, w};
    let (program, arguments) = (HSTRING::from(program), HSTRING::from(arguments));
    let mut info = SHELLEXECUTEINFOW {
        cbSize: size_of::<SHELLEXECUTEINFOW>() as u32,
        fMask: SEE_MASK_NOCLOSEPROCESS,
        lpVerb: w!("runas"),
        lpFile: PCWSTR(program.as_ptr()),
        lpParameters: PCWSTR(arguments.as_ptr()),
        nShow: SW_HIDE.0,
        ..Default::default()
    };
    // SAFETY: `info` is complete and its strings live through the call.
    if let Err(error) = unsafe { ShellExecuteExW(&mut info) } {
        return Err(if error.code() == ERROR_CANCELLED.to_hresult() {
            "the player said no to Windows' prompt".into()
        } else {
            error.to_string()
        });
    }
    let mut code = 1;
    // SAFETY: the process handle came from the call above (`SEE_MASK_NOCLOSEPROCESS`) and is closed once.
    unsafe {
        if WaitForSingleObject(info.hProcess, INFINITE) == WAIT_OBJECT_0 {
            let _ = GetExitCodeProcess(info.hProcess, &mut code);
        }
        let _ = CloseHandle(info.hProcess);
    }
    Ok(code)
}

fn xml_escape(text: &str) -> String {
    text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

/// The task: started only on demand (no trigger), as the signed-in player, with highest privileges, never
/// stopped for time or battery.
fn task_xml(exe: &str, user: &str) -> String {
    let (exe, user, argument) = (xml_escape(exe), xml_escape(user), ELEVATED_ARGUMENT);
    format!(
        r#"<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Author>Comunidade Eucatur</Author>
    <Description>Abre o Eucatur Play como administrador quando o jogo roda como administrador (sem o aviso do Windows a cada vez).</Description>
  </RegistrationInfo>
  <Triggers />
  <Principals>
    <Principal id="Author">
      <UserId>{user}</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>Parallel</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>false</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>5</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>"{exe}"</Command>
      <Arguments>{argument}</Arguments>
    </Exec>
  </Actions>
</Task>
"#
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_task_starts_this_eucatur_play_with_its_argument() {
        let xml = task_xml(r"C:\Program Files\Eucatur & Cia\westplay.exe", r"PC\Wilber");
        assert!(xml.contains(r#"<Command>"C:\Program Files\Eucatur &amp; Cia\westplay.exe"</Command>"#));
        assert!(xml.contains("<Arguments>--eucatur-administrador</Arguments>"));
        assert!(xml.contains("<RunLevel>HighestAvailable</RunLevel>"));
        assert!(xml.contains(r"<UserId>PC\Wilber</UserId>"));
    }
}
