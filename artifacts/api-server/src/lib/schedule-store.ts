import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type NormalizedSchedule = {
  id: string;
  origin: string;
  destination: string;
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

const cachePath = path.resolve(process.cwd(), "data", "msc-schedules.json");

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
      schedules: Array.isArray(parsed.schedules) ? parsed.schedules : [],
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