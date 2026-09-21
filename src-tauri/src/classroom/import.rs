use calamine::{Reader, Xlsx};
use quick_xml::{events::Event, Reader as Xml};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Cursor, Read};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use unicode_normalization::UnicodeNormalization;
static JOBS: std::sync::OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> =
    std::sync::OnceLock::new();
fn jobs() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    JOBS.get_or_init(|| Mutex::new(HashMap::new()))
}
static DROPPED: Mutex<Option<(String, std::path::PathBuf)>> = Mutex::new(None);
pub fn clear_transients() {
    if let Ok(mut dropped) = DROPPED.lock() {
        *dropped = None;
    }
    if let Ok(jobs) = jobs().lock() {
        for job in jobs.values() {
            job.store(true, Ordering::Relaxed);
        }
    }
}
pub fn register_drop(path: &std::path::Path) -> Option<String> {
    let token = uuid::Uuid::new_v4().to_string();
    if let Ok(mut d) = DROPPED.lock() {
        *d = Some((token.clone(), path.to_owned()));
        Some(token)
    } else {
        None
    }
}
#[tauri::command]
pub async fn classroom_take_drop(token: String) -> Result<serde_json::Value, String> {
    let path = {
        let mut d = DROPPED.lock().map_err(|_| err())?;
        if d.as_ref().map(|v| &v.0) != Some(&token) {
            return Err(err());
        }
        d.take().unwrap().1
    };
    tauri::async_runtime::spawn_blocking(move||{let f=std::fs::File::open(&path).map_err(|_|err())?;let mut bytes=vec![];f.take(20*1024*1024+1).read_to_end(&mut bytes).map_err(|_|err())?;if bytes.len()>20*1024*1024{return Err("LIMIT_EXCEEDED: 20MB 이하 파일을 선택해 주세요.".into());}Ok(serde_json::json!({"name":path.file_name().and_then(|n|n.to_str()).unwrap_or("file"),"bytes":bytes}))}).await.map_err(|_|err())?
}
thread_local! { static JOB: std::cell::RefCell<Option<(Arc<AtomicBool>,std::time::Instant)>> = const { std::cell::RefCell::new(None) }; }
fn checkpoint() -> Result<(), String> {
    JOB.with(|job| {
        if job.borrow().as_ref().is_some_and(|(cancel, start)| {
            cancel.load(Ordering::Relaxed) || start.elapsed().as_secs() > 30
        }) {
            Err("CANCELLED: 파일 분석을 중단했어요.".into())
        } else {
            Ok(())
        }
    })
}
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Candidate {
    pub number: String,
    pub name: String,
    pub gender: Option<String>,
    pub issue: String,
}
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Table {
    pub label: String,
    pub students: Vec<Candidate>,
    pub excluded: usize,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Columns {
    pub number: Option<usize>,
    pub name: usize,
    pub gender: Option<usize>,
    pub start_row: usize,
}
fn projected(
    label: String,
    rows: Vec<Vec<String>>,
    columns: Option<&Columns>,
) -> Result<Vec<Table>, String> {
    if let Some(c) = columns {
        if c.name > 99
            || c.number.is_some_and(|n| n > 99)
            || c.gender.is_some_and(|n| n > 99)
            || c.start_row > 10000
        {
            return Err(err());
        }
        let mut selected = vec![vec![
            "번호".into(),
            "이름".into(),
            if c.gender.is_some() {
                "성별".into()
            } else {
                "".into()
            },
        ]];
        if c.number.is_none() {
            selected[0][0] = "".into();
        }
        for row in rows.into_iter().skip(c.start_row.saturating_sub(1)) {
            let at = |n: Option<usize>| n.and_then(|n| row.get(n)).cloned().unwrap_or_default();
            selected.push(vec![at(c.number), at(Some(c.name)), at(c.gender)]);
        }
        return project(label, selected);
    }
    project(label, rows)
}
fn err() -> String {
    "IMPORT_UNSUPPORTED: 파일을 읽지 못했어요. XLSX·CSV·HWPX 또는 텍스트 PDF인지 확인해 주세요."
        .into()
}
fn key(v: &str) -> String {
    v.nfkc().filter(|c| !c.is_whitespace()).collect()
}
pub fn project(label: String, rows: Vec<Vec<String>>) -> Result<Vec<Table>, String> {
    if rows.iter().map(Vec::len).sum::<usize>() > 100000 {
        return Err("LIMIT_EXCEEDED: 표가 너무 커요.".into());
    }
    let mut columns = None;
    let mut tables: Vec<Table> = vec![];
    let mut current = String::new();
    for row in rows {
        checkpoint()?;
        let ks: Vec<_> = row.iter().map(|s| key(s)).collect();
        let ni = ks
            .iter()
            .position(|s| ["이름", "성명", "학생명", "학생이름"].contains(&s.as_str()));
        if let Some(n) = ni {
            columns = Some((
                ks.iter()
                    .position(|s| ["번호", "출석번호", "학생번호"].contains(&s.as_str())),
                n,
                ks.iter().position(|s| s == "성별"),
                ks.iter().position(|s| s == "학년"),
                ks.iter().position(|s| s == "반"),
            ));
            continue;
        }
        let Some((num, n, g, grade, cls)) = columns else {
            continue;
        };
        let at = |i: Option<usize>| {
            i.and_then(|i| row.get(i))
                .map(|s| s.trim().to_string())
                .unwrap_or_default()
        };
        let name = at(Some(n));
        let number = at(num);
        let gender = at(g);
        if row
            .iter()
            .any(|v| v.starts_with("재적수") || v.starts_with("총원") || key(v) == "합계")
        {
            continue;
        }
        if name.is_empty() {
            if let Some(t) = tables.last_mut() {
                t.excluded += 1;
            }
            continue;
        }
        let scope = format!("{} {}", at(grade), at(cls)).trim().to_string();
        if tables.is_empty() || scope != current {
            current = scope.clone();
            tables.push(Table {
                label: if scope.is_empty() {
                    label.clone()
                } else {
                    format!("{label} · {scope}")
                },
                students: vec![],
                excluded: 0,
            });
        }
        let mut issue = String::new();
        let normalized_num = key(&number);
        if num.is_some()
            && normalized_num
                .parse::<u32>()
                .ok()
                .filter(|n| *n > 0 && *n <= 9999)
                .is_none()
        {
            issue = "번호를 확인해 주세요.".into();
        }
        let gender = if g.is_none() {
            None
        } else {
            Some(
                match key(&gender).as_str() {
                    "남" | "남성" | "M" | "m" => "male",
                    "여" | "여성" | "F" | "f" => "female",
                    "" | "미선택" | "선택안함" => "unspecified",
                    _ => {
                        issue = "성별을 확인해 주세요.".into();
                        "unspecified"
                    }
                }
                .into(),
            )
        };
        tables.last_mut().unwrap().students.push(Candidate {
            number: normalized_num,
            name,
            gender,
            issue,
        });
    }
    if tables.is_empty() {
        return Err("IMPORT_AMBIGUOUS: 번호·이름 머리글을 찾지 못했어요. 표의 머리글을 확인하거나 이름을 복사해서 붙여넣어 주세요.".into());
    }
    if tables.iter().any(|t| t.students.len() > 500) {
        return Err("LIMIT_EXCEEDED: 한 학급은 500명까지 등록할 수 있어요.".into());
    }
    Ok(tables)
}
fn zip_check(bytes: &[u8]) -> Result<(), String> {
    let mut z = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_| err())?;
    if z.len() > 2000 {
        return Err(err());
    }
    let mut total = 0;
    for i in 0..z.len() {
        checkpoint()?;
        let mut f = z.by_index(i).map_err(|_| err())?;
        if f.enclosed_name().is_none() {
            return Err(err());
        }
        total += f.size();
        if total > 100 * 1024 * 1024 {
            return Err("LIMIT_EXCEEDED: 압축을 푼 자료가 너무 커요.".into());
        }
        let mut read = 0u64;
        let mut chunk = [0u8; 65536];
        loop {
            checkpoint()?;
            let n = f.read(&mut chunk).map_err(|_| err())?;
            if n == 0 {
                break;
            }
            read += n as u64;
            if read > 100 * 1024 * 1024 {
                return Err(err());
            }
        }
        if read != f.size() {
            return Err(err());
        }
    }
    Ok(())
}
fn xlsx_bounds(bytes: &[u8]) -> Result<(), String> {
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_| err())?;
    let mut total_cells = 0usize;
    for i in 0..zip.len() {
        let mut file = zip.by_index(i).map_err(|_| err())?;
        if !file.name().starts_with("xl/worksheets/") || !file.name().ends_with(".xml") {
            continue;
        }
        let mut xml = String::new();
        file.read_to_string(&mut xml).map_err(|_| err())?;
        let mut reader = Xml::from_str(&xml);
        let mut max_row = 0usize;
        let mut max_col = 0usize;
        loop {
            checkpoint()?;
            match reader.read_event().map_err(|_| err())? {
                Event::Start(e) | Event::Empty(e) if e.local_name().as_ref() == b"c" => {
                    total_cells += 1;
                    if total_cells > 100000 {
                        return Err("LIMIT_EXCEEDED: 표가 너무 커요.".into());
                    }
                    for attr in e.attributes() {
                        let a = attr.map_err(|_| err())?;
                        if a.key.as_ref() != b"r" {
                            continue;
                        }
                        let address = std::str::from_utf8(&a.value).map_err(|_| err())?;
                        let mut col = 0usize;
                        let mut row = 0usize;
                        for ch in address.chars() {
                            if ch.is_ascii_uppercase() {
                                col = col
                                    .saturating_mul(26)
                                    .saturating_add((ch as u8 - b'A' + 1) as usize);
                            } else if ch.is_ascii_digit() {
                                row = row
                                    .saturating_mul(10)
                                    .saturating_add(ch.to_digit(10).unwrap() as usize);
                            }
                        }
                        max_col = max_col.max(col);
                        max_row = max_row.max(row);
                        if max_col.saturating_mul(max_row) > 100000 {
                            return Err("LIMIT_EXCEEDED: 표의 범위가 너무 커요. 명단 부분만 새 파일로 저장해 주세요.".into());
                        }
                    }
                }
                Event::DocType(_) => return Err(err()),
                Event::Eof => break,
                _ => {}
            }
        }
    }
    Ok(())
}
#[cfg(test)]
fn parse(extension: &str, bytes: Vec<u8>) -> Result<Vec<Table>, String> {
    parse_mapped(extension, bytes, None)
}
pub fn parse_mapped(
    extension: &str,
    bytes: Vec<u8>,
    columns: Option<Columns>,
) -> Result<Vec<Table>, String> {
    if bytes.len() > 20 * 1024 * 1024 {
        return Err("LIMIT_EXCEEDED: 20MB 이하 파일을 선택해 주세요.".into());
    }
    match extension {
        "xlsx" => {
            zip_check(&bytes)?;
            xlsx_bounds(&bytes)?;
            let mut w: Xlsx<_> = Xlsx::new(Cursor::new(bytes)).map_err(|_| err())?;
            let names = w.sheet_names().to_vec();
            if names.len() > 20 {
                return Err(err());
            }
            let mut out = vec![];
            let mut cells = 0;
            for (i, n) in names.iter().enumerate() {
                checkpoint()?;
                let r = w.worksheet_range(n).map_err(|_| err())?;
                let formulas = w.worksheet_formula(n).map_err(|_| err())?;
                if formulas
                    .used_cells()
                    .any(|(_, _, formula)| !formula.is_empty())
                {
                    return Err(
                        "IMPORT_AMBIGUOUS: 수식이 있는 표는 값만 붙여넣은 파일로 가져와 주세요."
                            .into(),
                    );
                }
                cells += r.get_size().0.saturating_mul(r.get_size().1);
                if cells > 100000 {
                    return Err("LIMIT_EXCEEDED: 표가 너무 커요.".into());
                }
                let rows = r
                    .rows()
                    .map(|r| r.iter().map(ToString::to_string).collect())
                    .collect();
                match projected(format!("시트 {}", i + 1), rows, columns.as_ref()) {
                    Ok(mut t) => out.append(&mut t),
                    Err(e) if e.starts_with("IMPORT_AMBIGUOUS") => {}
                    Err(e) => return Err(e),
                }
            }
            if out.is_empty() {
                Err("IMPORT_AMBIGUOUS: 이름 또는 성명 머리글이 있는 표를 찾지 못했어요.".into())
            } else {
                Ok(out)
            }
        }
        "csv" => {
            let text = match std::str::from_utf8(&bytes) {
                Ok(v) => v.trim_start_matches('\u{feff}').to_owned(),
                Err(_) => {
                    let (v, _, bad) = encoding_rs::EUC_KR.decode(&bytes);
                    if bad {
                        return Err("IMPORT_AMBIGUOUS: 문자 인코딩을 읽지 못했어요. UTF-8 CSV로 저장해 주세요.".into());
                    }
                    v.into_owned()
                }
            };
            let delim = if text.lines().next().unwrap_or("").contains('\t') {
                b'\t'
            } else {
                b','
            };
            let mut r = csv::ReaderBuilder::new()
                .has_headers(false)
                .flexible(true)
                .delimiter(delim)
                .from_reader(text.as_bytes());
            let rows = r
                .records()
                .take(100001)
                .map(|r| {
                    r.map(|r| r.iter().map(str::to_owned).collect())
                        .map_err(|_| err())
                })
                .collect::<Result<Vec<_>, _>>()?;
            projected("CSV".into(), rows, columns.as_ref())
        }
        "hwpx" => {
            zip_check(&bytes)?;
            let mut z = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_| err())?;
            let mut files: Vec<_> = z
                .file_names()
                .filter(|n| n.starts_with("Contents/section") && n.ends_with(".xml"))
                .map(str::to_owned)
                .collect();
            files.sort();
            let mut out = vec![];
            for f in files {
                let mut data = String::new();
                z.by_name(&f)
                    .map_err(|_| err())?
                    .read_to_string(&mut data)
                    .map_err(|_| err())?;
                let mut reader = Xml::from_str(&data);
                let mut rows = vec![];
                let mut row = vec![];
                let mut cell = String::new();
                let mut column = 0usize;
                let mut text = false;
                let mut depth = 0;
                let mut table_depth = 0;
                loop {
                    checkpoint()?;
                    match reader.read_event().map_err(|_| err())? {
                        Event::Start(e) => {
                            depth += 1;
                            if depth > 64 {
                                return Err(err());
                            }
                            match e.local_name().as_ref() {
                                b"tbl" => {
                                    table_depth += 1;
                                    if table_depth > 1 {
                                        return Err(
                                            "IMPORT_AMBIGUOUS: 중첩 표는 XLSX로 변환해 주세요."
                                                .into(),
                                        );
                                    }
                                }
                                b"tr" => row.clear(),
                                b"tc" => {
                                    cell.clear();
                                    column = row.len();
                                }
                                b"t" => text = true,
                                _ => {}
                            }
                        }
                        Event::DocType(_) => return Err(err()),
                        Event::Empty(e) if e.local_name().as_ref() == b"cellAddr" => {
                            for a in e.attributes() {
                                let a = a.map_err(|_| err())?;
                                if a.key.as_ref() == b"colAddr" {
                                    column = std::str::from_utf8(&a.value)
                                        .map_err(|_| err())?
                                        .parse()
                                        .map_err(|_| err())?;
                                    if column > 1000 {
                                        return Err(err());
                                    }
                                }
                            }
                        }
                        Event::Text(e) if text => cell.push_str(&e.unescape().map_err(|_| err())?),
                        Event::End(e) => {
                            depth -= 1;
                            match e.local_name().as_ref() {
                                b"t" => text = false,
                                b"tc" => {
                                    if row.len() <= column {
                                        row.resize(column + 1, String::new());
                                    }
                                    row[column] = std::mem::take(&mut cell);
                                }
                                b"tr" => rows.push(std::mem::take(&mut row)),
                                b"tbl" => {
                                    table_depth -= 1;
                                    match projected(
                                        format!("표 {}", out.len() + 1),
                                        std::mem::take(&mut rows),
                                        columns.as_ref(),
                                    ) {
                                        Ok(mut t) => out.append(&mut t),
                                        Err(e) if e.starts_with("IMPORT_AMBIGUOUS") => {}
                                        Err(e) => return Err(e),
                                    }
                                }
                                _ => {}
                            }
                        }
                        Event::Eof => break,
                        _ => {}
                    }
                }
            }
            if out.is_empty() {
                Err("IMPORT_AMBIGUOUS: 이름 머리글이 있는 표를 찾지 못했어요.".into())
            } else {
                Ok(out)
            }
        }
        _ => Err(err()),
    }
}
#[tauri::command]
pub async fn classroom_parse(
    extension: String,
    bytes: Vec<u8>,
    columns: Option<Columns>,
    request_id: String,
) -> Result<Vec<Table>, String> {
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut jobs = jobs().lock().map_err(|_| err())?;
        if jobs.len() >= 2 {
            return Err("LIMIT_EXCEEDED: 이전 파일 분석을 마친 뒤 다시 시도해 주세요.".into());
        }
        jobs.insert(request_id.clone(), cancel.clone());
    }
    let result = tauri::async_runtime::spawn_blocking(move || {
        JOB.with(|j| *j.borrow_mut() = Some((cancel, std::time::Instant::now())));
        let result = parse_mapped(&extension, bytes, columns).and_then(|r| {
            checkpoint()?;
            Ok(r)
        });
        JOB.with(|j| *j.borrow_mut() = None);
        result
    })
    .await
    .map_err(|_| err());
    if let Ok(mut jobs) = jobs().lock() {
        jobs.remove(&request_id);
    }
    result?
}
#[tauri::command]
pub fn classroom_cancel_parse(request_id: String) {
    if let Ok(jobs) = jobs().lock() {
        if let Some(job) = jobs.get(&request_id) {
            job.store(true, Ordering::Relaxed);
        }
    }
}
#[tauri::command]
pub fn classroom_project(
    rows: Vec<Vec<String>>,
    columns: Option<Columns>,
) -> Result<Vec<Table>, String> {
    projected("표".into(), rows, columns.as_ref())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn csv_quotes_and_class_boundaries() {
        let csv="학년,반,번호,성명,성별,비고\n5,1,1,\"예시,학생\",여성,제외\n5,2,1,다른학생,남성,제외\n";
        let t = parse("csv", csv.as_bytes().to_vec()).unwrap();
        assert_eq!(t.len(), 2);
        assert_eq!(t[0].students[0].name, "예시,학생");
        assert_eq!(t[0].students[0].gender.as_deref(), Some("female"));
        assert!(!serde_json::to_string(&t).unwrap().contains("제외"));
    }
    #[test]
    fn explicit_mapping_keeps_only_selected_fields() {
        let csv = "무관,사용자명,순번\n비저장,홍길동,8\n";
        let t = parse_mapped(
            "csv",
            csv.as_bytes().to_vec(),
            Some(Columns {
                number: Some(2),
                name: 1,
                gender: None,
                start_row: 2,
            }),
        )
        .unwrap();
        assert_eq!(t[0].students[0].number, "8");
        assert_eq!(t[0].students[0].name, "홍길동");
        assert!(!serde_json::to_string(&t).unwrap().contains("비저장"));
    }
    #[test]
    fn cp949_and_unknown_gender() {
        let (data, _, _) = encoding_rs::EUC_KR.encode("번호,이름,성별\n1,가나다,알수없음\n");
        let t = parse("csv", data.into_owned()).unwrap();
        assert!(!t[0].students[0].issue.is_empty());
        assert_eq!(t[0].students[0].name, "가나다");
    }
    #[test]
    fn filters_and_absence() {
        let rows = vec![
            vec!["번호", "이 름", "연락처"],
            vec!["1", "예시", "비저장"],
            vec!["3", "동명", "비저장"],
            vec!["4", "", ""],
            vec!["재적수 : 2명", "", ""],
        ]
        .into_iter()
        .map(|r| r.into_iter().map(str::to_owned).collect())
        .collect();
        let t = project("표".into(), rows).unwrap();
        assert_eq!(t[0].students.len(), 2);
        assert_eq!(t[0].students[1].number, "3");
        assert!(t[0].students[0].gender.is_none());
        assert!(!serde_json::to_string(&t).unwrap().contains("비저장"));
    }
    #[test]
    fn local_samples() {
        let dir =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.local-fixtures/student");
        if !dir.exists() {
            return;
        }
        let mut count = 0;
        for f in std::fs::read_dir(dir).unwrap() {
            let p = f.unwrap().path();
            let ext = p.extension().and_then(|v| v.to_str()).unwrap_or("");
            if ["xlsx", "hwpx"].contains(&ext) {
                let t = parse(ext, std::fs::read(&p).unwrap()).unwrap();
                let n: usize = t.iter().map(|t| t.students.len()).sum();
                assert_eq!(n, if ext == "hwpx" { 20 } else { 21 });
                count += 1;
            }
        }
        assert_eq!(count, 3);
    }
}
