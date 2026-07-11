import { useEffect, useState } from "react";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Compact island-style clock: [weekday+date | HH:MM] always horizontal. */
export function IslandTime() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");

  return (
    <div className="island-clock" aria-hidden>
      <div className="island-clock-date">
        <span className="island-clock-weekday">{WEEKDAYS[now.getDay()]}</span>
        <span className="island-clock-monthday">
          {MONTHS[now.getMonth()]} {now.getDate()}
        </span>
      </div>
      <div className="island-clock-time" aria-label={`${hh}:${mm}`}>
        <span className="island-clock-hh">{hh}</span>
        <span className="island-clock-colon">:</span>
        <span className="island-clock-mm">{mm}</span>
      </div>
    </div>
  );
}
