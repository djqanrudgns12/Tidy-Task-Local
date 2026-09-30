fn main() {
    // These are public ingestion settings, never personal/secret API keys.
    for name in ["POSTHOG_PROJECT_TOKEN", "POSTHOG_HOST", "POSTHOG_DEV_ENABLED"] {
        println!("cargo:rerun-if-env-changed={name}");
        let value = std::env::var(name).ok().or_else(|| {
            dotenvy::from_path_iter(".env").ok()?.filter_map(Result::ok)
                .find(|(key, _)| key == name).map(|(_, value)| value)
        }).unwrap_or_else(|| if name == "POSTHOG_HOST" { "https://us.i.posthog.com".into() } else { String::new() });
        assert!(!value.contains(['\r', '\n']), "Invalid analytics build setting");
        if std::env::var("PROFILE").as_deref() == Ok("release") {
            let value = value.trim();
            match name {
                "POSTHOG_PROJECT_TOKEN" => assert!(
                    (value.starts_with("phc_") || value.starts_with("ph_project_"))
                        && value.len() > 16
                        && value.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-')),
                    "POSTHOG_PROJECT_TOKEN must be a public project token for release builds; configure src-tauri/.env and rebuild"
                ),
                "POSTHOG_HOST" => assert!(
                    ["https://us.i.posthog.com", "https://eu.i.posthog.com"].contains(&value),
                    "POSTHOG_HOST must be a supported PostHog ingestion host for release builds"
                ),
                _ => {}
            }
        }
        println!("cargo:rustc-env={name}={}", value.trim());
    }
    println!("cargo:rerun-if-changed=.env");
    println!("cargo:rerun-if-env-changed=NEIS_API_KEY");
    println!("cargo:rerun-if-env-changed=NEIS_ALLOW_NO_KEY");
    let key = std::env::var("NEIS_API_KEY")
        .ok()
        .or_else(|| {
            dotenvy::from_path_iter(".env")
                .ok()?
                .filter_map(Result::ok)
                .find(|(name, _)| name == "NEIS_API_KEY")
                .map(|(_, value)| value)
        })
        .unwrap_or_default();
    let key = key.trim();
    if key.is_empty() {
        if std::env::var("PROFILE").as_deref() == Ok("release")
            && std::env::var("NEIS_ALLOW_NO_KEY").as_deref() != Ok("1")
        {
            panic!("NEIS_API_KEY is required for release builds");
        }
        println!("cargo:warning=NEIS sample mode: no API key configured");
    }
    // 난독화는 바이너리의 단순 문자열 노출만 줄이며, 서버 비밀 보관을 대체하지 않습니다.
    let mut mask = vec![0u8; key.len()];
    getrandom::fill(&mut mask).expect("key mask generation failed");
    let encoded: Vec<u8> = key.bytes().zip(&mask).map(|(a, b)| a ^ b).collect();
    let output = std::path::PathBuf::from(std::env::var("OUT_DIR").unwrap()).join("neis_key.rs");
    std::fs::write(
        output,
        format!(
            "const ENCODED: &[u8] = &{:?};\nconst MASK: &[u8] = &{:?};",
            encoded, mask
        ),
    )
    .expect("key build failed");
    tauri_build::build()
}
