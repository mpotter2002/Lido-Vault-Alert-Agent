const DEFAULT_TIME_ZONE = process.env.NOTIFICATION_TIME_ZONE ?? "America/Chicago";
const DEFAULT_DIGEST_HOUR = Number(process.env.NON_CRITICAL_DIGEST_HOUR_LOCAL ?? "8");

function getLocalHour(date: Date, timeZone: string): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone,
    }).format(date)
  );
}

export interface NotificationSchedule {
  timeZone: string;
  digestHourLocal: number;
  digestWindowOpen: boolean;
}

export function getNotificationSchedule(date = new Date()): NotificationSchedule {
  const digestHourLocal = Number.isInteger(DEFAULT_DIGEST_HOUR)
    ? DEFAULT_DIGEST_HOUR
    : 8;
  const currentHour = getLocalHour(date, DEFAULT_TIME_ZONE);

  return {
    timeZone: DEFAULT_TIME_ZONE,
    digestHourLocal,
    digestWindowOpen: currentHour === digestHourLocal,
  };
}
