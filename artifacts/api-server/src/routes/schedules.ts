import { Router, type IRouter } from "express";
import {
  GetSchedulesQueryParams,
  GetSchedulesResponse,
  GetScheduleSummaryResponse,
  RefreshSchedulesResponse,
} from "@workspace/api-zod";
import { isCacheStale, mergeSchedules, readScheduleCache, writeScheduleCache } from "../lib/schedule-store";
import { addDays, latestDepartureDate, refreshMaerskSchedules, refreshMscSchedules } from "../lib/msc-scraper";

const router: IRouter = Router();
let refreshInFlight: Promise<Awaited<ReturnType<typeof refreshMscSchedules>>> | null = null;

class ScheduleQueryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScheduleQueryValidationError";
  }
}

const parseDepartureDate = (value: unknown, parameterName: "departureFrom" | "departureTo"): Date | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ScheduleQueryValidationError(`${parameterName} must be a valid date in YYYY-MM-DD format.`);
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ScheduleQueryValidationError(`${parameterName} must be a valid date in YYYY-MM-DD format.`);
  }
  return date;
};

const buildResponse = async (query: Record<string, unknown>) => {
  const parsed = GetSchedulesQueryParams.safeParse({
    ...query,
    departureFrom: parseDepartureDate(query.departureFrom, "departureFrom"),
    departureTo: parseDepartureDate(query.departureTo, "departureTo"),
  });
  if (!parsed.success) {
    throw new ScheduleQueryValidationError("Invalid schedule query parameters.");
  }
  if (
    parsed.data.departureFrom &&
    parsed.data.departureTo &&
    parsed.data.departureFrom > parsed.data.departureTo
  ) {
    throw new ScheduleQueryValidationError("departureFrom must be on or before departureTo.");
  }
  const cache = await readScheduleCache();
  const destinationTerms = (parsed.data.destination ?? "")
    .split(",")
    .map((term) => term.trim().toLowerCase())
    .filter(Boolean);
  const carrierTerms = (parsed.data.carrier ?? "")
    .split(",")
    .map((term) => term.trim().toLowerCase())
    .filter(Boolean);
  const schedules = cache.schedules.filter((schedule) => {
    const matchesCarrier =
      carrierTerms.length === 0 || carrierTerms.some((term) => schedule.carrier.toLowerCase() === term);
    if (!matchesCarrier) return false;
    const matchesDestination =
      destinationTerms.length === 0 ||
      destinationTerms.some(
        (term) =>
          schedule.destination.toLowerCase().includes(term) ||
          schedule.destinationCountry?.toLowerCase().includes(term),
      );
    if (!matchesDestination) return false;
    if (parsed.data.departureFrom) {
      if (!schedule.departureDate || schedule.departureDate < parsed.data.departureFrom.toISOString().slice(0, 10)) return false;
    }
    if (parsed.data.departureTo) {
      if (!schedule.departureDate || schedule.departureDate > parsed.data.departureTo.toISOString().slice(0, 10)) return false;
    }
    return true;
  });

  return GetSchedulesResponse.parse({
    schedules,
    lastUpdated: cache.lastUpdated,
    source: cache.source,
    isStale: isCacheStale(cache.lastUpdated),
    count: schedules.length,
  });
};

router.get("/schedules", async (req, res): Promise<void> => {
  try {
    const response = await buildResponse(req.query);
    res.json(response);
  } catch (error) {
    if (error instanceof ScheduleQueryValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    req.log.error({ err: error }, "Unable to read schedule cache");
    res.status(500).json({ error: "Unable to read schedule cache." });
  }
});

router.get("/schedules/summary", async (req, res): Promise<void> => {
  try {
    const cache = await readScheduleCache();
    const destinations = new Set(cache.schedules.map((schedule) => schedule.destination).filter(Boolean));
    const vessels = new Set(cache.schedules.map((schedule) => schedule.vessel).filter(Boolean));
    const departures = cache.schedules
      .map((schedule) => schedule.departureDate)
      .filter((date): date is string => Boolean(date))
      .sort();
    res.json(
      GetScheduleSummaryResponse.parse({
        count: cache.schedules.length,
        destinationCount: destinations.size,
        vesselCount: vessels.size,
        nextDeparture: departures[0] ?? null,
        lastUpdated: cache.lastUpdated,
        isStale: isCacheStale(cache.lastUpdated),
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Unable to build schedule summary");
    res.status(500).json({ error: "Unable to build schedule summary." });
  }
});

router.post("/schedules/refresh", async (req, res): Promise<void> => {
  try {
    if (!refreshInFlight) {
      refreshInFlight = (async () => {
        const existing = await readScheduleCache();
        const anchor = latestDepartureDate(existing.schedules) ?? new Date().toISOString().slice(0, 10);
        const [mscResult, maerskResult] = await Promise.allSettled([
          refreshMscSchedules(),
          refreshMaerskSchedules(anchor),
        ]);
        const mscSchedules = mscResult.status === "fulfilled" ? mscResult.value : existing.schedules.filter((s) => s.carrier === "MSC");
        const maerskSchedules =
          maerskResult.status === "fulfilled"
            ? maerskResult.value
            : existing.schedules.filter((s) => s.carrier === "Maersk");
        if (mscResult.status === "rejected") req.log.warn({ err: mscResult.reason }, "MSC schedule refresh failed; retaining cached MSC schedules");
        if (maerskResult.status === "rejected") req.log.warn({ err: maerskResult.reason }, "Maersk schedule refresh failed; retaining cached Maersk schedules");
        const merged = mergeSchedules(mscSchedules, maerskSchedules);
        if (!merged.length) throw new Error("No schedule source returned usable data.");
        return merged;
      })().finally(() => {
        refreshInFlight = null;
      });
    }
    const schedules = await refreshInFlight;
    const cache = {
      schedules,
      lastUpdated: new Date().toISOString(),
      source: "MSC + Maersk schedule interfaces",
    };
    await writeScheduleCache(cache);
    res.json(RefreshSchedulesResponse.parse({ ...cache, isStale: false, count: schedules.length }));
  } catch (error) {
    req.log.error({ err: error }, "MSC schedule refresh failed");
    res.status(502).json({ error: error instanceof Error ? error.message : "MSC schedule refresh failed." });
  }
});

export default router;