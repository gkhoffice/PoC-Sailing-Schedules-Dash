import { Router, type IRouter } from "express";
import {
  GetSchedulesQueryParams,
  GetSchedulesResponse,
  GetScheduleSummaryResponse,
  RefreshSchedulesResponse,
} from "@workspace/api-zod";
import { isCacheStale, readScheduleCache, writeScheduleCache } from "../lib/schedule-store";
import { refreshMscSchedules } from "../lib/msc-scraper";

const router: IRouter = Router();
let refreshInFlight: Promise<Awaited<ReturnType<typeof refreshMscSchedules>>> | null = null;

const buildResponse = async (query: Record<string, unknown>) => {
  const parsed = GetSchedulesQueryParams.safeParse({
    ...query,
    departureFrom:
      typeof query.departureFrom === "string"
        ? new Date(`${query.departureFrom}T00:00:00.000Z`)
        : query.departureFrom,
    departureTo:
      typeof query.departureTo === "string"
        ? new Date(`${query.departureTo}T00:00:00.000Z`)
        : query.departureTo,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.message);
  }
  const cache = await readScheduleCache();
  const destinationTerms = (parsed.data.destination ?? "")
    .split(",")
    .map((term) => term.trim().toLowerCase())
    .filter(Boolean);
  const schedules = cache.schedules.filter((schedule) => {
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
      refreshInFlight = refreshMscSchedules().finally(() => {
        refreshInFlight = null;
      });
    }
    const schedules = await refreshInFlight;
    const cache = {
      schedules,
      lastUpdated: new Date().toISOString(),
      source: "MSC Search a Schedule",
    };
    await writeScheduleCache(cache);
    res.json(RefreshSchedulesResponse.parse({ ...cache, isStale: false, count: schedules.length }));
  } catch (error) {
    req.log.error({ err: error }, "MSC schedule refresh failed");
    res.status(502).json({ error: error instanceof Error ? error.message : "MSC schedule refresh failed." });
  }
});

export default router;