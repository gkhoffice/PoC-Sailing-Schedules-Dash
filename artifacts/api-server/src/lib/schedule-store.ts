import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type NormalizedSchedule = {
  id: string;
  carrier: string;
  bookingUrl: string;
  origin: string;
  originCountry: string | null;
  destination: string;
  destinationCountry: string | null;
  vessel: string;
  voyage: string;
  departureDate: string | null;
  arrivalDate: string | null;
  transitTime: string | null;
  service: string | null;
};

export type ScheduleCache = {
  schedules: NormalizedSchedule[];
  lastUpdated: string | null;
  source: string;
};

export function mergeSchedules(
  mscSchedules: NormalizedSchedule[],
  maerskSchedules: NormalizedSchedule[],
): NormalizedSchedule[] {
  return [...new Map([...mscSchedules, ...maerskSchedules].map((schedule) => [schedule.id, schedule])).values()];
}

const cachePath = path.resolve(
  process.env.SCHEDULE_CACHE_PATH ?? path.join(process.cwd(), "data", "msc-schedules.json"),
);

const emptyCache = (): ScheduleCache => ({
  schedules: [],
  lastUpdated: null,
  source: "MSC Search a Schedule",
});

export async function readScheduleCache(): Promise<ScheduleCache> {
  try {
    const content = await readFile(cachePath, "utf8");
    const parsed = JSON.parse(content) as Partial<ScheduleCache>;
    return {
      schedules: Array.isArray(parsed.schedules)
        ? parsed.schedules.map((schedule) => ({
            ...schedule,
            carrier: typeof schedule.carrier === "string" ? schedule.carrier : "MSC",
            bookingUrl:
              typeof schedule.bookingUrl === "string"
                ? schedule.bookingUrl
                : "https://www.msc.com/en/lp/book-with-mymsc",
            originCountry: typeof schedule.originCountry === "string" ? schedule.originCountry : null,
            destinationCountry: typeof schedule.destinationCountry === "string" ? schedule.destinationCountry : null,
          }))
        : [],
      lastUpdated: typeof parsed.lastUpdated === "string" ? parsed.lastUpdated : null,
      source: typeof parsed.source === "string" ? parsed.source : emptyCache().source,
    };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    if (code === "ENOENT") {
      return emptyCache();
    }
    throw error;
  }
}

export async function writeScheduleCache(cache: ScheduleCache): Promise<void> {
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

export function isCacheStale(lastUpdated: string | null): boolean {
  if (!lastUpdated) return true;
  const updatedAt = Date.parse(lastUpdated);
  return !Number.isFinite(updatedAt) || Date.now() - updatedAt > 24 * 60 * 60 * 1000;
}