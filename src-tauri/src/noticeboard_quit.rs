use std::{collections::HashSet, sync::Mutex};
use tauri::{Emitter, Manager};

// 편집기 창(알림장·명단)에 "저장하고 잠가 달라"고 요청한 이유.
// 왜 구분하는가: 트레이 "종료"와 업데이트 설치가 같은 저장·잠금 절차를 쓰지만,
//   모두 허락한 뒤의 다음 단계(앱 종료 / 설치 프로그램 실행)가 다르기 때문입니다.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Purpose {
    Quit,
    Update,
}
struct Pending {
    id: String,
    remaining: HashSet<String>,
    purpose: Purpose,
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
    start(app, Purpose::Quit).is_some()
}
// 업데이트 설치 직전: 편집기 창에 종료와 같은 "저장 후 잠금"을 요청합니다.
// 편집기 창이 하나도 없으면 None을 돌려줍니다(기다릴 대상이 없습니다).
pub(crate) fn request_for_update(app: &tauri::AppHandle) -> Option<String> {
    start(app, Purpose::Update)
}
fn start(app: &tauri::AppHandle, purpose: Purpose) -> Option<String> {
    let windows: Vec<_> = ["noticeboard", "roster", "seating", "seating-teacher"]
        .iter()
        .filter_map(|label| app.get_webview_window(label))
        .collect();
    if windows.is_empty() {
        return None;
    }
    let id = uuid::Uuid::new_v4().to_string();
    // 답이 방송보다 먼저 도착해도 놓치지 않도록, 방송하기 전에 업데이트 쪽에 요청 번호를 알립니다.
    if purpose == Purpose::Update {
        crate::app_update::expect_editors(&id);
    }
    let replaced = PENDING.lock().ok().and_then(|mut p| {
        p.replace(Pending {
            id: id.clone(),
            remaining: windows.iter().map(|w| w.label().to_string()).collect(),
            purpose,
        })
    });
    // 업데이트 준비 중에 "종료"를 누르면 종료가 이깁니다. 업데이트가 시간 초과까지 기다리지 않게 바로 알립니다.
    if let Some(old) = replaced {
        if old.purpose == Purpose::Update {
            crate::app_update::editors_settled(&old.id, false);
        }
    }
    for win in windows {
        let event = if ["roster", "seating", "seating-teacher"].contains(&win.label()) {
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
    Some(id)
}
pub fn cancel(app: &tauri::AppHandle) {
    let previous = PENDING.lock().ok().and_then(|mut p| p.take());
    let _ = app.emit("noticeboard-quit-cancel", ());
    if let Some(old) = previous {
        if old.purpose == Purpose::Update {
            crate::app_update::editors_settled(&old.id, false);
        }
    }
}
// 업데이트가 중간에 멈췄을 때 편집기 잠금을 풉니다.
// 왜 번호를 확인하는가: 그 사이 사용자가 누른 트레이 "종료" 요청까지 취소하면 안 되기 때문입니다.
//   (확인과 해제를 한 번의 잠금 안에서 해야, 그 틈에 들어온 "종료" 요청을 지우지 않습니다)
pub(crate) fn cancel_update(app: &tauri::AppHandle, request_id: &str) {
    let taken = PENDING.lock().ok().and_then(|mut p| {
        let is_ours = p
            .as_ref()
            .is_some_and(|p| p.purpose == Purpose::Update && p.id == request_id);
        if is_ours {
            p.take()
        } else {
            None
        }
    });
    if taken.is_some() {
        let _ = app.emit("noticeboard-quit-cancel", ());
    }
}
#[tauri::command]
pub fn noticeboard_cancel_quit(app: tauri::AppHandle, window: tauri::WebviewWindow) {
    if ["noticeboard", "roster", "seating", "seating-teacher"].contains(&window.label()) {
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
    let mut purpose = Purpose::Quit;
    if let Ok(mut guard) = PENDING.lock() {
        if let Some(ref mut pending) = *guard {
            (finish, reject) = pending.reply(&request_id, window.label(), allow);
            purpose = pending.purpose;
        }
    }
    if reject {
        cancel(&app);
        let _ = window.show();
        let _ = window.set_focus();
    }
    if finish {
        match purpose {
            Purpose::Quit => crate::classroom::finish_quit(app),
            Purpose::Update => crate::app_update::editors_settled(&request_id, true),
        }
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
            purpose: Purpose::Quit,
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
