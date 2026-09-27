pub mod import;
pub mod intent;
pub mod model;
pub mod seating;
use model::*;
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::sync::Mutex;
use tauri::{Emitter, Manager};
static LOCK: Mutex<()> = Mutex::new(());
static HISTORY: Mutex<Vec<(u64, Snapshot)>> = Mutex::new(Vec::new());
static QUIT_PENDING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
pub fn request_quit(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("roster") {
        QUIT_PENDING.store(true, std::sync::atomic::Ordering::SeqCst);
        let _ = win.emit("classroom-quit-request", ());
        let _ = win.show();
        let _ = win.set_focus();
    } else {
        finish_quit(app.clone());
    }
}
pub(crate) fn finish_quit(app: tauri::AppHandle) {
    crate::toolkit::QUITTING.store(true, std::sync::atomic::Ordering::SeqCst);
    let _ = app.emit("before-quit", ());
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(800));
        app.exit(0);
    });
}
#[tauri::command]
pub fn classroom_quit_reply(app: tauri::AppHandle, window: tauri::WebviewWindow, allow: bool) {
    if window.label() == "roster"
        && QUIT_PENDING.swap(false, std::sync::atomic::Ordering::SeqCst)
        && allow
    {
        finish_quit(app);
    }
}
fn storage<E>(_: E) -> String {
    "STORAGE_UNAVAILABLE: 저장소를 읽거나 저장하지 못했어요. 다시 시도해 주세요.".into()
}
fn connect(app: &tauri::AppHandle) -> Result<Connection, String> {
    let dir = app.path().app_data_dir().map_err(storage)?;
    std::fs::create_dir_all(&dir).map_err(storage)?;
    let conn = Connection::open(dir.join("tidy-classroom.sqlite3")).map_err(storage)?;
    init(&conn)?;
    Ok(conn)
}
fn init(c: &Connection) -> Result<(), String> {
    c.busy_timeout(std::time::Duration::from_secs(3))
        .map_err(storage)?;
    let version: i64 = c
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(storage)?;
    if version > 2 {
        return Err("UNSUPPORTED_SCHEMA: 더 최신 버전에서 만든 학급 자료예요.".into());
    }
    c.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;")
        .map_err(storage)?;
    if version == 0 {
        c.execute_batch("BEGIN IMMEDIATE;
 CREATE TABLE classes(id TEXT PRIMARY KEY,name TEXT NOT NULL,revision INTEGER NOT NULL,position INTEGER NOT NULL);
 CREATE TABLE groups(id TEXT PRIMARY KEY,class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,name TEXT NOT NULL,position INTEGER NOT NULL,UNIQUE(class_id,name),UNIQUE(class_id,id));
 CREATE TABLE students(id TEXT PRIMARY KEY,class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,number INTEGER CHECK(number BETWEEN 1 AND 9999),name TEXT NOT NULL,gender TEXT CHECK(gender IN ('male','female','unspecified')),group_id TEXT,UNIQUE(class_id,number),FOREIGN KEY(class_id,group_id) REFERENCES groups(class_id,id));
 CREATE TABLE state(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,default_class_id TEXT REFERENCES classes(id) ON DELETE SET NULL);
 INSERT INTO state VALUES(1,0,NULL);
 CREATE TABLE operations(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,created INTEGER NOT NULL DEFAULT(unixepoch()));
 PRAGMA user_version=1; COMMIT;").map_err(storage)?;
    }
    if version < 2 {
        c.execute_batch("BEGIN IMMEDIATE; CREATE TABLE IF NOT EXISTS seating_documents(class_id TEXT PRIMARY KEY REFERENCES classes(id) ON DELETE CASCADE, document TEXT NOT NULL); PRAGMA user_version=2; COMMIT;").map_err(storage)?;
    }
    Ok(())
}
fn read(c: &Connection) -> Result<Snapshot, String> {
    let (revision, default_class_id) = c
        .query_row(
            "SELECT revision,default_class_id FROM state WHERE id=1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(storage)?;
    let mut st = c
        .prepare("SELECT id,name,revision FROM classes ORDER BY position")
        .map_err(storage)?;
    let classes = st
        .query_map([], |r| {
            Ok(Class {
                id: r.get(0)?,
                name: r.get(1)?,
                revision: r.get(2)?,
                students: vec![],
                groups: vec![],
            })
        })
        .map_err(storage)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(storage)?;
    let mut out = Snapshot {
        revision,
        default_class_id,
        classes,
        seating: Default::default(),
    };
    for cl in &mut out.classes {
        let mut p=c.prepare("SELECT id,number,name,gender,group_id FROM students WHERE class_id=? ORDER BY number").map_err(storage)?;
        cl.students = p
            .query_map([&cl.id], |r| {
                Ok(Student {
                    id: r.get(0)?,
                    number: r.get(1)?,
                    name: r.get(2)?,
                    gender: r.get(3)?,
                    group_id: r.get(4)?,
                })
            })
            .map_err(storage)?
            .collect::<Result<_, _>>()
            .map_err(storage)?;
        let mut g = c
            .prepare("SELECT id,name FROM groups WHERE class_id=? ORDER BY position")
            .map_err(storage)?;
        cl.groups = g
            .query_map([&cl.id], |r| {
                Ok(Group {
                    id: r.get(0)?,
                    name: r.get(1)?,
                })
            })
            .map_err(storage)?
            .collect::<Result<_, _>>()
            .map_err(storage)?;
    }
    let mut stmt = c.prepare("SELECT class_id,document FROM seating_documents").map_err(storage)?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_,String>(0)?, r.get::<_,String>(1)?))).map_err(storage)?;
    for row in rows { let (id, doc) = row.map_err(storage)?; out.seating.insert(id, serde_json::from_str(&doc).map_err(storage)?); }
    seating::validate_all(&out)?;
    validate(&out)?;
    Ok(out)
}
// Persist only changed entities; identities remain stable for future tool references.
fn persist(c: &Connection, old: &Snapshot, s: &Snapshot) -> Result<(), String> {
    for (i, cl) in s.classes.iter().enumerate() {
        c.execute("INSERT INTO classes VALUES(?1,?2,?3,?4) ON CONFLICT(id) DO UPDATE SET name=excluded.name,revision=excluded.revision,position=excluded.position",params![cl.id,cl.name,cl.revision,i]).map_err(storage)?;
        if old.classes.iter().any(|previous| previous == cl) {
            continue;
        }
        // Temporary nulls permit number swaps; validated final state is written in this transaction.
        c.execute(
            "UPDATE students SET number=NULL,group_id=NULL WHERE class_id=?",
            [&cl.id],
        )
        .map_err(storage)?;
        if let Some(prev) = old.classes.iter().find(|p| p.id == cl.id) {
            for p in &prev.students {
                if !cl.students.iter().any(|n| n.id == p.id) {
                    c.execute("DELETE FROM students WHERE id=?", [&p.id])
                        .map_err(storage)?;
                }
            }
            for g in &prev.groups {
                if !cl.groups.iter().any(|n| n.id == g.id) {
                    c.execute("DELETE FROM groups WHERE id=?", [&g.id])
                        .map_err(storage)?;
                }
            }
        }
        for (pos, g) in cl.groups.iter().enumerate() {
            c.execute("INSERT INTO groups VALUES(?1,?2,?3,?4) ON CONFLICT(id) DO UPDATE SET name=excluded.name,position=excluded.position",params![g.id,cl.id,g.name,pos]).map_err(storage)?;
        }
        for p in &cl.students {
            c.execute("INSERT INTO students VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(id) DO UPDATE SET number=excluded.number,name=excluded.name,gender=excluded.gender,group_id=excluded.group_id",params![p.id,cl.id,p.number,p.name,p.gender,p.group_id]).map_err(storage)?;
        }
    }
    for cl in &old.classes {
        if !s.classes.iter().any(|n| n.id == cl.id) {
            c.execute("DELETE FROM classes WHERE id=?", [&cl.id])
                .map_err(storage)?;
        }
    }
    for (class_id, document) in &s.seating {
        c.execute("INSERT INTO seating_documents VALUES(?1,?2) ON CONFLICT(class_id) DO UPDATE SET document=excluded.document", params![class_id, document.to_string()]).map_err(storage)?;
    }
    for class_id in old.seating.keys() { if !s.seating.contains_key(class_id) { c.execute("DELETE FROM seating_documents WHERE class_id=?", [class_id]).map_err(storage)?; } }
    c.execute(
        "UPDATE state SET revision=?1,default_class_id=?2 WHERE id=1",
        params![s.revision, s.default_class_id],
    )
    .map_err(storage)?;
    Ok(())
}
fn transact(
    c: &mut Connection,
    op: &str,
    expected: u64,
    cmd: Command,
    history: &mut Vec<(u64, Snapshot)>,
) -> Result<Snapshot, String> {
    if uuid::Uuid::parse_str(op).is_err() {
        return Err("VALIDATION: 잘못된 작업 ID예요.".into());
    }
    let tx = c
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(storage)?;
    let old = read(&tx)?;
    if tx
        .query_row("SELECT count(*) FROM operations WHERE id=?", [op], |r| {
            r.get::<_, i64>(0)
        })
        .map_err(storage)?
        > 0
    {
        return Ok(old);
    }
    if old.revision != expected {
        return Err(
            "REVISION_CONFLICT: 다른 변경이 있어요. 최신 내용을 확인하고 다시 시도해 주세요."
                .into(),
        );
    }
    let undo = matches!(cmd, Command::Undo);
    let restore = matches!(cmd, Command::Restore { .. });
    let mut next = old.clone();
    if undo {
        let (rev, prev) = history
            .last()
            .ok_or("UNDO_CONFLICT: 실행 취소할 작업이 없어요.")?;
        if *rev != old.revision {
            return Err("UNDO_CONFLICT: 다른 변경 이후에는 되돌릴 수 없어요.".into());
        }
        next = prev.clone();
    } else {
        apply(&mut next, cmd)?;
    }
    if next == old {
        return Ok(old);
    }
    next.revision = old.revision + 1;
    for cl in &mut next.classes {
        cl.revision = old
            .classes
            .iter()
            .find(|c| c.id == cl.id)
            .map(|previous| {
                if previous == cl {
                    previous.revision
                } else {
                    previous.revision + 1
                }
            })
            .unwrap_or(1);
    }
    validate(&next)?;
    if restore {
        tx.execute("DELETE FROM students", []).map_err(storage)?;
        tx.execute("DELETE FROM groups", []).map_err(storage)?;
        tx.execute("DELETE FROM classes", []).map_err(storage)?;
    }
    if restore {
        persist(&tx, &Snapshot::default(), &next)?;
    } else {
        persist(&tx, &old, &next)?;
    }
    tx.execute(
        "INSERT INTO operations(id,revision) VALUES(?1,?2)",
        params![op, next.revision],
    )
    .map_err(storage)?;
    tx.execute("DELETE FROM operations WHERE created < unixepoch()-86400 OR id NOT IN (SELECT id FROM operations ORDER BY revision DESC LIMIT 2000)",[]).map_err(storage)?;
    tx.commit().map_err(storage)?;
    if undo {
        history.pop();
        if let Some(last) = history.last_mut() {
            last.0 = next.revision;
        }
    } else if restore {
        history.clear();
    } else {
        history.push((next.revision, old));
        if history.len() > 20 {
            history.remove(0);
        }
    }
    Ok(next)
}
#[tauri::command]
pub async fn classroom_read(app: tauri::AppHandle, window: tauri::WebviewWindow) -> Result<Snapshot, String> {
    if window.label() == "seating-display" { return Err("공개 화면에서는 학급 원본을 읽을 수 없어요.".into()); }
    tauri::async_runtime::spawn_blocking(move || {
        let _l = LOCK.lock().map_err(storage)?;
        read(&connect(&app)?)
    })
    .await
    .map_err(storage)?
}
#[tauri::command]
pub async fn classroom_execute(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    operation_id: String,
    expected_revision: u64,
    command: Command,
) -> Result<Value, String> {
    if window.label() == "seating-display" { return Err("공개 화면에서는 편집할 수 없어요.".into()); }
    tauri::async_runtime::spawn_blocking(move || {
        let _l = LOCK.lock().map_err(storage)?;
        let mut h = HISTORY.lock().map_err(storage)?;
        let connection = connect(&app);
        let s = match connection {
            Ok(mut conn) => transact(&mut conn, &operation_id, expected_revision, command, &mut h)?,
            Err(error) => {
                // Only the explicitly confirmed Restore command may replace unreadable storage.
                if let Command::Restore { backup } = command {
                    if !error.starts_with("STORAGE_UNAVAILABLE") {
                        return Err(error);
                    }
                    let dir = app.path().app_data_dir().map_err(storage)?;
                    let path = dir.join("tidy-classroom.sqlite3");
                    let probe = Connection::open(&path).map_err(storage)?;
                    let corrupt = probe
                        .query_row("PRAGMA integrity_check", [], |r| r.get::<_, String>(0))
                        .map(|v| v != "ok")
                        .unwrap_or(true);
                    drop(probe);
                    if !corrupt {
                        return Err(error);
                    }
                    let result = recover_file(&path, backup, expected_revision)?;
                    h.clear();
                    result
                } else {
                    return Err(error);
                }
            }
        };
        let _ = app.emit("classroom-changed", json!({"revision":s.revision}));
        Ok(json!({"snapshot":s,"canUndo":!h.is_empty()}))
    })
    .await
    .map_err(storage)?
}
fn recover_file(path: &std::path::Path, backup: Backup, revision: u64) -> Result<Snapshot, String> {
    if backup.format != "tidy-classroom" || ![1, 2].contains(&backup.schema_version) {
        return Err("UNSUPPORTED_SCHEMA: 지원하지 않는 백업이에요.".into());
    }
    validate(&backup.data)?;
    let temporary = path.with_extension(format!("restore-{}", id()));
    let protected = path.with_extension(format!("recovery-{}.sqlite3", id()));
    let mut data = backup.data;
    data.revision = revision + 1;
    let result = (|| {
        let mut conn = Connection::open(&temporary).map_err(storage)?;
        init(&conn)?;
        let tx = conn.transaction().map_err(storage)?;
        persist(&tx, &Snapshot::default(), &data)?;
        tx.commit().map_err(storage)?;
        drop(conn);
        std::fs::rename(path, &protected).map_err(storage)?;
        if let Err(e) = std::fs::rename(&temporary, path) {
            let _ = std::fs::rename(&protected, path);
            return Err(storage(e));
        }
        Ok(data)
    })();
    if temporary.exists() {
        let _ = std::fs::remove_file(temporary);
    }
    result
}
#[tauri::command]
pub fn classroom_clear_history() {
    if let Ok(mut h) = HISTORY.lock() {
        h.clear();
    }
    import::clear_transients();
}
#[cfg(test)]
mod tests {
    use super::*;
    fn setup() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        init(&c).unwrap();
        c
    }
    #[test]
    fn corrupted_file_is_preserved_during_explicit_restore() {
        let path = std::env::temp_dir().join(format!("tidy-recovery-test-{}.sqlite3", id()));
        std::fs::write(&path, b"corrupted test data").unwrap();
        let mut source = setup();
        let mut h = vec![];
        let data = populated(&mut source, &mut h);
        let backup = Backup {
            format: "tidy-classroom".into(),
            schema_version: 1,
            data: data.clone(),
        };
        let restored = recover_file(&path, backup, 0).unwrap();
        let conn = Connection::open(&path).unwrap();
        assert_eq!(
            read(&conn).unwrap().classes[0].students,
            data.classes[0].students
        );
        assert_eq!(restored.revision, 1);
        drop(conn);
        let stem = path.file_stem().unwrap().to_str().unwrap();
        for entry in std::fs::read_dir(std::env::temp_dir()).unwrap() {
            let p = entry.unwrap().path();
            if p.file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.starts_with(stem))
            {
                std::fs::remove_file(p).unwrap();
            }
        }
    }
    #[test]
    fn unchanged_import_is_noop() {
        let mut c = setup();
        let mut h = vec![];
        let s = populated(&mut c, &mut h);
        let p = &s.classes[0].students[0];
        let size = h.len();
        let after = transact(
            &mut c,
            &id(),
            s.revision,
            Command::SaveStudents {
                class_id: s.classes[0].id.clone(),
                students: vec![StudentInput {
                    id: Some(p.id.clone()),
                    number: p.number,
                    name: p.name.clone(),
                    gender: None,
                }],
                delete_ids: vec![],
            },
            &mut h,
        )
        .unwrap();
        assert_eq!(after, s);
        assert_eq!(h.len(), size);
    }
    #[test]
    fn transactions_identity_and_undo() {
        let mut c = setup();
        let mut h = vec![];
        let s = transact(
            &mut c,
            &id(),
            0,
            Command::CreateClass {
                name: "테스트".into(),
            },
            &mut h,
        )
        .unwrap();
        let cid = s.classes[0].id.clone();
        let s = transact(
            &mut c,
            &id(),
            s.revision,
            Command::SaveStudents {
                class_id: cid.clone(),
                students: vec![
                    StudentInput {
                        id: None,
                        number: 1,
                        name: "동명".into(),
                        gender: None,
                    },
                    StudentInput {
                        id: None,
                        number: 3,
                        name: "동명".into(),
                        gender: None,
                    },
                ],
                delete_ids: vec![],
            },
            &mut h,
        )
        .unwrap();
        let a = s.classes[0].students[0].id.clone();
        let b = s.classes[0].students[1].id.clone();
        let cmd = Command::SaveStudents {
            class_id: cid,
            students: vec![
                StudentInput {
                    id: Some(a.clone()),
                    number: 3,
                    name: "개명".into(),
                    gender: None,
                },
                StudentInput {
                    id: Some(b),
                    number: 1,
                    name: "동명".into(),
                    gender: None,
                },
            ],
            delete_ids: vec![],
        };
        let op = id();
        let n = transact(&mut c, &op, s.revision, cmd.clone(), &mut h).unwrap();
        assert_eq!(
            transact(&mut c, &op, s.revision, cmd, &mut h)
                .unwrap()
                .revision,
            n.revision
        );
        let u = transact(&mut c, &id(), n.revision, Command::Undo, &mut h).unwrap();
        assert_eq!(u.classes[0].students[0].id, a);
        assert_eq!(u.classes[0].students[0].number, 1);
        assert!(transact(
            &mut c,
            &id(),
            0,
            Command::DeleteClass {
                class_id: u.classes[0].id.clone()
            },
            &mut h
        )
        .is_err());
    }
    #[test]
    fn invalid_batch_rolls_back() {
        let mut c = setup();
        let mut h = vec![];
        let s = transact(
            &mut c,
            &id(),
            0,
            Command::CreateClass { name: "반".into() },
            &mut h,
        )
        .unwrap();
        let input = StudentInput {
            id: None,
            number: 1,
            name: "학생".into(),
            gender: None,
        };
        assert!(transact(
            &mut c,
            &id(),
            1,
            Command::SaveStudents {
                class_id: s.classes[0].id.clone(),
                students: vec![input.clone(), input],
                delete_ids: vec![]
            },
            &mut h
        )
        .is_err());
        assert_eq!(read(&c).unwrap(), s);
    }
    #[test]
    fn future_schema_rejected() {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("PRAGMA user_version=9").unwrap();
        assert!(init(&c).is_err());
    }
    fn populated(c: &mut Connection, h: &mut Vec<(u64, Snapshot)>) -> Snapshot {
        let s = transact(
            c,
            &id(),
            0,
            Command::CreateClass {
                name: "검증 학급".into(),
            },
            h,
        )
        .unwrap();
        let cid = s.classes[0].id.clone();
        let s = transact(
            c,
            &id(),
            s.revision,
            Command::CreateGroups {
                class_id: cid.clone(),
                count: 2,
            },
            h,
        )
        .unwrap();
        transact(
            c,
            &id(),
            s.revision,
            Command::SaveStudents {
                class_id: cid,
                students: vec![StudentInput {
                    id: None,
                    number: 1,
                    name: "예시 하나".into(),
                    gender: None,
                }],
                delete_ids: vec![],
            },
            h,
        )
        .unwrap()
    }
    #[test]
    fn group_deletion_preserves_students_and_undo_restores_membership() {
        let mut c = setup();
        let mut h = vec![];
        let s = populated(&mut c, &mut h);
        let cid = s.classes[0].id.clone();
        let gid = s.classes[0].groups[0].id.clone();
        let pid = s.classes[0].students[0].id.clone();
        let s = transact(
            &mut c,
            &id(),
            s.revision,
            Command::Assign {
                class_id: cid.clone(),
                group_id: Some(gid.clone()),
                ids: vec![pid.clone()],
            },
            &mut h,
        )
        .unwrap();
        let d = transact(
            &mut c,
            &id(),
            s.revision,
            Command::DeleteGroup {
                class_id: cid,
                group_id: gid.clone(),
            },
            &mut h,
        )
        .unwrap();
        assert_eq!(d.classes[0].students[0].id, pid);
        assert_eq!(d.classes[0].students[0].group_id, None);
        let u = transact(&mut c, &id(), d.revision, Command::Undo, &mut h).unwrap();
        assert_eq!(u.classes[0].students[0].group_id, Some(gid));
    }
    #[test]
    fn class_deletion_and_undo_are_atomic() {
        let mut c = setup();
        let mut h = vec![];
        let s = populated(&mut c, &mut h);
        let d = transact(
            &mut c,
            &id(),
            s.revision,
            Command::DeleteClass {
                class_id: s.classes[0].id.clone(),
            },
            &mut h,
        )
        .unwrap();
        assert!(d.classes.is_empty());
        assert!(d.default_class_id.is_none());
        let u = transact(&mut c, &id(), d.revision, Command::Undo, &mut h).unwrap();
        assert_eq!(u.classes[0].students, s.classes[0].students);
        assert_eq!(u.default_class_id, s.default_class_id);
    }
    #[test]
    fn cross_class_assignment_rejected() {
        let mut c = setup();
        let mut h = vec![];
        let a = populated(&mut c, &mut h);
        let s = transact(
            &mut c,
            &id(),
            a.revision,
            Command::CreateClass {
                name: "다른 반".into(),
            },
            &mut h,
        )
        .unwrap();
        assert!(transact(
            &mut c,
            &id(),
            s.revision,
            Command::Assign {
                class_id: s.classes[1].id.clone(),
                ids: vec![s.classes[0].students[0].id.clone()],
                group_id: None
            },
            &mut h
        )
        .is_err());
        assert_eq!(read(&c).unwrap(), s);
    }
    #[test]
    fn restore_keeps_ids_and_rejects_invalid_reference() {
        let mut c = setup();
        let mut h = vec![];
        let s = populated(&mut c, &mut h);
        let backup = Backup {
            format: "tidy-classroom".into(),
            schema_version: 1,
            data: s.clone(),
        };
        let d = transact(
            &mut c,
            &id(),
            s.revision,
            Command::DeleteClass {
                class_id: s.classes[0].id.clone(),
            },
            &mut h,
        )
        .unwrap();
        let r = transact(
            &mut c,
            &id(),
            d.revision,
            Command::Restore {
                backup: backup.clone(),
            },
            &mut h,
        )
        .unwrap();
        assert_eq!(r.classes[0].students, s.classes[0].students);
        assert!(h.is_empty());
        let mut bad = backup;
        bad.data.classes[0].students[0].group_id = Some(id());
        assert!(transact(
            &mut c,
            &id(),
            r.revision,
            Command::Restore { backup: bad },
            &mut h
        )
        .is_err());
        assert_eq!(read(&c).unwrap(), r);
    }
    #[test]
    fn disk_reopen_preserves_data() {
        let path = std::env::temp_dir().join(format!("tidy-roster-test-{}.sqlite3", id()));
        let mut h = vec![];
        let expected;
        {
            let mut c = Connection::open(&path).unwrap();
            init(&c).unwrap();
            expected = populated(&mut c, &mut h);
        }
        let c = Connection::open(&path).unwrap();
        init(&c).unwrap();
        assert_eq!(read(&c).unwrap(), expected);
        drop(c);
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn storage_failure_does_not_change_history_or_data() {
        let mut c = setup();
        let mut h = vec![];
        let s = populated(&mut c, &mut h);
        let size = h.len();
        c.execute_batch("PRAGMA query_only=ON").unwrap();
        assert!(transact(
            &mut c,
            &id(),
            s.revision,
            Command::RenameClass {
                class_id: s.classes[0].id.clone(),
                name: "저장 실패".into()
            },
            &mut h
        )
        .is_err());
        assert_eq!(h.len(), size);
        assert_eq!(read(&c).unwrap(), s);
    }
}
