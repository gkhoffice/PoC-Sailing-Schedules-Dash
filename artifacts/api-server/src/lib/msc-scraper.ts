import { chromium, type Page } from "playwright";
import { createHash } from "node:crypto";
import type { NormalizedSchedule } from "./schedule-store";
import { logger } from "./logger";

const MSC_SCHEDULE_URL = "https://www.msc.com/en/search-a-schedule";
const MSC_PORTS_URL = "/api/feature/tools/GetAllAvailableCountriesAndPorts";
const MSC_ROUTES_URL = "/api/feature/tools/SearchSailingRoutes";
const MSC_DATA_SOURCE_ID = "{E9CCBD25-6FBA-4C5C-85F6-FC4F9E5A931F}";
const PORT_LOUIS = "Port Louis";

type JsonValue = Record<string, unknown> | unknown[];

const keyFor = (value: string): string =>
  value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();

const stringValue = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return null;
};

const fieldValue = (record: Record<string, unknown>, aliases: string[]): string | null => {
  const entries = Object.entries(record);
  for (const alias of aliases) {
    const normalizedAlias = keyFor(alias);
    const direct = entries.find(([key]) => keyFor(key) === normalizedAlias);
    const value = direct ? stringValue(direct[1]) : null;
    if (value) return value;
  }
  return null;
};

const dateValue = (value: string | null): string | null => {
  if (!value) return null;
  const normalized = value.trim();
  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) return normalized;
  return new Date(timestamp).toISOString().slice(0, 10);
};

const unwrapRecord = (record: Record<string, unknown>): Record<string, unknown> => {
  const nestedKeys = ["schedule", "sailing", "route", "details", "data"];
  for (const nestedKey of nestedKeys) {
    const nested = Object.entries(record).find(([key]) => keyFor(key) === nestedKey)?.[1];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      return { ...record, ...(nested as Record<string, unknown>) };
    }
  }
  return record;
};

function normalizeRecord(input: Record<string, unknown>, index: number): NormalizedSchedule | null {
  const record = unwrapRecord(input);
  const legs = record.legs;
  const firstLeg =
    Array.isArray(legs) && legs[0] && typeof legs[0] === "object"
      ? (legs[0] as Record<string, unknown>)
      : {};
  const merged = { ...firstLeg, ...record };

  const destination =
    fieldValue(merged, [
      "destination",
      "destinationPort",
      "destinationPortName",
      "to",
      "pod",
      "portOfDischarge",
      "dischargePort",
    ]) ?? "";
  const origin =
    fieldValue(merged, [
      "origin",
      "originPort",
      "originPortName",
      "from",
      "pol",
      "portOfLoading",
      "loadPort",
      "departurePort",
    ]) ?? PORT_LOUIS;
  const originCountry = fieldValue(merged, [
    "originCountry",
    "originCountryName",
    "portOfLoadingCountry",
    "fromCountry",
    "polCountry",
  ]);
  const destinationCountry = fieldValue(merged, [
    "destinationCountry",
    "destinationCountryName",
    "portOfDischargeCountry",
    "toCountry",
    "podCountry",
  ]);
  const vessel = fieldValue(merged, ["vessel", "vesselName", "shipName", "ship"]) ?? "";
  const voyage = fieldValue(merged, ["voyage", "voyageNumber", "voyageNo", "vesselVoyage", "sailing"]) ?? "";

  if (!destination && !vessel && !voyage) return null;

  const departureDate = dateValue(
    fieldValue(merged, [
      "departureDate",
      "etd",
      "estimatedTimeOfDeparture",
      "departure",
      "sailDate",
      "etdDate",
    ]),
  );
  const arrivalDate = dateValue(
    fieldValue(merged, [
      "arrivalDate",
      "eta",
      "estimatedTimeOfArrival",
      "arrival",
      "etaDate",
    ]),
  );

  const idSource = [
    origin,
    destination,
    vessel,
    voyage,
    departureDate ?? index,
  ].join("|");

  return {
    id: createHash("sha1").update(idSource).digest("hex").slice(0, 12),
    origin,
    originCountry,
    destination: destination || "Any destination",
    destinationCountry,
    vessel: vessel || "—",
    voyage: voyage || "—",
    departureDate,
    arrivalDate,
    transitTime: fieldValue(merged, ["transitTime", "transit", "transitDays", "duration"]),
    service: fieldValue(merged, ["service", "serviceName", "route", "serviceLoop"]),
  };
}

function collectRecords(value: unknown, result: Record<string, unknown>[]): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const record = item as Record<string, unknown>;
        const hasScheduleSignal = Object.keys(record).some((key) =>
          /destination|origin|vessel|voyage|etd|eta|departure|arrival/i.test(key),
        );
        if (hasScheduleSignal) result.push(record);
      }
      collectRecords(item, result);
    }
    return;
  }
  if (value && typeof value === "object") {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      collectRecords(nested, result);
    }
  }
}

function parseSchedules(payload: unknown): NormalizedSchedule[] {
  const records: Record<string, unknown>[] = [];
  collectRecords(payload, records);

  const unique = new Map<string, NormalizedSchedule>();
  records.forEach((record, index) => {
    const normalized = normalizeRecord(record, index);
    if (normalized) unique.set(normalized.id, normalized);
  });
  return [...unique.values()];
}

function parseMscRoutes(payloads: unknown[]): NormalizedSchedule[] {
  const records: Record<string, unknown>[] = [];

  for (const payload of payloads) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) continue;
    const envelope = payload as Record<string, unknown>;
    const routePayload =
      envelope.payload && typeof envelope.payload === "object" && !Array.isArray(envelope.payload)
        ? (envelope.payload as Record<string, unknown>)
        : envelope;
    const originCountry = stringValue(envelope.originCountry);
    const destinationCountry = stringValue(envelope.destinationCountry);
    const data = routePayload.Data;
    if (!Array.isArray(data)) continue;

    for (const routeGroup of data) {
      if (!routeGroup || typeof routeGroup !== "object" || Array.isArray(routeGroup)) continue;
      const group = routeGroup as Record<string, unknown>;
      const routes = Array.isArray(group.Routes) ? group.Routes : [group];

      for (const route of routes) {
        if (!route || typeof route !== "object" || Array.isArray(route)) continue;
        const routeRecord = route as Record<string, unknown>;
        const legs = Array.isArray(routeRecord.RouteScheduleLegDetails)
          ? routeRecord.RouteScheduleLegDetails
          : [];
        const firstLeg = legs[0] && typeof legs[0] === "object" ? (legs[0] as Record<string, unknown>) : {};
        const vessel =
          typeof routeRecord.VesselName === "string"
            ? routeRecord.VesselName
            : firstLeg.Vessel && typeof firstLeg.Vessel === "object"
              ? (firstLeg.Vessel as Record<string, unknown>).VesselName
              : null;

        records.push({
          origin: group.PortOfLoad ?? firstLeg.DeparturePortName,
          originCountry,
          destination: group.PortOfDischarge ?? firstLeg.ArrivalPortName,
          destinationCountry,
          vessel,
          voyage: routeRecord.DepartureVoyageNo ?? firstLeg.DepartureVoyageNo,
          departureDate: routeRecord.EstimatedDepartureDate ?? group.EstimatedDepartureTime,
          arrivalDate: routeRecord.EstimatedArrivalDate ?? firstLeg.EstimatedArrivalTime,
          transitTime: routeRecord.TotalTransitTime ?? group.TransitTime,
          service:
            routeRecord.MaritimeServiceName ??
            group.LoadingService ??
            (group.Key && typeof group.Key === "object"
              ? (group.Key as Record<string, unknown>).MaritimeServiceName
              : null),
        });
      }
    }
  }

  const unique = new Map<string, NormalizedSchedule>();
  records.forEach((record, index) => {
    const normalized = normalizeRecord(record, index);
    if (normalized) unique.set(normalized.id, normalized);
  });
  return [...unique.values()];
}

async function fetchAllDestinationRoutes(page: Page): Promise<unknown[]> {
  const fromDate = new Date().toISOString().slice(0, 10);
  return page.evaluate(
    async ({ fromDate, dataSourceId }: { fromDate: string; dataSourceId: string }) => {
      const portsResponse = await fetch("/api/feature/tools/GetAllAvailableCountriesAndPorts");
      if (!portsResponse.ok) throw new Error(`MSC ports request failed with status ${portsResponse.status}.`);
      const portsPayload = (await portsResponse.json()) as {
        Ports?: Array<{ PortId?: number; LocationName?: string; LocationCode?: string }>;
      };
      const ports = Array.isArray(portsPayload.Ports) ? portsPayload.Ports : [];
      const origin = ports.find(
        (port) =>
          port.LocationCode?.toUpperCase() === "MUPLU" ||
          port.LocationName?.toUpperCase() === "PORT LOUIS",
      );
      if (!origin?.PortId) throw new Error("MSC Port Louis was not found in the available ports list.");

      const destinations = ports.filter((port) => port.PortId && port.PortId !== origin.PortId);
      const pending = [...destinations];
      const successful: unknown[] = [];
      const worker = async () => {
        while (pending.length > 0) {
          const destination = pending.pop();
          if (!destination?.PortId) continue;
          try {
            const response = await fetch("/api/feature/tools/SearchSailingRoutes", {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-requested-with": "XMLHttpRequest",
              },
              body: JSON.stringify({
                FromDate: fromDate,
                fromPortId: origin.PortId,
                toPortId: destination.PortId,
                language: "en",
                dataSourceId: dataSourceId,
              }),
            });
            const payload = (await response.json().catch(() => null)) as
              | { IsSuccess?: boolean; Data?: unknown[] }
              | null;
            if (payload?.IsSuccess && Array.isArray(payload.Data) && payload.Data.length > 0) {
              successful.push({
                payload,
                originCountry: origin.CountryName ?? null,
                destinationCountry: destination.LocationName ? destination.CountryName ?? null : null,
              });
            }
          } catch {
            // One unavailable destination should not discard routes from other ports.
          }
        }
      };

      await Promise.all(Array.from({ length: 16 }, () => worker()));
      return successful;
    },
    { fromDate, dataSourceId: MSC_DATA_SOURCE_ID },
  );
}

async function acceptCookies(page: Page): Promise<void> {
  const candidates = [
    page.locator("#onetrust-accept-btn-handler"),
    page.getByRole("button", { name: /accept all|allow all|agree/i }),
    page.getByText(/accept all cookies/i),
  ];
  for (const candidate of candidates) {
    try {
      if (await candidate.first().isVisible({ timeout: 1500 })) {
        await candidate.first().click({ force: true });
        await page.waitForTimeout(300);
        return;
      }
    } catch {
      // The consent banner is optional.
    }
  }
}

async function choosePort(page: Page): Promise<void> {
  const mscOrigin = page.locator("#from");
  if (await mscOrigin.isVisible({ timeout: 1500 }).catch(() => false)) {
    await mscOrigin.fill(PORT_LOUIS);
    await page.waitForTimeout(700);
    const option = page
      .locator("button.port")
      .filter({ hasText: /PORT LOUIS, MAURITIUS \(MUPLU\)/i })
      .first();
    if (await option.isVisible({ timeout: 3000 }).catch(() => false)) {
      await option.click();
      return;
    }
  }

  const labels = [/origin/i, /from/i, /port of loading/i, /load port/i];
  for (const label of labels) {
    const field = page.getByLabel(label).first();
    try {
      if (!(await field.isVisible({ timeout: 1200 }))) continue;
      await field.click();
      await field.fill(PORT_LOUIS);
      await page.waitForTimeout(500);
      const option = page.getByRole("option", { name: /Port Louis.*Mauritius|Mauritius.*Port Louis/i }).first();
      if (await option.isVisible({ timeout: 2000 })) {
        await option.click();
        return;
      }
      const textOption = page.getByText(/Port Louis.*Mauritius|Mauritius.*Port Louis/i).first();
      if (await textOption.isVisible({ timeout: 1500 })) {
        await textOption.click();
        return;
      }
    } catch {
      // Try the next likely field label.
    }
  }

  const comboboxes = page.getByRole("combobox");
  const count = await comboboxes.count();
  for (let index = 0; index < count; index += 1) {
    const field = comboboxes.nth(index);
    const placeholder = (await field.getAttribute("placeholder")) ?? "";
    const ariaLabel = (await field.getAttribute("aria-label")) ?? "";
    if (!/origin|from|loading|port/i.test(`${placeholder} ${ariaLabel}`)) continue;
    await field.fill(PORT_LOUIS);
    await page.waitForTimeout(500);
    const option = page.getByText(/Port Louis.*Mauritius|Mauritius.*Port Louis/i).first();
    if (await option.isVisible({ timeout: 2000 })) {
      await option.click();
      return;
    }
  }

  throw new Error("MSC origin field was not found or Port Louis could not be selected.");
}

async function submitSearch(page: Page): Promise<void> {
  const mscSearch = page.locator("button.msc-cta").first();
  if (await mscSearch.isVisible({ timeout: 1500 }).catch(() => false)) {
    await mscSearch.click({ force: true });
    return;
  }

  const buttons = [
    page.getByRole("button", { name: /search|find schedule|show sailings|view schedule/i }).first(),
    page.getByText(/search a schedule|find schedule/i).last(),
  ];
  for (const button of buttons) {
    try {
      if (await button.isVisible({ timeout: 1500 })) {
        await button.click({ force: true });
        return;
      }
    } catch {
      // Try the next likely submit control.
    }
  }
  throw new Error("MSC schedule search button was not found.");
}

export async function scrapeMscSchedules(): Promise<NormalizedSchedule[]> {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? "/repl/tools/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"],
  });
  const page = await browser.newPage({
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
    locale: "en-US",
  });
  const payloads: unknown[] = [];

  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });

  page.on("response", async (response) => {
    const contentType = response.headers()["content-type"] ?? "";
    const url = response.url();
    if (!contentType.includes("application/json") || !/schedule|sailing|route|search|voyage/i.test(url)) return;
    try {
      payloads.push(await response.json());
    } catch {
      // Ignore non-JSON or already-consumed responses.
    }
  });

  try {
    const response = await page.goto(MSC_SCHEDULE_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const bodyText = await page.locator("body").innerText().catch(() => "");
    if (response?.status() === 403 || /access denied|permission to access/i.test(bodyText)) {
      throw new Error("MSC denied automated browser access to the schedule page. Try refreshing later or run the app from an environment allowed by MSC.");
    }
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
    await page.waitForTimeout(500);
    await acceptCookies(page);
    await choosePort(page);
    await submitSearch(page);
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
    await page.waitForTimeout(2_000);

    for (const payload of payloads) {
      const schedules = parseSchedules(payload);
      if (schedules.length > 0) return schedules;
    }

    const allDestinationPayloads = await fetchAllDestinationRoutes(page);
    const allDestinationSchedules = parseMscRoutes(allDestinationPayloads);
    if (allDestinationSchedules.length > 0) return allDestinationSchedules;

    throw new Error(
      `MSC returned no recognizable schedule data (${payloads.length} page responses and ${allDestinationPayloads.length} route responses captured).`,
    );
  } finally {
    await browser.close();
  }
}

export async function refreshMscSchedules(): Promise<NormalizedSchedule[]> {
  logger.info("Starting MSC schedule refresh");
  const schedules = await scrapeMscSchedules();
  logger.info({ count: schedules.length }, "MSC schedule refresh completed");
  return schedules;
}