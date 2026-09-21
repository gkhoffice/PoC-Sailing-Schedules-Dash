import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildMaerskRoutingRequest,
  parseMaerskRoutes,
} from "../src/lib/msc-scraper";
import {
  mergeSchedules,
  mergeSchedulesWithFallback,
  type NormalizedSchedule,
} from "../src/lib/schedule-store";

const mscSchedule: NormalizedSchedule = {
  id: "msc-1",
  carrier: "MSC",
  bookingUrl: "https://www.msc.com/en/lp/book-with-mymsc",
  origin: "Port Louis",
  originCountry: "Mauritius",
  destination: "Singapore",
  destinationCountry: "Singapore",
  vessel: "MSC Fixture",
  voyage: "001E",
  departureDate: "2026-10-01",
  arrivalDate: "2026-10-11",
  transitTime: "10 days",
  service: "Lion Service",
};

test("Maersk request uses Port Louis CY, any selected destination, and upcoming dates", () => {
  const request = buildMaerskRoutingRequest("2026-09-21", { portCode: "SINGAPORE" });

  assert.equal(request.exportServiceType, "CY");
  assert.equal(request.importServiceType, "CY");
  assert.deepEqual(request.startLocation.alternativeCodes, [
    { alternativeCodeType: "GEO_ID", alternativeCode: "2UNE2GAU89K73" },
  ]);
  assert.deepEqual(request.endLocation.alternativeCodes, [
    { alternativeCodeType: "GEO_ID", alternativeCode: "SINGAPORE" },
  ]);
  assert.deepEqual(request.timeRange, {
    routingsBasedOn: "DEPARTURE_DATE",
    earliestTime: "2026-09-21",
    latestTime: "2026-11-16",
  });
});

test("Maersk routes normalize carrier identity and source link", () => {
  const schedules = parseMaerskRoutes([
    {
      destination: { cityName: "Singapore", countryName: "Singapore", portCode: "SINGAPORE" },
      payload: {
        routings: [
          {
            estimatedTransitTime: "P10D",
            routingLegs: [
              {
                carriage: {
                  vessel: { vesselName: "MAERSK STOCKHOLM" },
                  vesselPortCallStart: {
                    departureVoyageNumber: "652N",
                    estimatedTimeOfDeparture: "2026-10-01T08:00:00",
                    departureService: { serviceName: "SAFARI I SERVICE" },
                  },
                  vesselPortCallEnd: { estimatedTimeOfArrival: "2026-10-11T12:00:00" },
                },
              },
            ],
          },
        ],
      },
    },
  ]);

  assert.equal(schedules.length, 1);
  assert.equal(schedules[0].carrier, "Maersk");
  assert.equal(schedules[0].bookingUrl, "https://www.maersk.com/schedules/pointToPoint");
  assert.equal(schedules[0].origin, "Port Louis");
  assert.equal(schedules[0].originCountry, "Mauritius");
  assert.equal(schedules[0].destination, "Singapore");
  assert.equal(schedules[0].vessel, "MAERSK STOCKHOLM");
  assert.equal(schedules[0].voyage, "652N");
  assert.equal(schedules[0].departureDate, "2026-10-01");
  assert.equal(schedules[0].arrivalDate, "2026-10-11");
});

test("merging sources removes duplicate rows without collapsing carrier identity", () => {
  const maerskSchedule = {
    ...mscSchedule,
    id: "maersk-1",
    carrier: "Maersk",
    bookingUrl: "https://www.maersk.com/schedules/pointToPoint",
  };

  const merged = mergeSchedules([mscSchedule, mscSchedule], [maerskSchedule, maerskSchedule]);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged.map((schedule) => schedule.carrier), ["MSC", "Maersk"]);
});

test("a failed source falls back to its cached rows while the other source refreshes", () => {
  const maerskSchedule: NormalizedSchedule = {
    ...mscSchedule,
    id: "maersk-1",
    carrier: "Maersk",
    bookingUrl: "https://www.maersk.com/schedules/pointToPoint",
  };
  const refreshedMsc = { ...mscSchedule, id: "msc-new" };

  const merged = mergeSchedulesWithFallback([refreshedMsc], null, [mscSchedule, maerskSchedule]);
  assert.deepEqual(merged.map((schedule) => schedule.id), ["msc-new", "maersk-1"]);
  assert.equal(merged[1].carrier, "Maersk");
});