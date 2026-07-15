//! Windows desktop-layer integration.
//!
//! Explorer owns a hidden WorkerW window between the wallpaper and normal
//! top-level applications. Parenting the widget to that window gives the
//! expected desktop-widget behaviour without affecting the other two modes.

#[cfg(target_os = "windows")]
mod windows_impl {
    use std::{ffi::OsStr, os::windows::ffi::OsStrExt, ptr};

    type Hwnd = *mut core::ffi::c_void;
    type Bool = i32;
    type EnumWindowsProc = Option<unsafe extern "system" fn(Hwnd, isize) -> Bool>;

    const WM_SPAWN_WORKER: u32 = 0x052C;
    const SMTO_NORMAL: u32 = 0x0000;
    const SWP_NOSIZE: u32 = 0x0001;
    const SWP_NOMOVE: u32 = 0x0002;
    const SWP_NOZORDER: u32 = 0x0004;
    const SWP_FRAMECHANGED: u32 = 0x0020;

    #[link(name = "user32")]
    extern "system" {
        fn FindWindowW(class_name: *const u16, window_name: *const u16) -> Hwnd;
        fn FindWindowExW(parent: Hwnd, child_after: Hwnd, class_name: *const u16, window_name: *const u16) -> Hwnd;
        fn EnumWindows(callback: EnumWindowsProc, lparam: isize) -> Bool;
        fn SendMessageTimeoutW(hwnd: Hwnd, message: u32, wparam: usize, lparam: isize, flags: u32, timeout: u32, result: *mut usize) -> isize;
        fn SetParent(child: Hwnd, new_parent: Hwnd) -> Hwnd;
        fn SetWindowPos(hwnd: Hwnd, insert_after: Hwnd, x: i32, y: i32, width: i32, height: i32, flags: u32) -> Bool;
    }

    fn wide(value: &str) -> Vec<u16> {
        OsStr::new(value).encode_wide().chain(Some(0)).collect()
    }

    unsafe extern "system" fn find_worker(window: Hwnd, output: isize) -> Bool {
        let shell_view = FindWindowExW(window, ptr::null_mut(), wide("SHELLDLL_DefView").as_ptr(), ptr::null());
        if !shell_view.is_null() {
            let worker = FindWindowExW(ptr::null_mut(), window, wide("WorkerW").as_ptr(), ptr::null());
            if !worker.is_null() {
                *(output as *mut Hwnd) = worker;
                return 0;
            }
        }
        1
    }

    unsafe fn worker_window() -> Option<Hwnd> {
        let progman = FindWindowW(wide("Progman").as_ptr(), ptr::null());
        if progman.is_null() {
            return None;
        }

        let mut result = 0usize;
        // Both variants are used by Explorer versions in the wild. Calling
        // them is harmless if the backing WorkerW already exists.
        let _ = SendMessageTimeoutW(progman, WM_SPAWN_WORKER, 0xD, 0, SMTO_NORMAL, 1000, &mut result);
        let _ = SendMessageTimeoutW(progman, WM_SPAWN_WORKER, 0xD, 1, SMTO_NORMAL, 1000, &mut result);
        let _ = SendMessageTimeoutW(progman, WM_SPAWN_WORKER, 0, 0, SMTO_NORMAL, 1000, &mut result);

        let mut worker: Hwnd = ptr::null_mut();
        EnumWindows(Some(find_worker), &mut worker as *mut Hwnd as isize);
        (!worker.is_null()).then_some(worker)
    }

    pub fn attach(window: &tauri::WebviewWindow) -> Result<(), String> {
        let hwnd = window.hwnd().map_err(|error| error.to_string())?.0;
        let worker = unsafe { worker_window() }.ok_or_else(|| "Windows desktop layer was not found".to_string())?;
        unsafe {
            SetParent(hwnd, worker);
            SetWindowPos(hwnd, ptr::null_mut(), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);
        }
        Ok(())
    }

    pub fn detach(window: &tauri::WebviewWindow) -> Result<(), String> {
        let hwnd = window.hwnd().map_err(|error| error.to_string())?.0;
        unsafe {
            SetParent(hwnd, ptr::null_mut());
            SetWindowPos(hwnd, ptr::null_mut(), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);
        }
        Ok(())
    }
}

#[cfg(target_os = "windows")]
pub use windows_impl::{attach, detach};

#[cfg(not(target_os = "windows"))]
pub fn attach(_window: &tauri::WebviewWindow) -> Result<(), String> { Ok(()) }

#[cfg(not(target_os = "windows"))]
pub fn detach(_window: &tauri::WebviewWindow) -> Result<(), String> { Ok(()) }

