use std::{collections::HashSet, sync::Mutex};
use tauri::{Emitter, Manager};
struct Pending {
    id: String,
    remaining: HashSet<String>,
}
impl Pending {
    fn reply(&mut self, request_id: &str, label: &str, allow: bool) -> (bool, bool) {
        if self.id != request_id || !self.remaining.remove(label) {
            return (false, false);
        }
        if !allow {
            (false, true)
        } else {
            (self.remaining.is_empty(), false)
        }
    }
}
static PENDING: Mutex<Option<Pending>> = Mutex::new(None);
pub fn pending() -> bool {
    PENDING.lock().map(|p| p.is_some()).unwrap_or(true)
}
pub fn request(app: &tauri::AppHandle) -> bool {
    let windows: Vec<_> = ["noticeboard", "roster"]
        .iter()
        .filter_map(|label| app.get_webview_window(label))
        .collect();
    if windows.is_empty() {
        return false;
    }
    let id = uuid::Uuid::new_v4().to_string();
    if let Ok(mut p) = PENDING.lock() {
        *p = Some(Pending {
            id: id.clone(),
            remaining: windows.iter().map(|w| w.label().to_string()).collect(),
        });
    }
    for win in windows {
        let event = if win.label() == "roster" {
            "classroom-quit-request"
        } else {
            "noticeboard-quit-request"
        };
        if win
            .emit(event, serde_json::json!({"requestId":id}))
            .is_err()
        {
            cancel(app);
            break;
        }
    }
    true
}
pub fn cancel(app: &tauri::AppHandle) {
    if let Ok(mut p) = PENDING.lock() {
        *p = None;
    }
    let _ = app.emit("noticeboard-quit-cancel", ());
}
#[tauri::command]
pub fn noticeboard_cancel_quit(app: tauri::AppHandle, window: tauri::WebviewWindow) {
    if ["noticeboard", "roster"].contains(&window.label()) {
        cancel(&app);
    }
}
#[tauri::command]
pub fn noticeboard_quit_reply(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    request_id: String,
    allow: bool,
) {
    let mut finish = false;
    let mut reject = false;
    if let Ok(mut guard) = PENDING.lock() {
        if let Some(ref mut pending) = *guard {
            (finish, reject) = pending.reply(&request_id, window.label(), allow);
        }
    }
    if reject {
        cancel(&app);
        let _ = window.show();
        let _ = window.set_focus();
    }
    if finish {
        crate::classroom::finish_quit(app);
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn pending() -> Pending {
        Pending {
            id: "current".into(),
            remaining: ["roster".into(), "noticeboard".into()]
                .into_iter()
                .collect(),
        }
    }
    #[test]
    fn both_editors_must_acknowledge() {
        let mut p = pending();
        assert_eq!(p.reply("current", "noticeboard", true), (false, false));
        assert_eq!(p.reply("current", "roster", true), (true, false));
        assert_eq!(p.reply("current", "roster", true), (false, false));
    }
    #[test]
    fn stale_reply_cannot_finish_and_failure_cancels() {
        let mut p = pending();
        assert_eq!(p.reply("old", "roster", true), (false, false));
        assert_eq!(p.remaining.len(), 2);
        assert_eq!(p.reply("current", "noticeboard", false), (false, true));
    }
}
