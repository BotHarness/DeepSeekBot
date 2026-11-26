mod windows;

use serde::Serialize;

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct Steps {
    lock_observation: Option<windows::Observation>,
    policy: Option<windows::Policy>,
}

fn main() -> Result<(), &'static str> {
    let mut observe_lock = false;
    let mut read_policy = false;
    for arg in std::env::args_os().skip(1) {
        match arg.to_str() {
            Some("--observe-lock") if !observe_lock => observe_lock = true,
            Some("--read-policy") if !read_policy => read_policy = true,
            _ => return Err("Invalid probe switch"),
        }
    }
    if !observe_lock && !read_policy {
        return Err("Select an observation or policy read");
    }

    let policy = read_policy.then(windows::read_policy);
    let lock_observation = observe_lock.then(windows::observe_lock);
    let steps = Steps {
        policy,
        lock_observation,
    };
    serde_json::to_writer(std::io::stdout().lock(), &steps).map_err(|_| "Could not write report")
}
