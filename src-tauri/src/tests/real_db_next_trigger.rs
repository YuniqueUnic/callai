use chrono::{Timelike, Utc};

use crate::app::ports::AlarmStore;
use crate::domain::{detect_system_timezone, resolve_timezone};
use crate::infra::SqliteStore;

#[test]
fn real_user_db_water_alarm_next_is_shanghai_20() {
    let db = dirs::data_local_dir()
        .expect("data_local")
        .join("callai")
        .join("callai.db");
    if !db.exists() {
        eprintln!("skip: no {}", db.display());
        return;
    }
    let store = SqliteStore::open(&db).expect("open db");
    let settings = store.get_settings().expect("settings");
    eprintln!("settings.timezone = {:?}", settings.timezone());
    let tz = resolve_timezone(settings.timezone()).expect("resolve");
    eprintln!("resolved tz = {}", tz.name());
    eprintln!("detect = {}", detect_system_timezone().name());

    let alarms = store.list_alarms().expect("list");
    let water = alarms
        .iter()
        .find(|a| a.name.contains("浇花") || a.id == "771b8736-ff43-4605-a005-cc0b89b0d55b")
        .expect("water alarm");
    eprintln!("alarm schedule = {:?}", water.schedule);

    let now = Utc::now();
    let next = water
        .schedule
        .next_trigger_after_in_tz(now, tz)
        .expect("next ok")
        .expect("has next");
    let mins = (next - now).num_minutes();
    let local = next.with_timezone(&tz);
    eprintln!("now_utc={now}");
    eprintln!("next_utc={next}");
    eprintln!("next_local={local}");
    eprintln!("mins={mins}");

    assert_eq!(local.hour(), 20, "local hour {}", local);
    assert_eq!(local.minute(), 0);

    let now_local = now.with_timezone(&tz);
    if now_local.hour() < 20 {
        assert!(
            mins < 8 * 60,
            "expected under 8h to 20:00, got {mins} min (now_local={now_local})"
        );
    }
}
