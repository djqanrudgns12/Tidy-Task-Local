//! Notice drafts and published snapshots have independent lifetimes.
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use std::{
    hash::{Hash, Hasher},
    sync::Mutex,
};
use tauri::Manager;
// A noticeboard window is single-instance. Reusing its SQLite connection avoids
// reopening the file and reapplying PRAGMAs for every read, list and autosave.
static DB: Mutex<Option<(std::path::PathBuf, Connection)>> = Mutex::new(None);
fn storage<E>(_: E) -> String {
    "STORAGE_UNAVAILABLE".into()
}
fn text(doc: &Value) -> String {
    doc["content"]
        .as_array()
        .map(|ps| {
            ps.iter()
                .map(|p| {
                    p["content"]
                        .as_array()
                        .map(|ns| {
                            ns.iter()
                                .map(|n| {
                                    if n["type"] == "hardBreak" {
                                        "\n"
                                    } else {
                                        n["text"].as_str().unwrap_or("")
                                    }
                                })
                                .collect::<String>()
                        })
                        .unwrap_or_default()
                })
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default()
}
fn meaningful(doc: &Value) -> bool {
    text(doc)
        .chars()
        .any(|c| !c.is_whitespace() && !matches!(c, '\u{200b}'..='\u{200d}' | '\u{feff}'))
}
fn validate(doc: &Value) -> Result<(), String> {
    let invalid = || "INVALID_DOCUMENT".to_string();
    let only = |value: &Value, keys: &[&str]| -> Result<(), String> {
        if value
            .as_object()
            .map_or(true, |o| o.keys().any(|k| !keys.contains(&k.as_str())))
        {
            Err(invalid())
        } else {
            Ok(())
        }
    };
    only(doc, &["type", "attrs", "content"])?;
    only(&doc["attrs"], &["fontId"])?;
    let font = doc["attrs"]["fontId"].as_str().ok_or_else(invalid)?;
    if doc["type"] != "doc"
        || font.is_empty()
        || font.chars().count() > 100
        || font.contains(['<', '>', ';', '{', '}'])
    {
        return Err(invalid());
    }
    let ps = doc["content"].as_array().ok_or_else(invalid)?;
    if ps.is_empty()
        || ps.len() > 5000
        || serde_json::to_vec(doc).map_err(storage)?.len() > 2 * 1024 * 1024
    {
        return Err("LIMIT_EXCEEDED".into());
    }
    for p in ps {
        only(p, &["type", "content"])?;
        if p["type"] != "paragraph" {
            return Err(invalid());
        }
        if let Some(ns) = p.get("content") {
            for n in ns.as_array().ok_or_else(invalid)? {
                only(
                    n,
                    if n["type"] == "text" {
                        &["type", "text", "marks"]
                    } else {
                        &["type", "marks"]
                    },
                )?;
                if n["type"] != "text" && n["type"] != "hardBreak" {
                    return Err(invalid());
                }
                if n["type"] == "text" && n["text"].as_str().map_or(true, |s| s.is_empty()) {
                    return Err(invalid());
                }
                if let Some(ms) = n.get("marks") {
                    let mut seen = std::collections::HashSet::new();
                    for m in ms.as_array().ok_or_else(invalid)? {
                        only(m, &["type", "attrs"])?;
                        let kind = m["type"].as_str().ok_or_else(invalid)?;
                        if kind == "fontSize" {
                            only(&m["attrs"], &["size"])?;
                        } else if kind == "color" {
                            only(&m["attrs"], &["color"])?;
                        } else if let Some(attrs) = m.get("attrs") {
                            only(attrs, &[])?;
                        }
                        if !seen.insert(kind) {
                            return Err(invalid());
                        }
                        match kind {
                            "bold" | "italic" | "strike" | "underline" => (),
                            "fontSize"
                                if m["attrs"]["size"]
                                    .as_u64()
                                    .is_some_and(|s| (8..=96).contains(&s)) =>
                            {
                                ()
                            }
                            "color"
                                if [
                                    "#253b40", "#a92c36", "#925014", "#216750", "#265fa0",
                                    "#72459a",
                                ]
                                .contains(&m["attrs"]["color"].as_str().unwrap_or("")) =>
                            {
                                ()
                            }
                            _ => return Err(invalid()),
                        }
                    }
                }
            }
        }
    }
    if text(doc).chars().count() > 100000 {
        return Err("LIMIT_EXCEEDED".into());
    }
    Ok(())
}
fn valid_date(key: &str) -> bool {
    key.len() == 10
        && chrono::NaiveDate::parse_from_str(key, "%Y-%m-%d")
            .ok()
            .is_some_and(|d| d.format("%Y-%m-%d").to_string() == key && key >= "1900-01-01")
}
fn init(c: &Connection) -> Result<(), String> {
    c.busy_timeout(std::time::Duration::from_secs(3))
        .map_err(storage)?;
    let v: i64 = c
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(|_| "CORRUPT_STORAGE")?;
    if v > 1 {
        return Err("UNSUPPORTED_SCHEMA".into());
    }
    c.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;")
        .map_err(storage)?;
    if v == 0 {
        c.execute_batch("BEGIN IMMEDIATE;
      CREATE TABLE documents(id TEXT PRIMARY KEY,date_key TEXT NOT NULL,revision INTEGER NOT NULL,saved TEXT,draft TEXT,deleted_at INTEGER,updated_at INTEGER NOT NULL,CHECK(saved IS NOT NULL OR draft IS NOT NULL));
      CREATE UNIQUE INDEX active_date ON documents(date_key) WHERE deleted_at IS NULL;
      CREATE TABLE operations(id TEXT PRIMARY KEY,document_id TEXT NOT NULL,digest TEXT NOT NULL,response TEXT NOT NULL,created INTEGER NOT NULL DEFAULT(unixepoch()));
      CREATE TABLE tombstones(id TEXT PRIMARY KEY);
      PRAGMA user_version=1; COMMIT;").map_err(storage)?;
    }
    Ok(())
}
fn row(r: &rusqlite::Row) -> rusqlite::Result<Value> {
    let saved: Option<String> = r.get(3)?;
    let draft: Option<String> = r.get(4)?;
    let decode = |s: Option<String>| -> rusqlite::Result<Value> {
        match s {
            None => Ok(Value::Null),
            Some(s) => serde_json::from_str(&s).map_err(|e| {
                rusqlite::Error::FromSqlConversionFailure(
                    3,
                    rusqlite::types::Type::Text,
                    Box::new(e),
                )
            }),
        }
    };
    Ok(
        json!({"id":r.get::<_,String>(0)?,"dateKey":r.get::<_,String>(1)?,"revision":r.get::<_,u64>(2)?,"saved":decode(saved)?,"draft":decode(draft)?,"deletedAt":r.get::<_,Option<i64>>(5)?,"updatedAt":r.get::<_,i64>(6)?}),
    )
}
fn by_id(c: &Connection, id: &str) -> Result<Option<Value>, String> {
    c.query_row("SELECT * FROM documents WHERE id=?", [id], row)
        .optional()
        .map_err(storage)
}
fn execute(c: &mut Connection, cmd: Value) -> Result<Value, String> {
    let kind = cmd["type"].as_str().ok_or("INVALID_COMMAND")?;
    if kind == "read" {
        let key = cmd["dateKey"].as_str().ok_or("INVALID_DATE")?;
        if !valid_date(key) {
            return Err("INVALID_DATE".into());
        }
        return c
            .query_row(
                "SELECT * FROM documents WHERE date_key=? AND deleted_at IS NULL",
                [key],
                row,
            )
            .optional()
            .map(|v| v.unwrap_or(Value::Null))
            .map_err(storage);
    }
    if kind == "list" || kind == "trashList" {
        let sql = if kind == "list" {
            "SELECT * FROM documents WHERE deleted_at IS NULL ORDER BY date_key DESC"
        } else {
            "SELECT * FROM documents WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC,id"
        };
        let mut st = c.prepare(sql).map_err(storage)?;
        let records = st
            .query_map([], row)
            .map_err(storage)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(storage)?;
        return Ok(Value::Array(
            records
                .into_iter()
                .map(|mut r| {
                    r["savedText"] = json!(text(&r["saved"]));
                    r["draftText"] = json!(text(&r["draft"]));
                    if kind == "list" {
                        r["hasSaved"] = json!(!r["saved"].is_null());
                        r["hasDraft"] = json!(!r["draft"].is_null());
                        r.as_object_mut().unwrap().remove("saved");
                        r.as_object_mut().unwrap().remove("draft");
                    }
                    r
                })
                .collect(),
        ));
    }
    let id = cmd["id"].as_str().ok_or("INVALID_ID")?;
    let op = cmd["operationId"].as_str().ok_or("INVALID_ID")?;
    if uuid::Uuid::parse_str(id).is_err() || uuid::Uuid::parse_str(op).is_err() {
        return Err("INVALID_ID".into());
    }
    let mut hash = std::collections::hash_map::DefaultHasher::new();
    cmd.to_string().hash(&mut hash);
    let digest = hash.finish().to_string();
    let tx = c
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(storage)?;
    if let Some((old, response)) = tx
        .query_row(
            "SELECT digest,response FROM operations WHERE id=?",
            [op],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
        )
        .optional()
        .map_err(storage)?
    {
        if old != digest {
            return Err("CONFLICT".into());
        }
        return serde_json::from_str(&response).map_err(storage);
    }
    let current = by_id(&tx, id)?;
    let expected = cmd["expectedRevision"].as_u64().ok_or("INVALID_REVISION")?;
    if current
        .as_ref()
        .map(|v| v["revision"].as_u64().unwrap_or(0))
        .unwrap_or(0)
        != expected
    {
        return Err("CONFLICT".into());
    }
    match kind {
        "draft" | "save" => {
            let purged: bool = tx
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM tombstones WHERE id=?)",
                    [id],
                    |r| r.get(0),
                )
                .map_err(storage)?;
            if purged {
                return Err("NOT_ACTIVE".into());
            }
            let key = cmd["dateKey"].as_str().ok_or("INVALID_DATE")?;
            if !valid_date(key) {
                return Err("INVALID_DATE".into());
            }
            if let Some(ref r) = current {
                if !r["deletedAt"].is_null() || r["dateKey"] != key {
                    return Err("NOT_ACTIVE".into());
                }
            }
            let doc = &cmd["document"];
            validate(doc)?;
            if kind == "save" && !meaningful(doc) {
                return Err("EMPTY_CONTENT".into());
            }
            if current.is_none() {
                let occupied: bool = tx.query_row("SELECT EXISTS(SELECT 1 FROM documents WHERE date_key=? AND deleted_at IS NULL)",[key],|r|r.get(0)).map_err(storage)?;
                if occupied {
                    return Err("CONFLICT".into());
                }
                tx.execute(
                    "INSERT INTO documents VALUES(?,?,1,?,?,NULL,unixepoch())",
                    params![
                        id,
                        key,
                        if kind == "save" {
                            Some(doc.to_string())
                        } else {
                            None
                        },
                        if kind == "draft" {
                            Some(doc.to_string())
                        } else {
                            None
                        }
                    ],
                )
                .map_err(storage)?;
            } else {
                let r = current.as_ref().unwrap();
                let saved = if kind == "save" {
                    doc.clone()
                } else {
                    r["saved"].clone()
                };
                let draft = if kind == "draft" {
                    if *doc == saved {
                        Value::Null
                    } else {
                        doc.clone()
                    }
                } else if r["draft"] == *doc {
                    Value::Null
                } else {
                    r["draft"].clone()
                };
                let encode = |v: &Value| {
                    if v.is_null() {
                        None
                    } else {
                        Some(v.to_string())
                    }
                };
                tx.execute("UPDATE documents SET saved=?,draft=?,revision=revision+1,updated_at=unixepoch() WHERE id=?",params![encode(&saved),encode(&draft),id]).map_err(storage)?;
            }
        }
        "trash" => {
            let r = current.as_ref().ok_or("NOT_ACTIVE")?;
            if !r["deletedAt"].is_null() {
                return Err("NOT_ACTIVE".into());
            }
            tx.execute(
                "UPDATE documents SET deleted_at=unixepoch(),revision=revision+1 WHERE id=?",
                [id],
            )
            .map_err(storage)?;
        }
        "restore" => {
            let r = current.as_ref().ok_or("NOT_ACTIVE")?;
            if r["deletedAt"].is_null() {
                return Err("NOT_ACTIVE".into());
            }
            let active = tx
                .query_row(
                    "SELECT * FROM documents WHERE date_key=? AND deleted_at IS NULL",
                    [r["dateKey"].as_str().unwrap()],
                    row,
                )
                .optional()
                .map_err(storage)?;
            if let Some(active) = active {
                if cmd["replaceId"] != active["id"] || cmd["replaceRevision"] != active["revision"]
                {
                    return Err("CONFLICT".into());
                }
                tx.execute(
                    "UPDATE documents SET deleted_at=unixepoch(),revision=revision+1 WHERE id=?",
                    [active["id"].as_str().unwrap()],
                )
                .map_err(storage)?;
            } else if !cmd["replaceId"].is_null() {
                return Err("CONFLICT".into());
            }
            tx.execute(
                "UPDATE documents SET deleted_at=NULL,revision=revision+1 WHERE id=?",
                [id],
            )
            .map_err(storage)?;
        }
        "purge" => {
            let r = current.as_ref().ok_or("NOT_ACTIVE")?;
            if r["deletedAt"].is_null() {
                return Err("NOT_ACTIVE".into());
            }
            tx.execute("DELETE FROM operations WHERE document_id=?", [id])
                .map_err(storage)?;
            tx.execute("DELETE FROM documents WHERE id=?", [id])
                .map_err(storage)?;
            tx.execute("INSERT OR IGNORE INTO tombstones(id) VALUES(?)", [id])
                .map_err(storage)?;
        }
        _ => return Err("INVALID_COMMAND".into()),
    }
    let result = by_id(&tx, id)?.unwrap_or(Value::Null);
    tx.execute(
        "INSERT INTO operations(id,document_id,digest,response) VALUES(?,?,?,?)",
        params![op, id, digest, result.to_string()],
    )
    .map_err(storage)?;
    tx.execute("DELETE FROM operations WHERE created < unixepoch()-86400 OR id IN (SELECT id FROM operations ORDER BY created DESC,rowid DESC LIMIT -1 OFFSET 2000)",[]).map_err(storage)?;
    tx.commit().map_err(storage)?;
    Ok(result)
}
fn recovery_path(path: &std::path::Path) -> std::path::PathBuf {
    path.with_extension("last-good.sqlite3")
}
fn checkpoint(c: &Connection, path: &std::path::Path) -> Result<(), String> {
    let stage = path.with_extension("backup-stage.sqlite3");
    if stage.exists() {
        std::fs::remove_file(&stage).map_err(storage)?;
    }
    c.execute("VACUUM INTO ?", [stage.to_string_lossy().as_ref()])
        .map_err(storage)?;
    std::fs::OpenOptions::new()
        .write(true)
        .open(&stage)
        .and_then(|f| f.sync_all())
        .map_err(storage)?;
    let backup = recovery_path(path);
    if backup.exists() {
        std::fs::remove_file(&backup).map_err(storage)?;
    }
    std::fs::rename(stage, backup).map_err(storage)?;
    Ok(())
}
fn recover(path: &std::path::Path) -> Result<Value, String> {
    if let Ok(original) =
        Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
    {
        if original
            .query_row("PRAGMA quick_check", [], |r| r.get::<_, String>(0))
            .ok()
            .as_deref()
            == Some("ok")
        {
            let version: i64 = original
                .query_row("PRAGMA user_version", [], |r| r.get(0))
                .map_err(storage)?;
            if version > 1 {
                return Err("UNSUPPORTED_SCHEMA".into());
            }
            let healthy = (|| -> Result<(), String> {
                let mut st = original
                    .prepare("SELECT * FROM documents")
                    .map_err(storage)?;
                for record in st.query_map([], row).map_err(storage)? {
                    let record = record.map_err(storage)?;
                    if !valid_date(record["dateKey"].as_str().unwrap_or("")) {
                        return Err("CORRUPT_STORAGE".into());
                    }
                    for name in ["saved", "draft"] {
                        if !record[name].is_null() {
                            validate(&record[name])?;
                        }
                    }
                }
                Ok(())
            })()
            .is_ok();
            if healthy {
                return Err("RECOVERY_NOT_NEEDED".into());
            }
        }
    }
    let backup = recovery_path(path);
    let source = Connection::open_with_flags(&backup, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(storage)?;
    let status: String = source
        .query_row("PRAGMA quick_check", [], |r| r.get(0))
        .map_err(storage)?;
    let version: i64 = source
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(storage)?;
    if status != "ok" || version != 1 {
        return Err("CORRUPT_STORAGE".into());
    }
    let mut st = source.prepare("SELECT * FROM documents").map_err(storage)?;
    for r in st.query_map([], row).map_err(storage)? {
        let r = r.map_err(storage)?;
        for name in ["saved", "draft"] {
            if !r[name].is_null() {
                validate(&r[name])?;
            }
        }
    }
    drop(st);
    drop(source);
    let damaged = path.with_extension(format!("damaged-{}.sqlite3", uuid::Uuid::new_v4()));
    if path.exists() {
        std::fs::rename(path, &damaged).map_err(storage)?;
    }
    let journal = std::path::PathBuf::from(format!("{}-journal", path.display()));
    if journal.exists() {
        if std::fs::rename(&journal, damaged.with_extension("journal")).is_err() {
            let _ = std::fs::rename(&damaged, path);
            return Err("STORAGE_UNAVAILABLE".into());
        }
    }
    if std::fs::copy(&backup, path).is_err() {
        let _ = std::fs::remove_file(path);
        if damaged.exists() {
            let _ = std::fs::rename(&damaged, path);
        }
        let saved_journal = damaged.with_extension("journal");
        if saved_journal.exists() {
            let _ = std::fs::rename(saved_journal, journal);
        }
        return Err("STORAGE_UNAVAILABLE".into());
    }
    Ok(Value::Null)
}
#[tauri::command]
pub async fn noticeboard_execute(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    command: Value,
) -> Result<Value, String> {
    if window.label() != "noticeboard" {
        return Err("FORBIDDEN".into());
    }
    let path = app
        .path()
        .app_data_dir()
        .map_err(storage)?
        .join("tidy-noticeboard.sqlite3");
    tauri::async_runtime::spawn_blocking(move || {
        let mut cached = DB.lock().map_err(storage)?;
        std::fs::create_dir_all(path.parent().ok_or("STORAGE_UNAVAILABLE")?).map_err(storage)?;
        if command["type"]=="recoveryInfo" {let backup=recovery_path(&path);return Ok(json!({"available":backup.exists(),"modified":std::fs::metadata(backup).ok().and_then(|m|m.modified().ok()).and_then(|t|t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d|d.as_secs())}));}
        if command["type"]=="recover" { *cached = None; return recover(&path); }
        if cached.as_ref().is_none_or(|(open_path, _)| open_path != &path) {
            let c = Connection::open(&path).map_err(storage)?;
            init(&c)?;
            *cached = Some((path.clone(), c));
        }
        let c = &mut cached.as_mut().ok_or("STORAGE_UNAVAILABLE")?.1;
        let kind=command["type"].as_str().unwrap_or("").to_string();
        if kind=="purge" {for p in [recovery_path(&path),path.with_extension("backup-stage.sqlite3")]{if p.exists(){std::fs::remove_file(p).map_err(storage)?;}}}
        let mut result=execute(c, command)?;
        if ["save","trash","restore","purge"].contains(&kind.as_str()) && checkpoint(c,&path).is_err() && result.is_object(){result["backupWarning"]=json!(true);}
        Ok(result)
    })
    .await
    .map_err(storage)?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn doc(t: &str) -> Value {
        json!({"type":"doc","attrs":{"fontId":"메이플스토리 L"},"content":[{"type":"paragraph","content":[{"type":"text","text":t}]}]})
    }
    fn db() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        init(&c).unwrap();
        c
    }
    fn cmd(kind: &str, id: &str, rev: u64) -> Value {
        json!({"type":kind,"id":id,"dateKey":"2026-09-21","expectedRevision":rev,"operationId":uuid::Uuid::new_v4().to_string()})
    }
    #[test]
    fn draft_saved_and_retry_are_independent() {
        let mut c = db();
        let id = uuid::Uuid::new_v4().to_string();
        let mut a = cmd("save", &id, 0);
        a["document"] = doc("준비물");
        let x = execute(&mut c, a.clone()).unwrap();
        assert_eq!(execute(&mut c, a).unwrap(), x);
        let mut b = cmd("draft", &id, 1);
        b["document"] = doc("준비물 풀");
        let r = execute(&mut c, b).unwrap();
        assert_eq!(text(&r["saved"]), "준비물");
        assert_eq!(text(&r["draft"]), "준비물 풀");
    }
    #[test]
    fn empty_save_and_stale_writes_are_rejected() {
        let mut c = db();
        let id = uuid::Uuid::new_v4().to_string();
        let mut a = cmd("save", &id, 0);
        a["document"] = doc(" ");
        assert_eq!(execute(&mut c, a).unwrap_err(), "EMPTY_CONTENT");
        let mut b = cmd("draft", &id, 0);
        b["document"] = doc("가");
        execute(&mut c, b.clone()).unwrap();
        execute(&mut c, cmd("trash", &id, 1)).unwrap();
        b["operationId"] = json!(uuid::Uuid::new_v4().to_string());
        b["expectedRevision"] = json!(2);
        assert_eq!(execute(&mut c, b).unwrap_err(), "NOT_ACTIVE");
    }
    #[test]
    fn restore_conflict_preserves_both() {
        let mut c = db();
        let a = uuid::Uuid::new_v4().to_string();
        let b = uuid::Uuid::new_v4().to_string();
        for (id, t) in [(&a, "원본"), (&b, "새 내용")] {
            let mut q = cmd("save", id, 0);
            q["document"] = doc(t);
            execute(&mut c, q).unwrap();
            if id == &a {
                execute(&mut c, cmd("trash", id, 1)).unwrap();
            }
        }
        assert_eq!(
            execute(&mut c, cmd("restore", &a, 2)).unwrap_err(),
            "CONFLICT"
        );
        let mut r = cmd("restore", &a, 2);
        r["replaceId"] = json!(b);
        r["replaceRevision"] = json!(1);
        execute(&mut c, r).unwrap();
        assert!(by_id(&c, &a).unwrap().unwrap()["deletedAt"].is_null());
        assert!(!by_id(&c, &b).unwrap().unwrap()["deletedAt"].is_null());
    }
    #[test]
    fn invalid_dates_and_future_schema() {
        assert!(!valid_date("2026-02-29"));
        assert!(valid_date("2028-02-29"));
        let c = db();
        c.execute_batch("PRAGMA user_version=9").unwrap();
        assert_eq!(init(&c).unwrap_err(), "UNSUPPORTED_SCHEMA");
    }
    #[test]
    fn purge_prevents_first_request_replay() {
        let mut c = db();
        let id = uuid::Uuid::new_v4().to_string();
        let mut a = cmd("draft", &id, 0);
        a["document"] = doc("삭제");
        execute(&mut c, a.clone()).unwrap();
        execute(&mut c, cmd("trash", &id, 1)).unwrap();
        execute(&mut c, cmd("purge", &id, 2)).unwrap();
        a["operationId"] = json!(uuid::Uuid::new_v4().to_string());
        assert_eq!(execute(&mut c, a).unwrap_err(), "NOT_ACTIVE");
    }
    #[test]
    fn failed_restore_rolls_back_both_rows() {
        let mut c = db();
        let a = uuid::Uuid::new_v4().to_string();
        let b = uuid::Uuid::new_v4().to_string();
        for id in [&a, &b] {
            let mut q = cmd("save", id, 0);
            q["document"] = doc("기록");
            execute(&mut c, q).unwrap();
            if id == &a {
                execute(&mut c, cmd("trash", id, 1)).unwrap();
            }
        }
        c.execute_batch("CREATE TRIGGER fail_restore BEFORE UPDATE ON documents WHEN NEW.deleted_at IS NULL BEGIN SELECT RAISE(ABORT,'injected failure'); END;").unwrap();
        let mut q = cmd("restore", &a, 2);
        q["replaceId"] = json!(b);
        q["replaceRevision"] = json!(1);
        assert!(execute(&mut c, q).is_err());
        assert!(!by_id(&c, &a).unwrap().unwrap()["deletedAt"].is_null());
        assert!(by_id(&c, &b).unwrap().unwrap()["deletedAt"].is_null());
    }
    #[test]
    fn durable_reopen_and_failed_write_keep_last_snapshot() {
        let path =
            std::env::temp_dir().join(format!("tidy-notice-test-{}.sqlite3", uuid::Uuid::new_v4()));
        let id = uuid::Uuid::new_v4().to_string();
        {
            let mut c = Connection::open(&path).unwrap();
            init(&c).unwrap();
            let mut q = cmd("save", &id, 0);
            q["document"] = doc("디스크 보관");
            execute(&mut c, q).unwrap();
            c.execute_batch("PRAGMA query_only=ON").unwrap();
            let mut q = cmd("draft", &id, 1);
            q["document"] = doc("실패한 변경");
            assert!(execute(&mut c, q).is_err());
        }
        {
            let c = Connection::open(&path).unwrap();
            init(&c).unwrap();
            assert_eq!(
                text(&by_id(&c, &id).unwrap().unwrap()["saved"]),
                "디스크 보관"
            );
        }
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn unknown_content_and_duplicate_operation_payload_are_rejected() {
        let mut c = db();
        let id = uuid::Uuid::new_v4().to_string();
        let mut q = cmd("save", &id, 0);
        q["document"] = doc("기록");
        execute(&mut c, q.clone()).unwrap();
        q["document"] = doc("다른 기록");
        assert_eq!(execute(&mut c, q).unwrap_err(), "CONFLICT");
        let mut d = doc("본문");
        d["html"] = json!("<script>");
        assert_eq!(validate(&d).unwrap_err(), "INVALID_DOCUMENT");
    }

    #[test]
    fn recovery_preserves_damaged_original_and_refuses_healthy_overwrite() {
        let folder =
            std::env::temp_dir().join(format!("tidy-notice-recovery-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&folder).unwrap();
        let path = folder.join("notice.sqlite3");
        {
            let mut c = Connection::open(&path).unwrap();
            init(&c).unwrap();
            let mut q = cmd("save", &uuid::Uuid::new_v4().to_string(), 0);
            q["document"] = doc("복구할 기록");
            execute(&mut c, q).unwrap();
            checkpoint(&c, &path).unwrap();
        }
        assert_eq!(recover(&path).unwrap_err(), "RECOVERY_NOT_NEEDED");
        std::fs::write(&path, b"broken database").unwrap();
        recover(&path).unwrap();
        {
            let mut c = Connection::open(&path).unwrap();
            init(&c).unwrap();
            let r = execute(&mut c, json!({"type":"read","dateKey":"2026-09-21"})).unwrap();
            assert_eq!(text(&r["saved"]), "복구할 기록");
        }
        let files: Vec<_> = std::fs::read_dir(&folder)
            .unwrap()
            .map(|e| e.unwrap().path())
            .collect();
        assert!(files.iter().any(|p| p
            .file_name()
            .unwrap()
            .to_string_lossy()
            .contains("damaged-")));
        for file in files {
            std::fs::remove_file(file).unwrap();
        }
        std::fs::remove_dir(folder).unwrap();
    }
}
