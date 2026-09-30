use super::model::{Class, Snapshot};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::sync::Mutex;
use tauri::Emitter;

static CONTEXT: Mutex<(Option<String>, bool)> = Mutex::new((None, true));
fn fail() -> String { "자리 배치 자료를 확인해 주세요. 저장된 자료는 그대로 유지됩니다.".into() }
fn items<'a>(v: &'a Value, key: &str) -> Result<&'a Vec<Value>, String> { v[key].as_array().ok_or_else(fail) }
fn text<'a>(v: &'a Value, key: &str) -> &'a str { v[key].as_str().unwrap_or("") }
fn default_archive_title(date: &str) -> String {
    let parts: Vec<_> = date.split('-').collect();
    if parts.len()!=3 { return "자리 저장".into(); }
    let month=parts[1].parse::<u32>().unwrap_or(0);
    let day=parts[2].parse::<u32>().unwrap_or(0);
    format!("{month}월 {day}일 저장")
}
fn num(v: &Value, key: &str) -> f64 { v[key].as_f64().unwrap_or(0.0) }
fn ids(v: &Value) -> Vec<&str> { v.as_array().map(|a| a.iter().filter_map(Value::as_str).collect()).unwrap_or_default() }
fn rule_ok(r: &Value, draft: &Value) -> bool {
    let Some(seats) = draft["layout"]["seats"].as_array() else { return false; };
    let student_ids = ids(&r["students"]);
    let found: Vec<_> = student_ids.iter().filter_map(|id| seats.iter().find(|s| draft["assignments"][text(s,"id")].as_str() == Some(*id))).collect();
    if found.len() != student_ids.len() { return true; }
    let Some(a) = found.first() else { return false; };
    // 바닥 여백 대신 실제 줄로 판정해 JS 조건 평가와 저장 시 검증을 일치시킵니다.
    let mut coordinates:Vec<f64>=seats.iter().filter(|s|s["active"]!=false).map(|s|num(s,"y")).collect();
    coordinates.sort_by(f64::total_cmp);
    let mut rows:Vec<f64>=Vec::new();
    for y in coordinates {if !rows.iter().any(|anchor|(anchor-y).abs()<=0.12){rows.push(y);}}
    let row=rows.iter().position(|y|(y-num(a,"y")).abs()<=0.12).unwrap_or(rows.len());
    match text(r,"kind") {
        "fixed" => text(a,"id") == text(r,"seatId"),
        "zone" => ids(&r["seatIds"]).contains(&text(a,"id")),
        "front" => row < rows.len().div_ceil(2),
        "back" => row >= rows.len().div_ceil(2),
        "apart" | "together" => {
            let Some(b) = found.get(1) else { return false; };
            let pair = !text(a,"pair").is_empty() && text(a,"pair") == text(b,"pair");
            let group = !text(a,"group").is_empty() && text(a,"group") == text(b,"group");
            if text(r,"kind") == "together" { return if text(r,"distance") == "group" { group } else { pair }; }
            match text(r,"distance") {
                "pair" => !pair, "group" => !group,
                "far" => (num(a,"x")-num(b,"x")).hypot(num(a,"y")-num(b,"y")) >= 3.0,
                _ => (num(a,"x")-num(b,"x")).abs()>1.65 || (num(a,"y")-num(b,"y")).abs()>1.85,
            }
        }
        _ => false,
    }
}
fn validate_draft(d: &Value, class: &Class, complete: bool) -> Result<(), String> {
    let seats=items(&d["layout"],"seats")?;
    if seats.len()>600 || items(&d["layout"],"props")?.len()>100 || items(d,"rules")?.len()>1000 || text(d,"title").chars().count()>100 { return Err(fail()); }
    let mut seat_ids=HashSet::new();
    for s in seats {
        if text(s,"id").is_empty() || !seat_ids.insert(text(s,"id")) || !["x","y"].iter().all(|k| s[k].as_f64().is_some_and(|x| x.is_finite()&&(0.0..=120.0).contains(&x))) || ![0,90,180,270].contains(&s["angle"].as_i64().unwrap_or(-1)) { return Err(fail()); }
    }
    let students:HashSet<_>=class.students.iter().map(|p|p.id.as_str()).collect();
    let excluded=ids(&d["excluded"]);
    if excluded.iter().any(|p|!students.contains(p)) {return Err(fail());}
    let assignments=d["assignments"].as_object().ok_or_else(fail)?;
    let mut occupied=HashSet::new();
    for (s,p) in assignments {
        let id=p.as_str().ok_or_else(fail)?;
        if !seat_ids.contains(s.as_str()) || !students.contains(id) || excluded.contains(&id) || !occupied.insert(id) || seats.iter().any(|seat|text(seat,"id")==s && seat["active"]==false) { return Err(fail()); }
    }
    for r in items(d,"rules")? {
        let people=ids(&r["students"]); let kind=text(r,"kind");
        if !["apart","together","fixed","front","back","zone"].contains(&kind) || people.len()!=if ["apart","together"].contains(&kind){2}else{1} || people.iter().any(|p|!students.contains(p)) || people.iter().collect::<HashSet<_>>().len()!=people.len() {return Err(fail());}
        if kind=="fixed"&&!seat_ids.contains(text(r,"seatId")){return Err(fail());}
        if kind=="zone"&&(ids(&r["seatIds"]).is_empty()||ids(&r["seatIds"]).iter().any(|s|!seat_ids.contains(s))){return Err(fail());}
        if complete && (people.iter().any(|p|!occupied.contains(*p)) || !rule_ok(r,d)) { return Err("배치 조건을 모두 지킬 수 있는지 확인해 주세요. 확정하지 않았어요.".into()); }
    }
    if complete && class.students.iter().filter(|p|!excluded.contains(&p.id.as_str())).count()!=occupied.len() { return Err("아직 자리가 없는 학생이 있어요.".into()); }
    Ok(())
}
pub fn validate_all(s: &Snapshot) -> Result<(),String> {
    for (id,doc) in &s.seating {
        let class=s.classes.iter().find(|c|&c.id==id).ok_or_else(fail)?;
        if doc["version"]!=1 || doc.to_string().len()>16*1024*1024 || items(doc,"archives")?.len()>1000 {return Err(fail());}
        validate_draft(&doc["draft"],class,false)?;
        for archive in items(doc,"archives")? { validate_draft(&archive["draft"],class,false)?; }
    }
    Ok(())
}
fn clean_draft(d:&mut Value, valid:&HashSet<String>) {
    if let Some(a)=d["assignments"].as_object_mut(){a.retain(|_,p|p.as_str().is_some_and(|id|valid.contains(id)));}
    if let Some(a)=d["rules"].as_array_mut(){a.retain(|r|ids(&r["students"]).iter().all(|id|valid.contains(*id)));}
    if let Some(a)=d["excluded"].as_array_mut(){a.retain(|p|p.as_str().is_some_and(|id|valid.contains(id)));}
    if let Some(a)=d["appearances"].as_object_mut(){a.retain(|id,_|valid.contains(id));}
}
fn compact_archives(doc:&mut Value) {
    let Some(existing)=doc["archives"].as_array() else{return;};
    let current_id=text(doc,"currentId").to_owned();
    let current_date=existing.iter().find(|a|text(a,"id")==current_id).map(|a|text(a,"date").to_owned());
    let mut ordered=existing.clone();
    ordered.sort_by_key(|a|a["createdAt"].as_u64().unwrap_or(0));
    let mut dates=HashSet::new();
    let mut kept:Vec<Value>=ordered.into_iter().rev().filter(|a|dates.insert(text(a,"date").to_owned())).collect();
    kept.reverse();
    if !current_id.is_empty()&&!kept.iter().any(|a|text(a,"id")==current_id) {
        doc["currentId"]=current_date.and_then(|date|kept.iter().find(|a|text(a,"date")==date).map(|a|a["id"].clone())).unwrap_or(Value::Null);
    }
    doc["archives"]=json!(kept);
}
pub fn reconcile(s:&mut Snapshot) {
    s.seating.retain(|id,_|s.classes.iter().any(|c|&c.id==id));
    for (id,doc) in &mut s.seating {
        let class=s.classes.iter().find(|c|&c.id==id).unwrap();
        let valid:HashSet<_>=class.students.iter().map(|p|p.id.clone()).collect();
        let before=doc.clone(); clean_draft(&mut doc["draft"],&valid);
        if let Some(archives)=doc["archives"].as_array_mut(){for a in archives {
            clean_draft(&mut a["draft"],&valid);
            if let Some(p)=a["students"].as_array_mut(){p.retain(|p|valid.contains(text(p,"id")));}
            for key in ["pairs","groups"] {if let Some(p)=a["relations"][key].as_array_mut(){p.retain(|v|v.as_str().is_some_and(|v|v.split('|').all(|id|valid.contains(id))));}}
        }}
        compact_archives(doc);
        if *doc!=before {doc["revision"]=json!(doc["revision"].as_u64().unwrap_or(0)+1);}
    }
}
fn relations(d:&Value)->Value {
    let seats=d["layout"]["seats"].as_array().unwrap();let mut pairs=vec![];let mut groups=vec![];
    for (i,a) in seats.iter().enumerate(){for b in seats.iter().skip(i+1){
        let p=d["assignments"][text(a,"id")].as_str();let q=d["assignments"][text(b,"id")].as_str();
        if let (Some(p),Some(q))=(p,q){let mut k=[p,q];k.sort();let key=k.join("|");if !text(a,"pair").is_empty()&&text(a,"pair")==text(b,"pair"){pairs.push(key.clone());}if !text(a,"group").is_empty()&&text(a,"group")==text(b,"group"){groups.push(key);}}
    }}json!({"pairs":pairs,"groups":groups})
}
pub fn apply(s:&mut Snapshot,id:&str,expected:u64,expected_class:u64,action:Value)->Result<(),String>{
    let class=s.classes.iter().find(|c|c.id==id).ok_or_else(fail)?;
    if class.revision!=expected_class{return Err("CLASS_CONFLICT: 명단이 바뀌었어요. 최신 명단을 확인해 주세요.".into());}
    let mut doc=s.seating.get(id).cloned().unwrap_or(json!({"version":1,"revision":0,"draft":null,"archives":[],"currentId":null}));
    if doc["revision"].as_u64()!=Some(expected){return Err("DOCUMENT_CONFLICT: 다른 창에서 수정했어요. 최신 내용을 불러와 주세요.".into());}
    match text(&action,"type") {
        "saveDraft"=>{validate_draft(&action["draft"],class,false)?;doc["draft"]=action["draft"].clone();}
        "confirm"=>{
            validate_draft(&doc["draft"],class,true)?;
            if let Some(current)=doc["archives"].as_array().and_then(|a|a.iter().find(|a|a["id"]==doc["currentId"])) {if current["draft"]==doc["draft"]&&current["used"]!=false{return Ok(());}}
            let archive_id=doc["archives"].as_array().and_then(|a|a.iter().filter(|a|text(a,"date")==text(&action,"date")).max_by_key(|a|a["createdAt"].as_u64().unwrap_or(0))).and_then(|a|a["id"].as_str().map(str::to_owned)).unwrap_or_else(super::model::id);
            let now=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|_|fail())?.as_millis();
            let title=doc["archives"].as_array().and_then(|a|a.iter().find(|a|a["id"]==archive_id)).map(|a|text(a,"title").to_owned()).filter(|t|!t.is_empty()).unwrap_or_else(||default_archive_title(text(&action,"date")));
            doc["draft"]["title"]=json!(title);
            let archive=json!({"id":archive_id,"createdAt":now,"date":text(&action,"date"),"title":title,"used":true,"draft":doc["draft"],"students":class.students,"relations":relations(&doc["draft"])});
            let archives=doc["archives"].as_array_mut().ok_or_else(fail)?;archives.retain(|a|text(a,"date")!=text(&action,"date"));archives.push(archive);doc["currentId"]=json!(archive_id);
        }
        "saveCurrent"=>{
            validate_draft(&doc["draft"],class,true)?;
            let session_id=text(&action,"sessionId");
            if session_id.is_empty()||session_id.chars().count()>100{return Err(fail());}
            let now=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|_|fail())?.as_millis();
            let archive_id=doc["archives"].as_array().and_then(|a|a.iter().filter(|a|text(a,"date")==text(&action,"date")).max_by_key(|a|a["createdAt"].as_u64().unwrap_or(0))).and_then(|a|a["id"].as_str().map(str::to_owned)).unwrap_or_else(super::model::id);
            let title=doc["archives"].as_array().and_then(|a|a.iter().find(|a|a["id"]==archive_id)).map(|a|text(a,"title").to_owned()).filter(|t|!t.is_empty()).unwrap_or_else(||default_archive_title(text(&action,"date")));
            doc["draft"]["title"]=json!(title);
            let archive=json!({"id":archive_id,"sessionId":session_id,"createdAt":now,"date":text(&action,"date"),"title":title,"used":true,"draft":doc["draft"],"students":class.students,"relations":relations(&doc["draft"])});
            let archives=doc["archives"].as_array_mut().ok_or_else(fail)?;
            archives.retain(|a|text(a,"date")!=text(&action,"date"));archives.push(archive);
            doc["currentId"]=json!(archive_id);
        }
        "deleteArchive"=>{let date=doc["archives"].as_array().and_then(|a|a.iter().find(|a|a["id"]==action["id"])).map(|a|text(a,"date").to_owned());doc["archives"].as_array_mut().ok_or_else(fail)?.retain(|a|a["id"]!=action["id"]&&date.as_deref()!=Some(text(a,"date")));if !doc["archives"].as_array().ok_or_else(fail)?.iter().any(|a|a["id"]==doc["currentId"]){doc["currentId"]=Value::Null;}}
        "renameArchive"=>{
            let title=text(&action,"title").trim();
            if title.is_empty()||title.chars().count()>100{return Err("기록 이름은 1~100자로 입력해 주세요.".into());}
            let current=doc["currentId"]==action["id"];
            let archive=doc["archives"].as_array_mut().ok_or_else(fail)?.iter_mut().find(|a|a["id"]==action["id"]).ok_or_else(||"수정할 자리 기록을 찾지 못했어요.".to_owned())?;
            archive["title"]=json!(title);archive["draft"]["title"]=json!(title);
            if current{doc["draft"]["title"]=json!(title);}
        }
        "setUsage"=>{let a=doc["archives"].as_array_mut().ok_or_else(fail)?.iter_mut().find(|a|a["id"]==action["id"]).ok_or_else(fail)?;a["used"]=json!(action["used"]==true);if action["used"]!=true&&doc["currentId"]==action["id"]{doc["currentId"]=Value::Null;}}
        _=>return Err(fail()),
    }
    compact_archives(&mut doc);
    doc["revision"]=json!(expected+1);s.seating.insert(id.to_string(),doc);Ok(())
}
#[tauri::command]
pub fn seating_context(app:tauri::AppHandle,window:tauri::WebviewWindow,class_id:Option<String>,follow:Option<bool>)->Result<Value,String>{
    let mut ctx=CONTEXT.lock().map_err(|_|fail())?;
    if let Some(f)=follow {if window.label()!="seating"{return Err(fail());}*ctx=(class_id,f);let _=app.emit("seating-context-changed",());}
    Ok(json!({"classId":ctx.0,"follow":ctx.1}))
}
#[tauri::command]
pub async fn seating_public(app:tauri::AppHandle)->Result<Value,String>{
    tauri::async_runtime::spawn_blocking(move||{
        let _lock=super::LOCK.lock().map_err(super::storage)?;let snapshot=super::read(&super::connect(&app)?)?;
        let ctx=CONTEXT.lock().map_err(|_|fail())?;let id=if ctx.1{snapshot.default_class_id.as_ref()}else{ctx.0.as_ref()};
        let Some(id)=id else{return Ok(Value::Null)};let Some(doc)=snapshot.seating.get(id) else{return Ok(Value::Null)};
        let Some(archive)=doc["archives"].as_array().and_then(|a|a.iter().find(|a|a["id"]==doc["currentId"]&&a["used"]!=false)) else{return Ok(Value::Null)};
        let class=snapshot.classes.iter().find(|c|&c.id==id).ok_or_else(fail)?;Ok(project(&archive["draft"],&archive["students"],&class.name,text(archive,"date")))
    }).await.map_err(super::storage)?
}
fn project(d:&Value,students:&Value,class_name:&str,date:&str)->Value{
    let seats:Vec<_>=d["layout"]["seats"].as_array().unwrap().iter().enumerate().map(|(i,s)|{
        let student=students.as_array().and_then(|p|p.iter().find(|p|p["id"]==d["assignments"][text(s,"id")]));
        let p=student.unwrap_or(&Value::Null);let gender=text(p,"gender");
        json!({"id":format!("place-{i}"),"x":s["x"],"y":s["y"],"angle":s["angle"],"active":s["active"],"name":text(p,"name"),"number":p["number"],"appearance":gender,"gender":gender})
    }).collect();
    let props:Vec<Value>=Vec::new();
    json!({"title":d["title"],"className":class_name,"date":date,"seats":seats,"props":props})
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::classroom::model::Student;

    #[test]
    fn front_and_back_use_actual_active_rows_even_with_large_gaps() {
        let mut draft=json!({"layout":{"seats":[
            {"id":"s1","x":1,"y":10,"angle":0,"active":true},
            {"id":"s2","x":1,"y":11,"angle":0,"active":true},
            {"id":"s3","x":1,"y":80,"angle":0,"active":true},
            {"id":"s4","x":1,"y":100,"angle":0,"active":true},
            {"id":"unused","x":1,"y":120,"angle":0,"active":false}
        ]},"assignments":{"s2":"a","s3":"b"}});
        assert!(rule_ok(&json!({"kind":"front","students":["a"]}),&draft));
        assert!(!rule_ok(&json!({"kind":"back","students":["a"]}),&draft));
        assert!(rule_ok(&json!({"kind":"back","students":["b"]}),&draft));
        draft["assignments"]=json!({"s1":"a","s2":"b"});
        draft["layout"]["seats"].as_array_mut().unwrap().truncate(2);
        assert!(rule_ok(&json!({"kind":"back","students":["b"]}),&draft));
        draft["layout"]["seats"].as_array_mut().unwrap().truncate(1);
        assert!(!rule_ok(&json!({"kind":"back","students":["a"]}),&draft));
    }

    #[test]
    fn saving_current_preserves_sparse_geometry_and_preset_rules() {
        let class=Class{id:"c".into(),name:"학급".into(),revision:0,groups:vec![],students:["a","b"].into_iter().enumerate().map(|(i,id)|Student{id:id.into(),number:i as u32+1,name:id.into(),gender:"unspecified".into(),group_id:None}).collect()};
        let layout=json!({"shape":"single","columns":3,"rows":2,"front":"top","props":[],"seats":[
            {"id":"s1","x":1,"y":1,"angle":0,"active":true},
            {"id":"s2","x":2.38,"y":1,"angle":0,"active":true},
            {"id":"s3","x":3.76,"y":2.65,"angle":0,"active":true}
        ]});
        let rules=json!([{"id":"pin","kind":"zone","students":["a"],"seatIds":["s3"]}]);
        let draft=json!({"title":"자리","layout":layout,"assignments":{"s1":"b","s3":"a"},"rules":rules,"excluded":[],"appearances":{}});
        let mut snapshot=Snapshot::default();snapshot.classes.push(class);
        snapshot.seating.insert("c".into(),json!({"version":1,"revision":0,"draft":draft,"archives":[],"currentId":null}));
        apply(&mut snapshot,"c",0,0,json!({"type":"saveCurrent","date":"2026-09-30","sessionId":"session"})).unwrap();
        assert_eq!(snapshot.seating["c"]["draft"]["layout"],layout);
        assert_eq!(snapshot.seating["c"]["archives"][0]["draft"]["layout"],layout);
        assert_eq!(snapshot.seating["c"]["archives"][0]["draft"]["rules"],rules);
        assert!(snapshot.seating["c"]["archives"][0]["draft"]["assignments"].get("s2").is_none());
    }

    #[test]
    fn previously_optional_rule_prevents_confirming_a_violating_arrangement() {
        let class=Class {
            id:"class".into(),name:"우리 반".into(),revision:0,groups:vec![],
            students:["a","b"].into_iter().enumerate().map(|(i,id)|Student {
                id:id.into(),number:i as u32+1,name:id.into(),gender:"unspecified".into(),group_id:None,
            }).collect(),
        };
        let mut draft=json!({
            "title":"우리 반 자리",
            "layout":{"seats":[
                {"id":"s1","x":1.0,"y":1.0,"angle":0,"active":true,"pair":"pair-1","group":""},
                {"id":"s2","x":2.0,"y":1.0,"angle":0,"active":true,"pair":"pair-1","group":""}
            ],"props":[]},
            "assignments":{"s1":"a","s2":"b"},"excluded":[],
            "rules":[{"kind":"apart","students":["a","b"],"distance":"pair","hard":false}]
        });
        assert!(validate_draft(&draft,&class,false).is_ok());
        assert!(validate_draft(&draft,&class,true).is_err());
        draft["rules"][0].as_object_mut().unwrap().remove("hard");
        assert!(validate_draft(&draft,&class,true).is_err());
    }
}

#[cfg(test)]
mod daily_history_tests {
    use super::*;
    use super::super::model::Student;

    #[test]
    fn last_result_replaces_the_same_day_across_sessions() {
        let student=Student{id:"p1".into(),number:1,name:"학생".into(),gender:"unspecified".into(),group_id:None};
        let class=Class{id:"c".into(),name:"학급".into(),revision:0,students:vec![student],groups:vec![]};
        let draft=json!({"title":"우리 반 자리","layout":{"seats":[{"id":"s1","x":1,"y":1,"angle":0,"active":true}],"props":[]},"assignments":{"s1":"p1"},"rules":[],"excluded":[],"appearances":{}});
        let mut snapshot=Snapshot::default();snapshot.classes.push(class);
        snapshot.seating.insert("c".into(),json!({"version":1,"revision":0,"draft":draft,"archives":[],"currentId":null}));
        apply(&mut snapshot,"c",0,0,json!({"type":"saveCurrent","date":"2026-09-26","sessionId":"first"})).unwrap();
        let first_id=snapshot.seating["c"]["currentId"].clone();
        assert_eq!(snapshot.seating["c"]["archives"][0]["title"],"9월 26일 저장");
        apply(&mut snapshot,"c",1,0,json!({"type":"renameArchive","id":first_id,"title":" 가을 자리 "})).unwrap();
        assert_eq!(snapshot.seating["c"]["archives"][0]["title"],"가을 자리");
        assert_eq!(snapshot.seating["c"]["draft"]["title"],"가을 자리");
        apply(&mut snapshot,"c",2,0,json!({"type":"saveCurrent","date":"2026-09-26","sessionId":"second"})).unwrap();
        assert_eq!(snapshot.seating["c"]["archives"].as_array().unwrap().len(),1);
        assert_eq!(snapshot.seating["c"]["currentId"],first_id);
        assert_eq!(snapshot.seating["c"]["archives"][0]["title"],"가을 자리");
        apply(&mut snapshot,"c",3,0,json!({"type":"saveCurrent","date":"2026-09-27","sessionId":"second"})).unwrap();
        assert_eq!(snapshot.seating["c"]["archives"].as_array().unwrap().len(),2);
        assert_eq!(snapshot.seating["c"]["archives"][1]["title"],"9월 27일 저장");
        let legacy=snapshot.seating["c"]["archives"][0].clone();
        snapshot.seating.get_mut("c").unwrap()["archives"].as_array_mut().unwrap().push(json!({"id":"legacy","date":"2026-09-26","createdAt":0,"draft":legacy["draft"],"students":legacy["students"],"relations":legacy["relations"],"title":"우리 반 자리","used":true}));
        apply(&mut snapshot,"c",4,0,json!({"type":"deleteArchive","id":first_id})).unwrap();
        assert_eq!(snapshot.seating["c"]["archives"].as_array().unwrap().len(),1);
    }
}
