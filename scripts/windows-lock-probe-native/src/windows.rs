use std::ffi::c_void;
use std::mem::size_of;
use std::ptr::null_mut;
use std::thread::sleep;
use std::time::{Duration, Instant};

use serde::Serialize;
use windows_sys::Win32::Foundation::{ERROR_FILE_NOT_FOUND, ERROR_PATH_NOT_FOUND, ERROR_SUCCESS};
use windows_sys::Win32::System::Registry::{
    HKEY_LOCAL_MACHINE, RRF_RT_REG_DWORD, RRF_SUBKEY_WOW6464KEY, RegGetValueW,
};
use windows_sys::Win32::System::RemoteDesktop::{
    ProcessIdToSessionId, WTS_CURRENT_SESSION, WTS_SESSIONSTATE_LOCK, WTS_SESSIONSTATE_UNLOCK,
    WTSActive, WTSFreeMemory, WTSGetActiveConsoleSessionId, WTSINFOEX_LEVEL1_W, WTSINFOEXW,
    WTSQuerySessionInformationW, WTSSessionInfoEx,
};
use windows_sys::core::{PCWSTR, w};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Observation {
    status: ObservationStatus,
    before: Option<LockState>,
    saw_lock: bool,
    after: Option<LockState>,
}

#[derive(Serialize)]
#[serde(rename_all = "kebab-case")]
enum ObservationStatus {
    Observed,
    TimedOut,
    InitiallyLocked,
    ConsoleChanged,
    SessionChanged,
    SessionUnavailable,
}

#[derive(Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
enum LockState {
    Locked,
    Unlocked,
}

struct SessionBuffer(*mut u16);

impl Drop for SessionBuffer {
    fn drop(&mut self) {
        if !self.0.is_null() {
            // The WTS query allocates this buffer and requires WTSFreeMemory.
            unsafe { WTSFreeMemory(self.0.cast()) };
        }
    }
}

fn sample(session_id: u32) -> Result<WTSINFOEX_LEVEL1_W, ObservationStatus> {
    if session_id == 0 || unsafe { WTSGetActiveConsoleSessionId() } != session_id {
        return Err(ObservationStatus::ConsoleChanged);
    }
    let mut buffer = SessionBuffer(null_mut());
    let mut bytes = 0;
    // WTS_CURRENT_SESSION scopes the query to the calling process. The buffer stays live below.
    let queried = unsafe {
        WTSQuerySessionInformationW(
            null_mut(),
            WTS_CURRENT_SESSION,
            WTSSessionInfoEx,
            &mut buffer.0,
            &mut bytes,
        )
    };
    if queried == 0 || buffer.0.is_null() || (bytes as usize) < size_of::<WTSINFOEXW>() {
        return Err(ObservationStatus::SessionUnavailable);
    }
    // The successful query returned a complete WTSINFOEXW. Check the tag before reading its union.
    let info = unsafe { &*buffer.0.cast::<WTSINFOEXW>() };
    if info.Level != 1 {
        return Err(ObservationStatus::SessionUnavailable);
    }
    let session = unsafe { info.Data.WTSInfoExLevel1 };
    if unsafe { WTSGetActiveConsoleSessionId() } != session_id || session.SessionId != session_id {
        return Err(ObservationStatus::ConsoleChanged);
    }
    if session.SessionState != WTSActive || session.LogonTime <= 0 || session.UserName[0] == 0 {
        return Err(ObservationStatus::SessionUnavailable);
    }
    Ok(session)
}

fn lock_state(session: &WTSINFOEX_LEVEL1_W) -> Result<LockState, ObservationStatus> {
    match session.SessionFlags as u32 {
        WTS_SESSIONSTATE_LOCK => Ok(LockState::Locked),
        WTS_SESSIONSTATE_UNLOCK => Ok(LockState::Unlocked),
        _ => Err(ObservationStatus::SessionUnavailable),
    }
}

fn wait_for_unlock(observation: &mut Observation) -> Result<ObservationStatus, ObservationStatus> {
    let mut session_id = 0;
    // The output pointer is writable and std supplies the caller's own process ID.
    if unsafe { ProcessIdToSessionId(std::process::id(), &mut session_id) } == 0 {
        return Err(ObservationStatus::SessionUnavailable);
    }
    let baseline = sample(session_id)?;
    let before = lock_state(&baseline)?;
    observation.before = Some(before);
    if before != LockState::Unlocked {
        return Ok(ObservationStatus::InitiallyLocked);
    }

    eprintln!("ready");
    let deadline = Instant::now() + Duration::from_secs(120);
    while Instant::now() < deadline {
        let next = sample(session_id)?;
        if next.ConnectTime != baseline.ConnectTime
            || next.DisconnectTime != baseline.DisconnectTime
        {
            return Err(ObservationStatus::ConsoleChanged);
        }
        if next.LogonTime != baseline.LogonTime
            || next.UserName != baseline.UserName
            || next.DomainName != baseline.DomainName
        {
            return Err(ObservationStatus::SessionChanged);
        }
        match lock_state(&next)? {
            LockState::Locked => observation.saw_lock = true,
            LockState::Unlocked if observation.saw_lock => {
                observation.after = Some(LockState::Unlocked);
                return Ok(ObservationStatus::Observed);
            }
            LockState::Unlocked => {}
        }
        sleep(Duration::from_millis(250));
    }
    Ok(ObservationStatus::TimedOut)
}

pub fn observe_lock() -> Observation {
    let mut observation = Observation {
        status: ObservationStatus::SessionUnavailable,
        before: None,
        saw_lock: false,
        after: None,
    };
    observation.status = wait_for_unlock(&mut observation).unwrap_or_else(|status| status);
    observation
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Policy {
    disable_cad: PolicyValue,
    software_sas_generation: PolicyValue,
}

#[derive(Serialize)]
#[serde(tag = "status", rename_all = "kebab-case")]
enum PolicyValue {
    Read { value: u32 },
    Missing,
    Unavailable { code: u32 },
}

fn read_dword(name: PCWSTR) -> PolicyValue {
    let mut value = 0_u32;
    let mut size = size_of::<u32>() as u32;
    // The name and subkey are NUL-terminated. The output buffer is one DWORD.
    let code = unsafe {
        RegGetValueW(
            HKEY_LOCAL_MACHINE,
            w!("SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System"),
            name,
            RRF_RT_REG_DWORD | RRF_SUBKEY_WOW6464KEY,
            null_mut(),
            (&mut value as *mut u32).cast::<c_void>(),
            &mut size,
        )
    };
    match code {
        ERROR_SUCCESS => PolicyValue::Read { value },
        ERROR_FILE_NOT_FOUND | ERROR_PATH_NOT_FOUND => PolicyValue::Missing,
        code => PolicyValue::Unavailable { code },
    }
}

pub fn read_policy() -> Policy {
    Policy {
        disable_cad: read_dword(w!("DisableCAD")),
        software_sas_generation: read_dword(w!("SoftwareSASGeneration")),
    }
}
