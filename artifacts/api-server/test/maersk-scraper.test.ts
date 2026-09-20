import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, latestDepartureDate, parseMaerskRoutes } from "../src/lib/msc-scraper";
import { mergeSchedules, type NormalizedSchedule } from "../src/lib/schedule-store";

const cachedSchedules: NormalizedSchedule[] = [
  {
    id: "cached-1",
    carrier: "MSC",
    bookingUrl: "https://www.msc.com/en/lp/book-with-mymsc",
    origin: "Port Louis",
    originCountry: "Mauritius",
    destination: "Singapore",
    destinationCountry: "Singapore",
    vessel: "MSC Fixture",
    voyage: "001E",
    departureDate: "2026-11-14",
    arrivalDate: "2026-11-24",
    transitTime: "10 days",
    service: "Fixture Service",
  },
];

test("Maersk departure date is anchored 35 days after the latest cached departure", () => {
  assert.equal(latestDepartureDate(cachedSchedules), "2026-11-14");
  assert.equal(addDays(latestDepartureDate(cachedSchedules)!, 35), "2026-12-19");
  assert.equal(latestDepartureDate([{ ...cachedSchedules[0], departureDate: null }]), null);
});

test("Maersk routes normalize carrier identity and source link", () => {
  const schedules = parseMaerskRoutes([
    {
      destination: { cityName: "Singapore", countryName: "Singapore", portCode: "0XOP5ISJZK0HR" },
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
                    estimatedTimeOfDeparture: "2027-01-01T08:00:00",
                    departureService: { serviceName: "SAFARI I SERVICE" },
                  },
                  vesselPortCallEnd: { estimatedTimeOfArrival: "2027-01-11T12:00:00" },
                },
              },
            ],
          },
        ],
      },
    },
  ]);
  assert.equal(schedules.length, 1);
  assert.deepEqual(schedules[0], {
    id: schedules[0].id,
    carrier: "Maersk",
    bookingUrl: "https://www.maersk.com/schedules/pointToPoint",
    origin: "Port Louis",
    originCountry: "Mauritius",
    destination: "Singapore",
    destinationCountry: "Singapore",
    vessel: "MAERSK STOCKHOLM",
    voyage: "652N",
    departureDate: "2027-01-01",
    arrivalDate: "2027-01-11",
    transitTime: "P10D",
    service: "SAFARI I SERVICE",
  });
});

test("merging refreshed sources removes exact duplicate rows but preserves carrier identity", () => {
  const msc = cachedSchedules[0];
  const maersk = { ...msc, id: "maersk-1", carrier: "Maersk", bookingUrl: "https://www.maersk.com/schedules/pointToPoint" };
  assert.equal(mergeSchedules([msc, msc], [maersk, maersk]).length, 2);
  assert.deepEqual(mergeSchedules([msc], [maersk]).map((schedule) => schedule.carrier), ["MSC", "Maersk"]);
});