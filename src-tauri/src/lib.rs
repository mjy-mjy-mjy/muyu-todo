mod desktop;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WebviewWindow,
};
use tauri_plugin_autostart::MacosLauncher;

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[tauri::command]
fn set_window_mode(window: WebviewWindow, mode: String) -> Result<(), String> {
    match mode.as_str() {
        "desktop" => {
            let _ = desktop::detach(&window);
            window.set_always_on_top(false).map_err(|error| error.to_string())?;
            window.set_skip_taskbar(true).map_err(|error| error.to_string())?;
            if let Err(error) = desktop::attach(&window) {
                // The WorkerW layer can be briefly unavailable while Explorer
                // restarts. Always-on-bottom is a safe visual fallback.
                window.set_always_on_bottom(true).map_err(|fallback| format!("{error}; fallback failed: {fallback}"))?;
            }
        }
        "normal" => {
            desktop::detach(&window)?;
            window.set_always_on_bottom(false).map_err(|error| error.to_string())?;
            window.set_always_on_top(false).map_err(|error| error.to_string())?;
            window.set_skip_taskbar(false).map_err(|error| error.to_string())?;
        }
        "pinned" => {
            desktop::detach(&window)?;
            window.set_always_on_bottom(false).map_err(|error| error.to_string())?;
            window.set_always_on_top(true).map_err(|error| error.to_string())?;
            window.set_skip_taskbar(true).map_err(|error| error.to_string())?;
        }
        _ => return Err("Unknown window mode".into()),
    }
    let _ = window.show();
    Ok(())
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .invoke_handler(tauri::generate_handler![set_window_mode, quit_app])
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "显示木鱼清单", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            let mut tray = TrayIconBuilder::new()
                .tooltip("木鱼清单")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        show_main(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Muyu Todo");
}

