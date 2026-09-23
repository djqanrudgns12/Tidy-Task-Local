//! Tournament documents have their own revisioned store; the tool reuses one window.
use serde::{Deserialize, Serialize};
use std::{collections::{HashMap, HashSet}, sync::Mutex};
use tauri::Manager;
use tauri_plugin_store::StoreExt;
// 업데이트 설치 직전에 app_update가 잡아, 쓰는 도중에 앱이 끝나지 않게 합니다.
pub(crate) static LOCK: Mutex<()> = Mutex::new(());
const FILE: &str = "tidy-task-tournament.json";
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Entry { id: String, name: String }
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Tournament { id: String, title: String, size: usize, phase: String, slots: Vec<Option<Entry>>, winners: HashMap<String,String>, updated_at: u64 }
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Library { schema_version: u32, revision: u64, tournaments: Vec<Tournament> }
fn defaults() -> Library { Library { schema_version: 1, revision: 0, tournaments: vec![] } }
fn name(s: &str, max: usize) -> bool { !s.trim().is_empty() && s.chars().count() <= max && !s.chars().any(char::is_control) }
fn validate(v: &Library) -> Result<(), String> {
    if v.schema_version != 1 || v.tournaments.len() > 100 { return Err("지원하지 않는 토너먼트 자료입니다. 원본을 보존합니다.".into()); }
    let mut ids = HashSet::new();
    for t in &v.tournaments {
        if !name(&t.id,80) || !ids.insert(&t.id) || !name(&t.title,60) || ![4,8,16,32,64].contains(&t.size) || t.slots.len() != t.size || !matches!(t.phase.as_str(),"edit"|"play") { return Err("대회 정보를 확인해 주세요.".into()); }
        let mut entrants = HashSet::new();
        for e in t.slots.iter().flatten() { if !name(&e.id,80) || !entrants.insert(&e.id) || !name(&e.name,40) { return Err("참가자 자료를 확인해 주세요.".into()); } }
        if t.phase == "play" && entrants.len() < 2 { return Err("참가자가 두 명 이상 필요해요.".into()); }
        // Rebuild the dependency tree, rejecting impossible or stale downstream results.
        let mut previous: Vec<(Option<String>,bool)> = t.slots.iter().map(|e|(e.as_ref().map(|e|e.id.clone()),true)).collect();
        let mut round = 0; let mut used = 0;
        while previous.len() > 1 {
            let mut next = vec![];
            for (i,pair) in previous.chunks(2).enumerate() {
                let ready = pair[0].1 && pair[1].1;
                let choices: Vec<String> = pair.iter().filter_map(|p|p.0.clone()).collect();
                let selected = t.winners.get(&format!("{round}-{i}"));
                if let Some(winner) = selected {
                    if !ready || choices.len() != 2 || !choices.contains(winner) { return Err("경기 결과가 참가자와 일치하지 않아요.".into()); }
                    used += 1;
                }
                if ready && choices.len() < 2 { next.push((choices.first().cloned(),true)); }
                else { next.push((selected.cloned(), ready && selected.is_some())); }
            }
            previous = next; round += 1;
        }
        if used != t.winners.len() { return Err("알 수 없는 경기 결과입니다.".into()); }
    }
    Ok(())
}
fn read(app: &tauri::AppHandle) -> Result<Library, String> {
    let path = app.path().app_data_dir().map_err(|e|e.to_string())?.join(FILE);
    if path.exists() {
        let bytes = std::fs::read(path).map_err(|e|e.to_string())?;
        let raw: serde_json::Value = serde_json::from_slice(&bytes).map_err(|_|"토너먼트 자료가 손상됐어요. 원본을 보존합니다.")?;
        if let Some(data) = raw.get("library") {
            let disk: Library = serde_json::from_value(data.clone()).map_err(|_|"지원하지 않는 토너먼트 자료입니다.")?;
            validate(&disk)?;
        } else if !raw.as_object().is_some_and(|o|o.is_empty()) { return Err("토너먼트 자료 형식이 달라요. 원본을 보존합니다.".into()); }
    }
    let store = app.store(FILE).map_err(|e|e.to_string())?;
    let value = match store.get("library") { Some(v) => serde_json::from_value(v).map_err(|_|"토너먼트 자료를 읽지 못했어요.")?, None => defaults() };
    validate(&value)?; Ok(value)
}
#[tauri::command]
pub fn tournament_read(app: tauri::AppHandle) -> Result<Library,String> { let _g = LOCK.lock().map_err(|_|"저장 잠금 오류")?; read(&app) }
#[tauri::command]
pub fn tournament_write(app: tauri::AppHandle, mut value: Library) -> Result<Library,String> {
    let _g = LOCK.lock().map_err(|_|"저장 잠금 오류")?;
    validate(&value)?; let old = read(&app)?;
    if old.revision != value.revision { return Err("다른 변경이 있어요. 창을 다시 열어 주세요.".into()); }
    value.revision = value.revision.checked_add(1).ok_or("저장 버전 오류")?;
    let store = app.store(FILE).map_err(|e|e.to_string())?;
    store.set("library",serde_json::to_value(&value).map_err(|e|e.to_string())?);
    if let Err(e) = store.save() { store.set("library",serde_json::to_value(old).map_err(|e|e.to_string())?); return Err(e.to_string()); }
    Ok(value)
}
#[cfg(test)] mod tests {
    use super::*;
    fn sample() -> Library { serde_json::from_value(serde_json::json!({"schemaVersion":1,"revision":0,"tournaments":[{"id":"t","title":"학급 대회","size":4,"phase":"play","slots":[{"id":"a","name":"동명"},{"id":"b","name":"동명"},{"id":"c","name":"별"},null],"winners":{},"updatedAt":0}]})).unwrap() }
    #[test] fn validates_byes_and_rejects_stale_results() { let mut v=sample(); assert!(validate(&v).is_ok()); v.tournaments[0].winners.insert("1-0".into(),"a".into()); assert!(validate(&v).is_err()); v.tournaments[0].winners.insert("0-0".into(),"a".into()); assert!(validate(&v).is_ok()); }
    #[test] fn protects_ids_and_versions() { let mut v=sample(); v.schema_version=2; assert!(validate(&v).is_err()); v.schema_version=1; v.tournaments[0].slots[1].as_mut().unwrap().id="a".into(); assert!(validate(&v).is_err()); }
}
