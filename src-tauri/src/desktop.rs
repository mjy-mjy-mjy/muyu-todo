//! Safe desktop-layer behaviour.
//!
//! Older builds attached the app window to Explorer's undocumented WorkerW
//! hierarchy. Explorer owns those windows, so a forced app exit could leave an
//! empty shell window behind. Keeping a normal top-level window at the bottom
//! provides the intended desktop-widget behaviour without mutating Explorer.

pub fn attach(window: &tauri::WebviewWindow) -> Result<(), String> {
    window
        .set_always_on_top(false)
        .map_err(|error| error.to_string())?;
    window
        .set_always_on_bottom(true)
        .map_err(|error| error.to_string())?;
    window
        .set_skip_taskbar(true)
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn detach(window: &tauri::WebviewWindow) -> Result<(), String> {
    window
        .set_always_on_bottom(false)
        .map_err(|error| error.to_string())
}
