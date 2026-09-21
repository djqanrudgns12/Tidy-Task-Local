use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use unicode_normalization::UnicodeNormalization;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Student {
    pub id: String,
    pub number: u32,
    pub name: String,
    pub gender: String,
    pub group_id: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Group {
    pub id: String,
    pub name: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Class {
    pub id: String,
    pub name: String,
    pub revision: u64,
    pub students: Vec<Student>,
    pub groups: Vec<Group>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Snapshot {
    pub revision: u64,
    pub default_class_id: Option<String>,
    pub classes: Vec<Class>,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StudentInput {
    pub id: Option<String>,
    pub number: u32,
    pub name: String,
    pub gender: Option<String>,
}
#[derive(Clone, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Command {
    CreateClass {
        name: String,
    },
    RenameClass {
        class_id: String,
        name: String,
    },
    DeleteClass {
        class_id: String,
    },
    SetDefault {
        class_id: Option<String>,
    },
    SaveStudents {
        class_id: String,
        students: Vec<StudentInput>,
        delete_ids: Vec<String>,
    },
    DeleteStudents {
        class_id: String,
        ids: Vec<String>,
    },
    CreateGroups {
        class_id: String,
        count: usize,
    },
    RenameGroup {
        class_id: String,
        group_id: String,
        name: String,
    },
    DeleteGroup {
        class_id: String,
        group_id: String,
    },
    ReorderGroups {
        class_id: String,
        ids: Vec<String>,
    },
    Assign {
        class_id: String,
        ids: Vec<String>,
        group_id: Option<String>,
    },
    Restore {
        backup: Backup,
    },
    Undo,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Backup {
    pub format: String,
    pub schema_version: u32,
    pub data: Snapshot,
}
pub fn id() -> String {
    uuid::Uuid::new_v4().to_string()
}
pub fn name(value: &str, max: usize) -> Result<String, String> {
    let s: String = value.trim().nfc().collect();
    if s.is_empty() || s.chars().count() > max || s.chars().any(char::is_control) {
        return Err("VALIDATION: 이름의 길이와 내용을 확인해 주세요.".into());
    }
    Ok(s)
}
fn fail(s: &str) -> String {
    format!("VALIDATION: {s}")
}
pub fn validate(s: &Snapshot) -> Result<(), String> {
    if s.classes.len() > 100 {
        return Err(fail("학급은 100개까지 등록할 수 있어요."));
    }
    let mut all = HashSet::new();
    for c in &s.classes {
        if uuid::Uuid::parse_str(&c.id).is_err()
            || !all.insert(&c.id)
            || name(&c.name, 60)? != c.name
        {
            return Err(fail("학급 정보가 올바르지 않아요."));
        }
        if c.students.len() > 500 || c.groups.len() > 100 {
            return Err(fail("학생 또는 모둠 수가 한도를 넘었어요."));
        }
        let mut nums = HashSet::new();
        let mut groups = HashSet::new();
        let mut names = HashSet::new();
        for g in &c.groups {
            if uuid::Uuid::parse_str(&g.id).is_err()
                || !all.insert(&g.id)
                || !groups.insert(&g.id)
                || !names.insert(name(&g.name, 40)?)
            {
                return Err(fail("모둠 이름이나 ID가 중복돼요."));
            }
        }
        for p in &c.students {
            if uuid::Uuid::parse_str(&p.id).is_err()
                || !all.insert(&p.id)
                || p.number == 0
                || p.number > 9999
                || !nums.insert(p.number)
            {
                return Err("NUMBER_CONFLICT: 번호는 1~9999의 서로 다른 숫자여야 해요.".into());
            }
            if name(&p.name, 80)? != p.name
                || !["male", "female", "unspecified"].contains(&p.gender.as_str())
                || p.group_id.as_ref().is_some_and(|g| !groups.contains(g))
            {
                return Err(fail("학생 정보나 모둠 소속을 확인해 주세요."));
            }
        }
    }
    if s.default_class_id
        .as_ref()
        .is_some_and(|id| !s.classes.iter().any(|c| &c.id == id))
    {
        return Err(fail("기본 학급을 찾지 못했어요."));
    }
    Ok(())
}
fn class<'a>(s: &'a mut Snapshot, id: &str) -> Result<&'a mut Class, String> {
    s.classes
        .iter_mut()
        .find(|c| c.id == id)
        .ok_or_else(|| "NOT_FOUND: 학급이 삭제되었어요.".into())
}
fn ids_exist(c: &Class, ids: &[String]) -> Result<(), String> {
    if ids.iter().collect::<HashSet<_>>().len() != ids.len()
        || ids.iter().any(|id| !c.students.iter().any(|p| &p.id == id))
    {
        return Err(fail("선택한 학생이 변경되었어요."));
    }
    Ok(())
}
pub fn apply(s: &mut Snapshot, cmd: Command) -> Result<(), String> {
    match cmd {
        Command::CreateClass { name: n } => {
            let cid = id();
            if s.classes.is_empty() {
                s.default_class_id = Some(cid.clone());
            }
            s.classes.push(Class {
                id: cid,
                name: name(&n, 60)?,
                revision: 0,
                students: vec![],
                groups: vec![],
            });
        }
        Command::RenameClass { class_id, name: n } => class(s, &class_id)?.name = name(&n, 60)?,
        Command::DeleteClass { class_id } => {
            class(s, &class_id)?;
            s.classes.retain(|c| c.id != class_id);
            if s.default_class_id.as_ref() == Some(&class_id) {
                s.default_class_id = None;
            }
        }
        Command::SetDefault { class_id } => {
            if let Some(cid) = &class_id {
                class(s, cid)?;
            }
            s.default_class_id = class_id;
        }
        Command::SaveStudents {
            class_id,
            students,
            delete_ids,
        } => {
            let c = class(s, &class_id)?;
            ids_exist(c, &delete_ids)?;
            let mut touched = HashSet::new();
            for p in students {
                let gender = p.gender.clone();
                let n = name(&p.name, 80)?;
                if let Some(pid) = p.id {
                    if !touched.insert(pid.clone()) || delete_ids.contains(&pid) {
                        return Err(fail("학생 연결이 중복돼요."));
                    }
                    let old = c
                        .students
                        .iter_mut()
                        .find(|a| a.id == pid)
                        .ok_or_else(|| fail("수정할 학생을 찾지 못했어요."))?;
                    old.number = p.number;
                    old.name = n;
                    if let Some(g) = gender {
                        old.gender = g;
                    }
                } else {
                    c.students.push(Student {
                        id: id(),
                        number: p.number,
                        name: n,
                        gender: gender.unwrap_or("unspecified".into()),
                        group_id: None,
                    });
                }
            }
            c.students.retain(|p| !delete_ids.contains(&p.id));
        }
        Command::DeleteStudents { class_id, ids } => {
            let c = class(s, &class_id)?;
            ids_exist(c, &ids)?;
            c.students.retain(|p| !ids.contains(&p.id));
        }
        Command::CreateGroups { class_id, count } => {
            let c = class(s, &class_id)?;
            if count == 0 || count > 100 {
                return Err(fail("모둠 수를 확인해 주세요."));
            }
            for _ in 0..count {
                let n = (1..=201)
                    .map(|n| format!("{n}모둠"))
                    .find(|n| !c.groups.iter().any(|g| &g.name == n))
                    .unwrap();
                c.groups.push(Group { id: id(), name: n });
            }
        }
        Command::RenameGroup {
            class_id,
            group_id,
            name: n,
        } => {
            let c = class(s, &class_id)?;
            c.groups
                .iter_mut()
                .find(|g| g.id == group_id)
                .ok_or_else(|| fail("모둠을 찾지 못했어요."))?
                .name = name(&n, 40)?;
        }
        Command::DeleteGroup { class_id, group_id } => {
            let c = class(s, &class_id)?;
            if !c.groups.iter().any(|g| g.id == group_id) {
                return Err(fail("모둠을 찾지 못했어요."));
            }
            c.groups.retain(|g| g.id != group_id);
            for p in &mut c.students {
                if p.group_id.as_ref() == Some(&group_id) {
                    p.group_id = None;
                }
            }
        }
        Command::ReorderGroups { class_id, ids } => {
            let c = class(s, &class_id)?;
            if ids.len() != c.groups.len() || ids.iter().collect::<HashSet<_>>().len() != ids.len()
            {
                return Err(fail("모둠 순서가 올바르지 않아요."));
            }
            c.groups = ids
                .iter()
                .map(|id| {
                    c.groups
                        .iter()
                        .find(|g| &g.id == id)
                        .cloned()
                        .ok_or_else(|| fail("모둠을 찾지 못했어요."))
                })
                .collect::<Result<_, _>>()?;
        }
        Command::Assign {
            class_id,
            ids,
            group_id,
        } => {
            let c = class(s, &class_id)?;
            ids_exist(c, &ids)?;
            if group_id
                .as_ref()
                .is_some_and(|id| !c.groups.iter().any(|g| &g.id == id))
            {
                return Err(fail("같은 학급의 모둠을 선택해 주세요."));
            }
            for p in &mut c.students {
                if ids.contains(&p.id) {
                    p.group_id = group_id.clone();
                }
            }
        }
        Command::Restore { backup } => {
            if backup.format != "tidy-classroom" || backup.schema_version != 1 {
                return Err("UNSUPPORTED_SCHEMA: 지원하지 않는 백업이에요.".into());
            }
            validate(&backup.data)?;
            let revision = s.revision;
            *s = backup.data;
            s.revision = revision;
        }
        Command::Undo => return Err("UNDO_CONFLICT: 실행 취소할 작업이 없어요.".into()),
    }
    validate(s)
}
