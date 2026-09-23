//! Only explicitly saved lists and preferences persist. Draws never cross this boundary.
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, sync::Mutex};
use tauri::Manager;
use tauri_plugin_store::StoreExt;
// 업데이트 설치 직전에 app_update가 잡아, 쓰는 도중에 앱이 끝나지 않게 합니다.
pub(crate) static LOCK: Mutex<()> = Mutex::new(());
const FILE: &str = "tidy-task-picker.json";
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Entry { id: String, name: String, number: u32 }
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct List { id: String, name: String, kind: String, entries: Vec<Entry> }
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Preferences { sound: bool, reduced: bool }
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Library { schema_version: u32, revision: u64, preferences: Preferences, lists: Vec<List> }
fn defaults() -> Library { Library { schema_version: 1, revision: 0, preferences: Preferences { sound: true, reduced: false }, lists: vec![] } }
fn valid_name(s: &str, max: usize) -> bool { !s.trim().is_empty() && s.chars().count() <= max && !s.chars().any(|c| c.is_control()) }
fn validate(v: &Library) -> Result<(), String> {
    if v.schema_version != 1 || v.lists.len() > 100 { return Err("지원하지 않는 뽑기 자료입니다. 원본을 보존합니다.".into()); }
    let mut ids = HashSet::new();
    for l in &v.lists {
        if !valid_name(&l.id, 80) || !ids.insert(&l.id) || !valid_name(&l.name, 80) || !matches!(l.kind.as_str(), "groups" | "custom") || l.entries.is_empty() || l.entries.len() > 500 { return Err("저장 목록 형식을 확인해 주세요.".into()); }
        let mut entries = HashSet::new();
        for e in &l.entries { if !valid_name(&e.id, 80) || !entries.insert(&e.id) || !valid_name(&e.name, 40) || e.number == 0 { return Err("목록 항목을 확인해 주세요.".into()); } }
    }
    Ok(())
}
fn read(app: &tauri::AppHandle) -> Result<Library, String> {
    // Validate disk before the store plugin can replace malformed JSON with defaults.
    let path = app.path().app_data_dir().map_err(|e| e.to_string())?.join(FILE);
    if path.exists() {
        let bytes = std::fs::read(path).map_err(|_| "뽑기 자료를 읽지 못했어요.".to_string())?;
        let raw: serde_json::Value = serde_json::from_slice(&bytes).map_err(|_| "뽑기 자료가 손상됐어요. 원본을 보존합니다.".to_string())?;
        if !raw.is_object() { return Err("뽑기 자료 형식이 달라요. 원본을 보존합니다.".into()); }
        if let Some(data) = raw.get("library") {
            let disk: Library = serde_json::from_value(data.clone()).map_err(|_| "지원하지 않는 뽑기 자료입니다.".to_string())?;
            validate(&disk)?;
        } else if !raw.as_object().is_some_and(|o| o.is_empty()) { return Err("뽑기 자료 형식이 달라요. 원본을 보존합니다.".into()); }
    }
    let store = app.store(FILE).map_err(|e| e.to_string())?;
    let v = match store.get("library") { Some(v) => serde_json::from_value(v).map_err(|_| "뽑기 자료를 읽지 못했어요.".to_string())?, None => defaults() };
    validate(&v)?; Ok(v)
}
#[tauri::command]
pub fn picker_read(app: tauri::AppHandle) -> Result<Library, String> { let _g = LOCK.lock().map_err(|_| "저장 잠금 오류")?; read(&app) }
#[tauri::command]
pub fn picker_write(app: tauri::AppHandle, mut value: Library) -> Result<Library, String> {
    let _g = LOCK.lock().map_err(|_| "저장 잠금 오류")?;
    validate(&value)?;
    let old = read(&app)?;
    if old.revision != value.revision { return Err("저장 목록이 변경됐어요. 목록을 다시 불러와 주세요.".into()); }
    value.revision = value.revision.checked_add(1).ok_or("저장 버전 오류")?;
    let store = app.store(FILE).map_err(|e| e.to_string())?;
    store.set("library", serde_json::to_value(&value).map_err(|e| e.to_string())?);
    if let Err(e) = store.save() { store.set("library", serde_json::to_value(old).map_err(|e| e.to_string())?); return Err(e.to_string()); }
    Ok(value)
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn rejects_future_and_runtime_data() { let mut v = defaults(); v.schema_version = 2; assert!(validate(&v).is_err()); let mut json=serde_json::to_value(defaults()).unwrap(); json["history"]=serde_json::json!([]); assert!(serde_json::from_value::<Library>(json).is_err()); }
    #[test] fn duplicates_are_identified_by_id_not_name() { let mut v=defaults(); v.lists.push(List{id:"l".into(),name:"목록".into(),kind:"custom".into(),entries:vec![Entry{id:"a".into(),name:"동명".into(),number:1},Entry{id:"b".into(),name:"동명".into(),number:2}]}); assert!(validate(&v).is_ok()); v.lists[0].entries[1].id="a".into(); assert!(validate(&v).is_err()); }
}
