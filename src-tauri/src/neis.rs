use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
include!(concat!(env!("OUT_DIR"), "/neis_key.rs"));
static LAUNCHED: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub fn meal_take_launch_token() -> bool {
    !LAUNCHED.swap(true, Ordering::SeqCst)
}

fn validate(office: &str, school: &str, start: &str, end: &str) -> Result<(), String> {
    let bytes = office.as_bytes();
    if bytes.len() != 3
        || !bytes[0].is_ascii_uppercase()
        || !bytes[1..].iter().all(u8::is_ascii_digit)
        || school.len() != 7
        || !school.bytes().all(|c| c.is_ascii_digit())
    {
        return Err("INVALID_INPUT".into());
    }
    let parse = |s: &str| -> Result<chrono::NaiveDate, String> {
        if s.len() != 8 || !s.bytes().all(|c| c.is_ascii_digit()) {
            return Err("INVALID_INPUT".into());
        }
        chrono::NaiveDate::parse_from_str(s, "%Y%m%d").map_err(|_| "INVALID_INPUT".into())
    };
    let days = (parse(end)? - parse(start)?).num_days();
    if !(0..62).contains(&days) {
        return Err("INVALID_INPUT".into());
    }
    Ok(())
}

fn decode_response(value: Value, endpoint: &str) -> Result<Value, String> {
    let result = value.get("RESULT").or_else(|| {
        value[endpoint][0]["head"]
            .as_array()?
            .iter()
            .find_map(|v| v.get("RESULT"))
    });
    match result
        .and_then(|r| r["CODE"].as_str())
        .unwrap_or("MALFORMED")
    {
        "INFO-200" => Ok(json!([])),
        "INFO-000" => value[endpoint][1]["row"]
            .as_array()
            .map(|v| json!(v))
            .ok_or("INVALID_RESPONSE".into()),
        "ERROR-290" => Err("RATE_LIMIT".into()),
        "ERROR-300" | "ERROR-301" => Err("AUTH".into()),
        _ => Err("SERVICE".into()),
    }
}

async fn request(endpoint: &str, mut params: Vec<(&str, String)>) -> Result<Value, String> {
    let key: String = ENCODED
        .iter()
        .zip(MASK)
        .map(|(a, b)| (a ^ b) as char)
        .collect();
    let sample = key.is_empty();
    params.extend([
        ("Type", "json".into()),
        ("pSize", "1000".into()),
        ("pIndex", "1".into()),
    ]);
    if !sample {
        params.push(("KEY", key));
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|_| "NETWORK")?;
    let mut response = None;
    for _ in 0..2 {
        match client
            .get(format!("https://open.neis.go.kr/hub/{endpoint}"))
            .query(&params)
            .send()
            .await
        {
            Ok(r) => {
                response = Some(r);
                break;
            }
            Err(_) => continue,
        }
    }
    // reqwest 오류에는 키를 포함한 주소가 들어갈 수 있어 원래 오류를 외부로 내보내지 않습니다.
    let response = response.ok_or("NETWORK")?;
    if response.status().as_u16() == 429 {
        return Err("RATE_LIMIT".into());
    }
    if !response.status().is_success() {
        return Err("SERVICE".into());
    }
    let value: Value = response.json().await.map_err(|_| "INVALID_RESPONSE")?;
    let rows = decode_response(value, endpoint)?;
    Ok(json!({"rows": rows,"sample":sample}))
}
#[tauri::command]
pub async fn neis_search_schools(name: String, office: Option<String>) -> Result<Value, String> {
    if !(2..=30).contains(&name.trim().chars().count()) {
        return Err("INVALID_INPUT".into());
    }
    let mut params = vec![("SCHUL_NM", name.trim().into())];
    if let Some(code) = office {
        validate(&code, "0000000", "20260101", "20260101")?;
        params.push(("ATPT_OFCDC_SC_CODE", code));
    }
    request("schoolInfo", params).await
}
async fn period(
    endpoint: &str,
    office: String,
    school: String,
    start: String,
    end: String,
) -> Result<Value, String> {
    validate(&office, &school, &start, &end)?;
    let (from, to) = if endpoint == "SchoolSchedule" {
        ("AA_FROM_YMD", "AA_TO_YMD")
    } else {
        ("MLSV_FROM_YMD", "MLSV_TO_YMD")
    };
    request(
        endpoint,
        vec![
            ("ATPT_OFCDC_SC_CODE", office),
            ("SD_SCHUL_CODE", school),
            (from, start),
            (to, end),
        ],
    )
    .await
}
#[tauri::command]
pub async fn neis_meals(
    office: String,
    school: String,
    start: String,
    end: String,
) -> Result<Value, String> {
    period("mealServiceDietInfo", office, school, start, end).await
}
#[tauri::command]
pub async fn neis_schedule(
    office: String,
    school: String,
    start: String,
    end: String,
) -> Result<Value, String> {
    period("SchoolSchedule", office, school, start, end).await
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "live NEIS API; run explicitly"]
    fn live_school_and_meals() {
        tauri::async_runtime::block_on(async {
            let schools = neis_search_schools("한려".into(), Some("Q10".into()))
                .await
                .expect("school search failed");
            let school = schools["rows"]
                .as_array()
                .unwrap()
                .iter()
                .find(|s| s["SCHUL_NM"] == "여수한려초등학교")
                .expect("school not found");
            let code = school["SD_SCHUL_CODE"].as_str().unwrap();
            let meals = neis_meals(
                "Q10".into(),
                code.into(),
                "20260901".into(),
                "20260930".into(),
            )
            .await
            .expect("meals failed");
            let schedule = neis_schedule(
                "Q10".into(),
                code.into(),
                "20260901".into(),
                "20260930".into(),
            )
            .await
            .expect("schedule failed");
            assert!(!meals["rows"].as_array().unwrap().is_empty());
            println!(
                "Live NEIS: schools={}, meals={}, schedule={}, sample={}",
                schools["rows"].as_array().unwrap().len(),
                meals["rows"].as_array().unwrap().len(),
                schedule["rows"].as_array().unwrap().len(),
                meals["sample"]
            );
        });
    }
    #[test]
    fn input_boundaries() {
        assert!(validate("Q10", "1234567", "20260201", "20260228").is_ok());
        for (o, s, a, b) in [
            ("https://x", "1234567", "20260201", "20260202"),
            ("Q10", "12x", "20260201", "20260202"),
            ("Q10", "1234567", "20260230", "20260301"),
            ("Q10", "1234567", "20260101", "20260401"),
            ("Q10", "1234567", "20260202", "20260201"),
        ] {
            assert_eq!(validate(o, s, a, b), Err("INVALID_INPUT".into()));
        }
    }
    #[test]
    fn no_data_and_redacted_errors() {
        assert_eq!(
            decode_response(json!({"RESULT":{"CODE":"INFO-200"}}), "x").unwrap(),
            json!([])
        );
        assert_eq!(
            decode_response(
                json!({"RESULT":{"CODE":"ERROR-290","MESSAGE":"secret"}}),
                "x"
            ),
            Err("RATE_LIMIT".into())
        );
    }
}
