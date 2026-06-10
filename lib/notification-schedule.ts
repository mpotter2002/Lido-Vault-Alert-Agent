const DEFAULT_TIME_ZONE = process.env.NOTIFICATION_TIME_ZONE ?? "America/Chicago";
const DEFAULT_DIGEST_HOURS = [8, 18];

function getLocalHour(date: Date, timeZone: string): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone,
    }).format(date)
  );
}

function normalizeDigestHours(rawHours: string | undefined): number[] {
  const parsed = (rawHours ?? "")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 23);

  const uniqueSorted = Array.from(new Set(parsed)).sort((a, b) => a - b);
  return uniqueSorted.length > 0 ? uniqueSorted : DEFAULT_DIGEST_HOURS;
}

export interface NotificationSchedule {
  timeZone: string;
  digestHoursLocal: number[];
  digestWindowOpen: boolean;
  activeDigestHourLocal: number | null;
}

export function getNotificationSchedule(date = new Date()): NotificationSchedule {
  const digestHoursLocal = normalizeDigestHours(
    process.env.NON_CRITICAL_DIGEST_HOURS_LOCAL
  );
  const currentHour = getLocalHour(date, DEFAULT_TIME_ZONE);

  return {
    timeZone: DEFAULT_TIME_ZONE,
    digestHoursLocal,
    digestWindowOpen: digestHoursLocal.includes(currentHour),
    activeDigestHourLocal: digestHoursLocal.includes(currentHour) ? currentHour : null,
  };
}
