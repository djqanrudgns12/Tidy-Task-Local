//! 시계 창의 표준시 측정.
//!
//! 왜 Rust에서 재는가: 웹뷰(JS)는 UDP(NTP)를 보낼 수 없고, 다른 사이트 응답 헤더도 CORS 때문에 읽지 못합니다.
//! 여기서는 "표준시 − PC 시각" 차이(보정값)만 돌려주고, 화면은 그 값을 자기 초 신호에 더하기만 합니다.
//! PC 시각(Windows 설정)은 절대 바꾸지 않습니다 — 관리자 권한이 필요한 시스템 설정이기 때문입니다.
//!
//! 출처 순서 (앞 단계가 실패할 때만 다음 단계로 내려갑니다)
//! 1. NTP(UDP 123): 한국표준과학연구원(KRISS) 2대 + Google·Microsoft 시간 서버. 수십 ms 안쪽으로 맞습니다.
//! 2. HTTPS 응답의 Date 헤더: 학교망이 UDP를 막을 때. 초 단위 값이지만 초가 바뀌는 순간을 잡아 ±0.1초 안팎으로 좁힙니다.
//! 3. HTTP 응답의 Date 헤더: PC 날짜가 크게 틀려 인증서 검사(HTTPS)가 실패할 때. 캐시·가로채기 응답은 검증으로 걸러냅니다.
//! 어느 단계든 여러 출처가 서로 맞는지(다수결) 확인한 뒤에만 값을 돌려줍니다. 고장 난 서버 하나가 시계를 끌고 가지 못하게 하려는 것입니다.
use serde::Serialize;
use std::net::{SocketAddr, ToSocketAddrs, UdpSocket};
use std::sync::mpsc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

/// NTP 서버와 "우선 출처" 여부. KRISS는 한국 표준시를 직접 내보내는 곳이라 값이 비슷하면 먼저 고릅니다.
const NTP_SERVERS: [(&str, bool); 4] = [
    ("time.kriss.re.kr", true),
    ("time2.kriss.re.kr", true),
    ("time.google.com", false),
    ("time.windows.com", false),
];
const NTP_SAMPLES: usize = 4;
const NTP_SAMPLE_TIMEOUT: Duration = Duration::from_millis(700);
// UDP가 막힌 망에서는 응답이 아예 오지 않으므로, 이 시간 안에 모인 답만으로 판단하고 다음 단계로 넘어갑니다.
const NTP_TIER_DEADLINE: Duration = Duration::from_millis(3200);
// 서버끼리 "같은 시각"으로 볼 여유. 각자의 불확실성에 이 값을 더해 비교합니다.
const NTP_AGREEMENT_MS: f64 = 100.0;
const WEB_AGREEMENT_MS: f64 = 300.0;
// 왜 12시간인가: 그보다 큰 차이(CMOS 전지가 닳아 날짜가 2000년이 된 PC 등)는 실제로 있지만,
// 고장 난 서버 하나가 엉뚱한 값을 줄 가능성도 큽니다. 그래서 두 곳 이상이 같은 값을 줄 때만 믿습니다.
const LARGE_OFFSET_MS: f64 = 12.0 * 3600.0 * 1000.0;
const MAX_UNCERTAINTY_MS: f64 = 1000.0;

/// 캐시하지 않는(204·진단용) 주소만 씁니다. 캐시될 수 있는 주소는 옛 Date를 돌려줍니다
/// (예: api.github.com은 21초 전 시각을 준 적이 있습니다 — docs/PRD 5절 측정 기록).
const HTTPS_SOURCES: [&str; 3] = [
    "https://www.google.com/generate_204",
    "https://connectivitycheck.gstatic.com/generate_204",
    "https://www.cloudflare.com/cdn-cgi/trace",
];
const HTTP_SOURCES: [&str; 3] = [
    "http://connectivitycheck.gstatic.com/generate_204",
    "http://www.google.com/generate_204",
    "http://www.cloudflare.com/cdn-cgi/trace",
];
const WEB_MAX_SAMPLES: usize = 9;
// 범위가 이만큼(±60ms) 좁아지면 멈춥니다. 왕복 시간보다 더 좁히기는 어렵습니다.
const WEB_TARGET_WIDTH_MS: f64 = 120.0;
const WEB_SOURCE_BUDGET: Duration = Duration::from_millis(6000);

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TimeMeasurement {
    /// 표준시 − PC 시각(ms). 양수면 PC가 느립니다.
    pub offset_ms: f64,
    /// 이 값의 오차 범위(±ms).
    pub uncertainty_ms: f64,
    /// "ntp" | "https" | "http"
    pub source: &'static str,
    pub server: String,
    /// 고른 값과 서로 맞은 출처 수(자기 포함)와 응답한 출처 수.
    pub agreeing: usize,
    pub responded: usize,
    /// 측정 직후의 PC 시각 − 부팅 후 경과 시간. 화면이 "시각 설정 변경"을 알아채는 기준점입니다.
    pub wall_skew_ms: Option<f64>,
}

#[derive(Debug, Clone, PartialEq)]
struct Candidate {
    server: String,
    offset_ms: f64,
    uncertainty_ms: f64,
    preferred: bool,
}

/// PC 시각(유닉스 ms). 1970년 이전으로 고장 난 시각도 음수로 돌려 계산을 이어 갑니다.
fn wall_ms() -> f64 {
    match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(elapsed) => elapsed.as_secs_f64() * 1000.0,
        Err(before) => -(before.duration().as_secs_f64() * 1000.0),
    }
}

#[cfg(windows)]
#[link(name = "kernel32")]
extern "system" {
    fn GetTickCount64() -> u64;
}

/// PC 시각 − 부팅 후 경과 시간(ms).
/// 왜 GetTickCount64인가: 절전·최대 절전 중에도 늘어나고 시각 설정의 영향을 받지 않는 카운터입니다.
/// 그래서 이 값이 갑자기 바뀌면 "누군가(또는 Windows)가 PC 시각을 바꿨다"는 뜻이고, 절전·복귀로는 바뀌지 않습니다.
/// 웹뷰의 performance.now()는 절전 중에 멈출 수 있어 이 구분을 못 합니다.
pub fn wall_skew_ms() -> Option<f64> {
    #[cfg(windows)]
    {
        // SAFETY: 인자·전제 조건이 없는 읽기 전용 Win32 함수입니다.
        let ticks = unsafe { GetTickCount64() } as f64;
        Some(wall_ms() - ticks)
    }
    #[cfg(not(windows))]
    {
        None
    }
}

// ─────────────────────────── NTP ───────────────────────────

const NTP_UNIX_OFFSET_S: i64 = 2_208_988_800;

/// NTP 64비트 타임스탬프 → 유닉스 ms.
fn ntp_timestamp_ms(bytes: &[u8]) -> f64 {
    let secs = u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
    let frac = u32::from_be_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]);
    // 2036년 2월에 NTP 초가 한 바퀴 돕니다. 최상위 비트가 0이면 다음 시대로 봅니다(RFC 4330 3절).
    let era = if secs & 0x8000_0000 == 0 { 1i64 << 32 } else { 0 };
    let unix_secs = era + secs as i64 - NTP_UNIX_OFFSET_S;
    unix_secs as f64 * 1000.0 + frac as f64 * 1000.0 / 4_294_967_296.0
}

/// NTP 16.16 고정소수점 초 → ms.
fn ntp_short_ms(bytes: &[u8]) -> f64 {
    u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) as f64 * 1000.0 / 65_536.0
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct NtpSample {
    offset_ms: f64,
    delay_ms: f64,
    uncertainty_ms: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum NtpReject {
    Short,
    NotServer,
    Version,
    Unsynchronized,
    Stratum,
    /// 이번 요청의 응답이 아님(늦게 온 이전 응답 또는 위조).
    Mismatch,
    EmptyTime,
    ServerHold,
    NegativeDelay,
    TooUncertain,
}

/// 응답을 검증하고 보정값을 계산합니다.
/// `t0` 보낸 순간, `t3` 받은 순간의 PC 시각. `nonce`는 요청의 "보낸 시각" 칸에 넣은 난수입니다
/// (PC 시각 대신 난수를 넣으면 서버가 그대로 돌려주므로 이번 요청의 응답인지 확인할 수 있습니다).
fn parse_ntp_reply(reply: &[u8], nonce: &[u8; 8], t0: f64, t3: f64) -> Result<NtpSample, NtpReject> {
    if reply.len() < 48 {
        return Err(NtpReject::Short);
    }
    let leap = reply[0] >> 6;
    let version = (reply[0] >> 3) & 0b111;
    let mode = reply[0] & 0b111;
    if mode != 4 {
        return Err(NtpReject::NotServer);
    }
    if !(3..=4).contains(&version) {
        return Err(NtpReject::Version);
    }
    if reply[24..32] != nonce[..] {
        return Err(NtpReject::Mismatch);
    }
    // 윤초 표시 3 = 서버 자신이 아직 동기화되지 않음. stratum 0 = 접근 거부(Kiss-o'-Death).
    if leap == 3 {
        return Err(NtpReject::Unsynchronized);
    }
    if reply[1] == 0 || reply[1] > 15 {
        return Err(NtpReject::Stratum);
    }
    if reply[40..48].iter().all(|b| *b == 0) {
        return Err(NtpReject::EmptyTime);
    }
    let t1 = ntp_timestamp_ms(&reply[32..40]);
    let t2 = ntp_timestamp_ms(&reply[40..48]);
    let server_hold = t2 - t1;
    if !(0.0..1000.0).contains(&server_hold) {
        return Err(NtpReject::ServerHold);
    }
    let delay = (t3 - t0) - server_hold;
    // 시계 해상도 때문에 아주 조금 음수가 나올 수 있어 몇 ms는 봐줍니다.
    if delay < -5.0 {
        return Err(NtpReject::NegativeDelay);
    }
    let delay = delay.max(0.0);
    let offset = ((t1 - t0) + (t2 - t3)) / 2.0;
    let uncertainty =
        delay / 2.0 + ntp_short_ms(&reply[4..8]) / 2.0 + ntp_short_ms(&reply[8..12]) + 1.0;
    if !offset.is_finite() || !(uncertainty <= MAX_UNCERTAINTY_MS) {
        return Err(NtpReject::TooUncertain);
    }
    Ok(NtpSample { offset_ms: offset, delay_ms: delay, uncertainty_ms: uncertainty })
}

/// 서버 하나에 여러 번 묻고 왕복이 가장 짧은(= 가장 정확한) 표본을 고릅니다.
fn query_ntp_server(host: &str) -> Result<NtpSample, String> {
    let addresses: Vec<SocketAddr> = (host, 123)
        .to_socket_addrs()
        .map_err(|_| "주소를 찾지 못했어요".to_string())?
        .collect();
    // 학교망은 IPv6가 없는 경우가 많아 IPv4를 먼저 씁니다.
    let address = addresses
        .iter()
        .find(|a| a.is_ipv4())
        .or_else(|| addresses.first())
        .copied()
        .ok_or("주소를 찾지 못했어요")?;
    let local: SocketAddr = if address.is_ipv4() {
        SocketAddr::from(([0, 0, 0, 0], 0))
    } else {
        SocketAddr::from(([0u16; 8], 0))
    };
    let socket = UdpSocket::bind(local).map_err(|e| e.to_string())?;
    socket.connect(address).map_err(|e| e.to_string())?;
    socket
        .set_read_timeout(Some(NTP_SAMPLE_TIMEOUT))
        .map_err(|e| e.to_string())?;
    let mut best: Option<NtpSample> = None;
    let mut last_error = String::from("응답이 없어요");
    let mut silent = 0;
    for attempt in 0..NTP_SAMPLES {
        if attempt > 0 {
            std::thread::sleep(Duration::from_millis(50));
        }
        let mut nonce = [0u8; 8];
        if getrandom::fill(&mut nonce).is_err() {
            return Err("난수를 만들지 못했어요".into());
        }
        let mut request = [0u8; 48];
        request[0] = 0x23; // 윤초 0, 버전 4, 클라이언트 모드
        request[40..48].copy_from_slice(&nonce);
        let t0 = wall_ms();
        // 왜 받은 시각을 PC 시각으로 다시 읽지 않는가: 묻는 도중 PC 시각이 바뀌면 왕복 시간이 엉망이 됩니다.
        // 흐른 시간은 단조 시계(Instant)로 재서 보낸 시각에 더합니다.
        let sent = Instant::now();
        if socket.send(&request).is_err() {
            last_error = "보내지 못했어요".into();
            continue;
        }
        let mut buffer = [0u8; 128];
        let outcome = loop {
            match socket.recv(&mut buffer) {
                Ok(length) => {
                    let t3 = t0 + sent.elapsed().as_secs_f64() * 1000.0;
                    match parse_ntp_reply(&buffer[..length], &nonce, t0, t3) {
                        // 늦게 도착한 이전 요청의 응답은 버리고 이번 응답을 조금 더 기다립니다.
                        Err(NtpReject::Mismatch) if sent.elapsed() < NTP_SAMPLE_TIMEOUT => continue,
                        other => break other.map_err(|reason| format!("{reason:?}")),
                    }
                }
                Err(_) => break Err("응답이 없어요".to_string()),
            }
        };
        match outcome {
            Ok(sample) => {
                silent = 0;
                if best.map_or(true, |b| sample.delay_ms < b.delay_ms) {
                    best = Some(sample);
                }
            }
            Err(error) => {
                last_error = error;
                silent += 1;
                // UDP가 막힌 망에서 네 번 모두 기다리지 않습니다.
                if silent >= 2 && best.is_none() {
                    break;
                }
            }
        }
    }
    best.ok_or(last_error)
}

fn measure_ntp() -> Result<TimeMeasurement, String> {
    let (sender, receiver) = mpsc::channel();
    // 서버마다 따로 묻습니다. 한 곳이 느리거나 막혀도(DNS 멈춤 포함) 다른 곳의 답으로 판단할 수 있습니다.
    for (host, preferred) in NTP_SERVERS {
        let sender = sender.clone();
        std::thread::spawn(move || {
            let _ = sender.send((host, preferred, query_ntp_server(host)));
        });
    }
    drop(sender);
    let deadline = Instant::now() + NTP_TIER_DEADLINE;
    let mut candidates = Vec::new();
    let mut failures = Vec::new();
    while let Some(left) = deadline.checked_duration_since(Instant::now()) {
        match receiver.recv_timeout(left) {
            Ok((host, preferred, Ok(sample))) => candidates.push(Candidate {
                server: host.to_string(),
                offset_ms: sample.offset_ms,
                uncertainty_ms: sample.uncertainty_ms,
                preferred,
            }),
            Ok((host, _, Err(error))) => failures.push(format!("{host} {error}")),
            // 모든 서버가 답했거나(끊김) 제한 시간이 지남
            Err(_) => break,
        }
    }
    decide(candidates, "ntp", NTP_AGREEMENT_MS).map_err(|error| {
        if failures.is_empty() { error } else { format!("{error} ({})", failures.join(", ")) }
    })
}

// ─────────────────────────── 다수결 ───────────────────────────

fn agrees(a: &Candidate, b: &Candidate, tolerance_ms: f64) -> bool {
    (a.offset_ms - b.offset_ms).abs() <= tolerance_ms + a.uncertainty_ms + b.uncertainty_ms
}

fn by_uncertainty(a: &Candidate, b: &Candidate) -> std::cmp::Ordering {
    a.uncertainty_ms.total_cmp(&b.uncertainty_ms)
}

/// 여러 출처 가운데 믿을 값을 고릅니다. 돌려주는 수는 고른 값과 서로 맞은 출처 수(자기 포함)입니다.
/// - 가장 많은 출처와 맞는 값을 중심으로 삼습니다. 동점이면 KRISS, 그다음 오차가 작은 쪽.
/// - 모두가 서로 다르면 믿지 않습니다. 단, 둘만 답했고 그중 KRISS가 하나뿐이면 KRISS를 씁니다.
/// - 중심과 맞는 무리 안에서 오차가 가장 작은 값을 쓰되, KRISS가 20ms 안쪽으로 비슷하면 KRISS를 씁니다.
fn choose_consensus(candidates: &[Candidate], tolerance_ms: f64) -> Result<(Candidate, usize), String> {
    if candidates.is_empty() {
        return Err("응답한 곳이 없어요".into());
    }
    let support: Vec<usize> = candidates
        .iter()
        .map(|a| candidates.iter().filter(|b| agrees(a, b, tolerance_ms)).count())
        .collect();
    let best_support = support.iter().copied().max().unwrap_or(0);
    if best_support == 1 && candidates.len() >= 2 {
        let preferred: Vec<&Candidate> = candidates.iter().filter(|c| c.preferred).collect();
        if candidates.len() == 2 && preferred.len() == 1 {
            return Ok((preferred[0].clone(), 1));
        }
        return Err("출처끼리 시각이 서로 달라요".into());
    }
    let center = candidates
        .iter()
        .zip(&support)
        .filter(|(_, s)| **s == best_support)
        .map(|(c, _)| c)
        .min_by(|a, b| b.preferred.cmp(&a.preferred).then(by_uncertainty(a, b)))
        .ok_or("응답한 곳이 없어요")?;
    let cluster: Vec<&Candidate> =
        candidates.iter().filter(|c| agrees(center, c, tolerance_ms)).collect();
    let most_precise = cluster
        .iter()
        .copied()
        .min_by(|a, b| by_uncertainty(a, b))
        .ok_or("응답한 곳이 없어요")?;
    let chosen = cluster
        .iter()
        .copied()
        .filter(|c| c.preferred && c.uncertainty_ms <= most_precise.uncertainty_ms + 20.0)
        .min_by(|a, b| by_uncertainty(a, b))
        .unwrap_or(most_precise);
    Ok((chosen.clone(), cluster.len()))
}

fn decide(candidates: Vec<Candidate>, source: &'static str, tolerance_ms: f64) -> Result<TimeMeasurement, String> {
    let (chosen, agreeing) = choose_consensus(&candidates, tolerance_ms)?;
    if chosen.offset_ms.abs() > LARGE_OFFSET_MS && agreeing < 2 {
        return Err("차이가 너무 커서 한 곳의 답만으로는 믿지 않아요".into());
    }
    Ok(TimeMeasurement {
        offset_ms: chosen.offset_ms,
        uncertainty_ms: chosen.uncertainty_ms,
        source,
        server: chosen.server,
        agreeing,
        responded: candidates.len(),
        wall_skew_ms: wall_skew_ms(),
    })
}

// ─────────────────────────── HTTP(S) Date ───────────────────────────

/// "Wed, 23 Sep 2026 03:13:31 GMT"(IMF-fixdate) → 유닉스 초.
/// 왜 직접 읽는가: 이 형식 하나만 필요하고, 날짜 라이브러리의 기능 설정에 기대지 않으려는 것입니다.
fn parse_http_date(value: &str) -> Option<i64> {
    let parts: Vec<&str> = value.split_whitespace().collect();
    if parts.len() != 6 || parts[5] != "GMT" {
        return None;
    }
    let day: i64 = parts[1].parse().ok()?;
    let month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        .iter()
        .position(|m| *m == parts[2])? as i64
        + 1;
    let year: i64 = parts[3].parse().ok()?;
    let clock: Vec<i64> = parts[4].split(':').map(|p| p.parse().ok()).collect::<Option<_>>()?;
    if clock.len() != 3 || !(1..=31).contains(&day) || clock[0] > 23 || clock[1] > 59 || clock[2] > 60 {
        return None;
    }
    // 그레고리력 날짜 → 1970-01-01부터 날 수 (Howard Hinnant의 days_from_civil)
    let y = if month <= 2 { year - 1 } else { year };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (month + 9) % 12;
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    Some(days * 86_400 + clock[0] * 3600 + clock[1] * 60 + clock[2])
}

/// Date 한 번이 알려 주는 보정값의 범위.
/// 서버는 요청을 받은 뒤·응답하기 전 어느 순간의 시각을 "초 단위로 버려서" 적습니다.
/// 그 순간 PC 시각은 t0~t3 사이이므로: 초×1000 ≤ PC 시각 + 보정값 < 초×1000 + 1000.
fn date_sample_bounds(server_seconds: i64, t0: f64, t3: f64) -> (f64, f64) {
    let start = server_seconds as f64 * 1000.0;
    (start - t3, start + 1000.0 - t0)
}

/// 여러 번 받은 Date 범위를 겹쳐 보정값을 좁힙니다.
/// 초가 한 번이라도 바뀌는 것을 봐야 믿습니다 — 캐시된 응답은 초가 멈춰 있기 때문입니다.
/// 범위가 서로 겹치지 않으면 앞뒤가 맞지 않는 응답(캐시·가로채기)으로 보고 버립니다.
struct DateNarrower {
    lower: f64,
    upper: f64,
    first_seconds: Option<i64>,
    changed: bool,
    samples: usize,
}

impl DateNarrower {
    fn new() -> Self {
        Self {
            lower: f64::NEG_INFINITY,
            upper: f64::INFINITY,
            first_seconds: None,
            changed: false,
            samples: 0,
        }
    }
    fn add(&mut self, server_seconds: i64, t0: f64, t3: f64) -> Result<(), String> {
        let (low, high) = date_sample_bounds(server_seconds, t0, t3);
        self.samples += 1;
        self.lower = self.lower.max(low);
        self.upper = self.upper.min(high);
        match self.first_seconds {
            None => self.first_seconds = Some(server_seconds),
            Some(first) if first != server_seconds => self.changed = true,
            _ => {}
        }
        if self.lower > self.upper {
            return Err("앞뒤가 맞지 않는 시각이에요(캐시된 응답 의심)".into());
        }
        Ok(())
    }
    fn width(&self) -> f64 {
        self.upper - self.lower
    }
    fn settled(&self) -> bool {
        self.changed && self.width() <= WEB_TARGET_WIDTH_MS
    }
    fn result(&self) -> Result<(f64, f64), String> {
        if !self.changed {
            return Err("시각이 바뀌지 않아요(캐시된 응답 의심)".into());
        }
        Ok(((self.lower + self.upper) / 2.0, self.width() / 2.0))
    }
}

/// 다음 요청까지 기다릴 시간(ms). 이분 탐색입니다.
/// 지금까지의 범위 한가운데가 맞다면 서버가 "정확히 초가 바뀌는 순간"에 응답을 만들도록 요청 시점을 겨눕니다.
/// 돌아온 초가 이전 초인지 다음 초인지에 따라 범위가 절반으로 줄어듭니다(몇 번이면 왕복 시간 수준까지).
///
/// 단, 두 번 물어도 초가 한 번도 바뀌지 않았으면 이번에는 "확실히 초가 바뀐 뒤"를 겨눕니다.
/// 왜: 실제 값이 범위 끝에 붙어 있으면 한가운데를 겨눈 요청이 모두 같은 초에 떨어질 수 있고,
/// 초가 바뀌는 것을 봐야만 캐시된(멈춘) 응답과 구별할 수 있기 때문입니다.
fn next_sample_wait(now: f64, round_trip: f64, narrower: &DateNarrower) -> f64 {
    let half_trip = if round_trip.is_finite() { round_trip / 2.0 } else { 0.0 };
    let (aim, after_boundary) = if !narrower.changed && narrower.samples >= 2 {
        // 가장 작은 보정값이어도, 서버가 요청을 곧바로 받아도 초가 바뀐 뒤에 닿도록 여유를 둡니다.
        (narrower.lower, half_trip + 30.0)
    } else {
        ((narrower.lower + narrower.upper) / 2.0, 0.0)
    };
    (after_boundary - (now + half_trip + aim)).rem_euclid(1000.0)
}

fn host_of(url: &str) -> String {
    url.split("://").nth(1).unwrap_or(url).split('/').next().unwrap_or(url).to_string()
}

async fn estimate_from_date(client: reqwest::Client, url: &'static str) -> Result<Candidate, String> {
    use reqwest::header::{AGE, CACHE_CONTROL, DATE, PRAGMA};
    let started = Instant::now();
    let mut narrower = DateNarrower::new();
    let mut fastest_trip = f64::INFINITY;
    for attempt in 0..WEB_MAX_SAMPLES {
        if attempt > 0 {
            let wait = next_sample_wait(wall_ms(), fastest_trip, &narrower);
            tokio::time::sleep(Duration::from_secs_f64(wait / 1000.0)).await;
        }
        let t0 = wall_ms();
        let sent = Instant::now();
        let response = client
            .get(url)
            // 중간의 프록시가 저장해 둔 응답을 주지 않도록 부탁합니다(지키지 않는 곳은 아래 검증이 걸러냅니다).
            .header(CACHE_CONTROL, "no-cache")
            .header(PRAGMA, "no-cache")
            .send()
            .await
            .map_err(|_| "연결하지 못했어요".to_string())?;
        let t3 = t0 + sent.elapsed().as_secs_f64() * 1000.0;
        fastest_trip = fastest_trip.min(t3 - t0);
        let headers = response.headers();
        if headers
            .get(AGE)
            .and_then(|age| age.to_str().ok())
            .is_some_and(|age| age.trim() != "0")
        {
            return Err("캐시된 응답이에요".into());
        }
        let seconds = headers
            .get(DATE)
            .and_then(|date| date.to_str().ok())
            .and_then(parse_http_date)
            .ok_or("Date 헤더가 없어요")?;
        narrower.add(seconds, t0, t3)?;
        if narrower.settled() || started.elapsed() > WEB_SOURCE_BUDGET {
            break;
        }
    }
    let (offset_ms, half_width) = narrower.result()?;
    Ok(Candidate {
        server: host_of(url),
        offset_ms,
        // Date를 만든 순간과 헤더를 붙인 순간의 차이까지 조금 더 얹습니다.
        uncertainty_ms: half_width + 5.0,
        preferred: false,
    })
}

async fn measure_web(urls: &[&'static str], source: &'static str) -> Result<TimeMeasurement, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .connect_timeout(Duration::from_secs(2))
        .user_agent("TidyTask-Clock")
        .build()
        .map_err(|_| "연결을 준비하지 못했어요".to_string())?;
    // 출처마다 따로(동시에) 잽니다. 한 곳이 막혀도 나머지로 판단합니다.
    let tasks: Vec<_> = urls
        .iter()
        .map(|url| tauri::async_runtime::spawn(estimate_from_date(client.clone(), url)))
        .collect();
    let mut candidates = Vec::new();
    let mut failures = Vec::new();
    for (task, url) in tasks.into_iter().zip(urls) {
        match task.await {
            Ok(Ok(candidate)) => candidates.push(candidate),
            Ok(Err(error)) => failures.push(format!("{} {error}", host_of(url))),
            Err(_) => failures.push(format!("{} 작업 오류", host_of(url))),
        }
    }
    decide(candidates, source, WEB_AGREEMENT_MS).map_err(|error| {
        if failures.is_empty() { error } else { format!("{error} ({})", failures.join(", ")) }
    })
}

// ─────────────────────────── 명령 ───────────────────────────

/// 표준시 − PC 시각을 잽니다. 모든 출처가 실패하면 이유를 모아 돌려주고, 화면은 PC 시각으로 계속 갑니다.
#[tauri::command]
pub async fn clock_time_offset() -> Result<TimeMeasurement, String> {
    let skew_before = wall_skew_ms();
    let mut reasons = Vec::new();
    let mut found = None;
    match tauri::async_runtime::spawn_blocking(measure_ntp).await {
        Ok(Ok(measurement)) => found = Some(measurement),
        Ok(Err(error)) => reasons.push(format!("NTP: {error}")),
        Err(_) => reasons.push("NTP: 작업 오류".into()),
    }
    if found.is_none() {
        match measure_web(&HTTPS_SOURCES, "https").await {
            Ok(measurement) => found = Some(measurement),
            Err(error) => reasons.push(format!("HTTPS: {error}")),
        }
    }
    if found.is_none() {
        match measure_web(&HTTP_SOURCES, "http").await {
            Ok(measurement) => found = Some(measurement),
            Err(error) => reasons.push(format!("HTTP: {error}")),
        }
    }
    if let Some(measurement) = found {
        // 재는 도중에 PC 시각이 바뀌면(Windows 자동 맞춤 등) 앞뒤 기준이 달라 값이 틀립니다. 버리고 다시 재게 합니다.
        if !skew_unchanged(skew_before, measurement.wall_skew_ms) {
            return Err("재는 도중에 PC 시각이 바뀌었어요".into());
        }
        return Ok(measurement);
    }
    let message = reasons.join(" / ");
    log::warn!("표준시를 재지 못했습니다: {message}");
    Err(message)
}

/// 두 시점의 (PC 시각 − 부팅 후 경과 시간)이 같으면(300ms 안) 그사이 PC 시각이 바뀌지 않은 것입니다.
fn skew_unchanged(before: Option<f64>, after: Option<f64>) -> bool {
    match (before, after) {
        (Some(before), Some(after)) => (before - after).abs() < 300.0,
        // 카운터를 읽을 수 없는 환경이면 확인하지 않습니다.
        _ => true,
    }
}

/// 화면이 1분마다, 그리고 틱이 이상할 때 물어 "PC 시각이 바뀌었는지"를 확인합니다(`wall_skew_ms` 참고).
#[tauri::command]
pub fn clock_wall_skew() -> Option<f64> {
    wall_skew_ms()
}

#[cfg(test)]
mod tests {
    use super::*;

    const NONCE: [u8; 8] = [1, 2, 3, 4, 5, 6, 7, 8];

    fn ntp_bytes(unix_ms: f64) -> [u8; 8] {
        let total = unix_ms / 1000.0 + NTP_UNIX_OFFSET_S as f64;
        let secs = total.floor();
        let frac = ((total - secs) * 4_294_967_296.0) as u32;
        let secs = (secs as i64 & 0xFFFF_FFFF) as u32;
        let mut out = [0u8; 8];
        out[..4].copy_from_slice(&secs.to_be_bytes());
        out[4..].copy_from_slice(&frac.to_be_bytes());
        out
    }

    /// 서버가 t1에 받고 t2에 보낸 정상 응답.
    fn reply(t1: f64, t2: f64) -> [u8; 48] {
        let mut r = [0u8; 48];
        r[0] = 0x24; // 윤초 0, 버전 4, 서버 모드
        r[1] = 1;
        r[24..32].copy_from_slice(&NONCE);
        r[32..40].copy_from_slice(&ntp_bytes(t1));
        r[40..48].copy_from_slice(&ntp_bytes(t2));
        r
    }

    fn close(a: f64, b: f64) -> bool {
        (a - b).abs() < 0.01
    }

    #[test]
    fn ntp_offset_uses_the_standard_formula() {
        // PC가 2600ms 느림, 편도 10ms, 서버 처리 1ms.
        let t0 = 1_790_133_180_000.0;
        let t1 = t0 + 2600.0 + 10.0;
        let t2 = t1 + 1.0;
        let t3 = t2 - 2600.0 + 10.0;
        let sample = parse_ntp_reply(&reply(t1, t2), &NONCE, t0, t3).unwrap();
        assert!(close(sample.offset_ms, 2600.0), "{sample:?}");
        assert!(close(sample.delay_ms, 20.0), "{sample:?}");
        assert!(sample.uncertainty_ms < 20.0);
    }

    #[test]
    fn ntp_rejects_unsafe_replies() {
        let t0 = 1_790_133_180_000.0;
        let good = reply(t0 + 5.0, t0 + 6.0);
        let check = |bytes: &[u8]| parse_ntp_reply(bytes, &NONCE, t0, t0 + 11.0);
        assert_eq!(check(&good[..40]), Err(NtpReject::Short));
        let mut client_mode = good;
        client_mode[0] = 0x23;
        assert_eq!(check(&client_mode), Err(NtpReject::NotServer));
        let mut unsynced = good;
        unsynced[0] = 0xE4;
        assert_eq!(check(&unsynced), Err(NtpReject::Unsynchronized));
        let mut kiss = good;
        kiss[1] = 0;
        assert_eq!(check(&kiss), Err(NtpReject::Stratum));
        let mut other_request = good;
        other_request[24] = 99;
        assert_eq!(check(&other_request), Err(NtpReject::Mismatch));
        let mut empty = good;
        empty[40..48].fill(0);
        assert_eq!(check(&empty), Err(NtpReject::EmptyTime));
        let mut dispersed = good;
        dispersed[8..12].copy_from_slice(&(5u32 << 16).to_be_bytes()); // 5초
        assert_eq!(check(&dispersed), Err(NtpReject::TooUncertain));
        assert!(check(&good).is_ok());
    }

    #[test]
    fn ntp_era_rollover_after_2036() {
        // 2036-02-07 06:28:16 UTC에 NTP 초가 0으로 돌아갑니다. 그 직후 값도 앞으로 가야 합니다.
        let rollover_ms = ((1i64 << 32) - NTP_UNIX_OFFSET_S) as f64 * 1000.0;
        assert!(close(ntp_timestamp_ms(&ntp_bytes(rollover_ms + 5000.0)), rollover_ms + 5000.0));
        assert!(close(ntp_timestamp_ms(&ntp_bytes(rollover_ms - 5000.0)), rollover_ms - 5000.0));
        assert!(close(ntp_timestamp_ms(&ntp_bytes(1_790_133_180_250.0)), 1_790_133_180_250.0));
    }

    fn candidate(server: &str, offset_ms: f64, uncertainty_ms: f64, preferred: bool) -> Candidate {
        Candidate { server: server.into(), offset_ms, uncertainty_ms, preferred }
    }

    #[test]
    fn consensus_prefers_kriss_within_the_majority() {
        let picked = choose_consensus(
            &[
                candidate("time.kriss.re.kr", 2600.0, 12.0, true),
                candidate("time2.kriss.re.kr", 2601.0, 13.0, true),
                candidate("time.google.com", 2598.0, 5.0, false),
            ],
            NTP_AGREEMENT_MS,
        )
        .unwrap();
        assert_eq!(picked.0.server, "time.kriss.re.kr");
        assert_eq!(picked.1, 3);
    }

    #[test]
    fn consensus_outvotes_a_broken_server() {
        let picked = choose_consensus(
            &[
                candidate("time.kriss.re.kr", 90_000.0, 10.0, true),
                candidate("time.google.com", 2600.0, 8.0, false),
                candidate("time.windows.com", 2610.0, 20.0, false),
            ],
            NTP_AGREEMENT_MS,
        )
        .unwrap();
        assert_eq!(picked.0.server, "time.google.com");
        assert_eq!(picked.1, 2);
    }

    #[test]
    fn consensus_refuses_when_everyone_disagrees() {
        let three = [
            candidate("a", 0.0, 10.0, true),
            candidate("b", 5000.0, 10.0, false),
            candidate("c", -5000.0, 10.0, false),
        ];
        assert!(choose_consensus(&three, NTP_AGREEMENT_MS).is_err());
        // 둘만 답해 서로 다르면 KRISS가 하나일 때만 KRISS를 씁니다.
        let pair = [candidate("kriss", 10.0, 10.0, true), candidate("web", 9000.0, 10.0, false)];
        assert_eq!(choose_consensus(&pair, NTP_AGREEMENT_MS).unwrap().0.server, "kriss");
        let strangers = [candidate("a", 10.0, 10.0, false), candidate("b", 9000.0, 10.0, false)];
        assert!(choose_consensus(&strangers, NTP_AGREEMENT_MS).is_err());
        assert!(choose_consensus(&[], NTP_AGREEMENT_MS).is_err());
    }

    #[test]
    fn huge_offsets_need_two_witnesses() {
        // 날짜가 26년 틀린 PC: 한 곳만 그렇게 말하면 믿지 않고, 두 곳이 같으면 믿습니다.
        let years = 26.0 * 365.0 * 86_400_000.0;
        assert!(decide(vec![candidate("a", years, 10.0, true)], "ntp", NTP_AGREEMENT_MS).is_err());
        let both = decide(
            vec![candidate("a", years, 10.0, true), candidate("b", years + 30.0, 12.0, true)],
            "ntp",
            NTP_AGREEMENT_MS,
        )
        .unwrap();
        assert_eq!(both.agreeing, 2);
        assert_eq!(both.source, "ntp");
        // 보통 크기의 차이는 한 곳만으로도 씁니다.
        assert!(decide(vec![candidate("a", 2600.0, 10.0, true)], "ntp", NTP_AGREEMENT_MS).is_ok());
    }

    #[test]
    fn http_date_parses_imf_fixdate() {
        assert_eq!(parse_http_date("Wed, 23 Sep 2026 03:13:31 GMT"), Some(1_790_133_211));
        assert_eq!(parse_http_date("Thu, 01 Jan 1970 00:00:00 GMT"), Some(0));
        assert_eq!(parse_http_date("Tue, 29 Feb 2028 12:00:00 GMT"), Some(1_835_438_400));
        assert_eq!(parse_http_date("Wed, 23 Sep 2026 03:13:31 KST"), None);
        assert_eq!(parse_http_date("Wed, 23 Foo 2026 03:13:31 GMT"), None);
        assert_eq!(parse_http_date("Wed, 23 Sep 2026 25:13:31 GMT"), None);
        assert_eq!(parse_http_date(""), None);
    }

    /// 서버가 요청 도착 순간(편도 `one_way` 뒤)의 시각을 초 단위로 버려 적는다고 보고 이분 탐색을 흉내 냅니다.
    fn simulate_date_search(truth: f64, start: f64, one_way: f64) -> (DateNarrower, usize) {
        let mut narrower = DateNarrower::new();
        let mut now = start;
        let mut fastest = f64::INFINITY;
        for attempt in 0..WEB_MAX_SAMPLES {
            let t0 = if attempt == 0 { now } else { now + next_sample_wait(now, fastest, &narrower) };
            let t3 = t0 + one_way * 2.0;
            fastest = fastest.min(t3 - t0);
            let server_ms = t0 + one_way + truth;
            narrower.add((server_ms / 1000.0).floor() as i64, t0, t3).unwrap();
            now = t3;
            if narrower.settled() {
                return (narrower, attempt + 1);
            }
        }
        (narrower, WEB_MAX_SAMPLES)
    }

    #[test]
    fn date_search_narrows_to_about_the_round_trip() {
        // 보정값·시작 시점·왕복 시간을 바꿔 가며 확인합니다. 결과 범위는 늘 실제 값을 품어야 합니다.
        for (truth, start, one_way) in [
            (2600.0, 1_790_133_180_050.0, 20.0),
            (-731.5, 1_790_133_180_999.0, 5.0),
            (180_000.0, 1_790_133_180_400.0, 45.0),
            (0.0, 1_790_133_180_000.0, 1.0),
        ] {
            let (narrower, used) = simulate_date_search(truth, start, one_way);
            let (offset, half) = narrower.result().unwrap();
            assert!((offset - truth).abs() <= half + 0.001, "{truth}: {offset} ± {half}");
            assert!(half * 2.0 <= WEB_TARGET_WIDTH_MS, "{truth}: 너비 {}", half * 2.0);
            assert!(used <= 8, "{truth}: {used}번");
        }
    }

    #[test]
    fn date_rejects_frozen_or_contradictory_answers() {
        // 캐시된 응답: 초가 멈춰 있으면 1초가 지나기 전에는 "바뀐 적 없음", 넘으면 "앞뒤가 안 맞음".
        let mut frozen = DateNarrower::new();
        let mut t0 = 1_790_133_180_000.0;
        let mut last = Ok(());
        for _ in 0..8 {
            last = frozen.add(1_790_133_160, t0, t0 + 40.0);
            if last.is_err() {
                break;
            }
            t0 += 210.0;
        }
        assert!(last.is_err() || frozen.result().is_err());
        let mut short = DateNarrower::new();
        short.add(1_790_133_183, 1_790_133_180_000.0, 1_790_133_180_040.0).unwrap();
        assert!(short.result().is_err());
    }

    #[test]
    fn wall_change_during_measurement_is_caught() {
        assert!(skew_unchanged(Some(1000.0), Some(1100.0)));
        assert!(!skew_unchanged(Some(1000.0), Some(3600.0)));
        assert!(skew_unchanged(None, Some(3600.0)));
    }

    #[cfg(windows)]
    #[test]
    fn wall_skew_is_stable_between_reads() {
        let a = wall_skew_ms().unwrap();
        std::thread::sleep(Duration::from_millis(50));
        let b = wall_skew_ms().unwrap();
        // GetTickCount64 해상도(약 16ms)만큼만 흔들립니다.
        assert!((a - b).abs() < 40.0, "{a} {b}");
    }

    /// 실제 네트워크로 세 단계를 모두 재 봅니다. 평소 `cargo test`에서는 돌지 않습니다.
    /// 실행: `cargo test --lib live_sources -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn live_sources() {
        let ntp = measure_ntp();
        println!("NTP   {ntp:?}");
        let https = tauri::async_runtime::block_on(measure_web(&HTTPS_SOURCES, "https"));
        println!("HTTPS {https:?}");
        let http = tauri::async_runtime::block_on(measure_web(&HTTP_SOURCES, "http"));
        println!("HTTP  {http:?}");
        let all = tauri::async_runtime::block_on(clock_time_offset());
        println!("명령  {all:?}");
        assert!(all.is_ok());
    }

    #[test]
    fn host_names_for_display() {
        assert_eq!(host_of("https://www.google.com/generate_204"), "www.google.com");
        assert_eq!(host_of("http://www.cloudflare.com/cdn-cgi/trace"), "www.cloudflare.com");
    }
}
