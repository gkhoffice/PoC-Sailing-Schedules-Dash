import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const fixture = {
  schedules: [
    {
      id: "us-1",
      origin: "Rotterdam",
      originCountry: "Netherlands",
      destination: "Los Angeles",
      destinationCountry: "United States",
      vessel: "Local Fixture",
      voyage: "001E",
      departureDate: "2026-10-01",
      arrivalDate: "2026-10-20",
      transitTime: "19 days",
      service: "Fixture Service",
    },
    {
      id: "us-2",
      origin: "Hamburg",
      originCountry: "Germany",
      destination: "New York",
      destinationCountry: "United States",
      vessel: "Local Fixture",
      voyage: "002E",
      departureDate: "2026-10-03",
      arrivalDate: "2026-10-16",
      transitTime: "13 days",
      service: "Fixture Service",
    },
    {
      id: "uk-1",
      origin: "Shanghai",
      originCountry: "China",
      destination: "Felixstowe",
      destinationCountry: "United Kingdom",
      vessel: "Local Fixture",
      voyage: "003E",
      departureDate: "2026-10-05",
      arrivalDate: "2026-10-25",
      transitTime: "20 days",
      service: "Fixture Service",
    },
    {
      id: "undated-1",
      origin: "Singapore",
      originCountry: "Singapore",
      destination: "Sydney",
      destinationCountry: "Australia",
      vessel: "Local Fixture",
      voyage: "004E",
      departureDate: null,
      arrivalDate: null,
      transitTime: null,
      service: "Fixture Service",
    },
    {
      id: "maersk-1",
      carrier: "Maersk",
      bookingUrl: "https://www.maersk.com/schedules/pointToPoint",
      origin: "Port Louis",
      originCountry: "Mauritius",
      destination: "Singapore",
      destinationCountry: "Singapore",
      vessel: "Maersk Fixture",
      voyage: "005N",
      departureDate: "2026-10-07",
      arrivalDate: "2026-10-17",
      transitTime: "10 days",
      service: "Maersk Service",
    },
  ],
  lastUpdated: "2026-09-19T00:00:00.000Z",
  source: "Local route test fixture",
};

const cacheDirectory = await mkdtemp(path.join(os.tmpdir(), "api-schedules-test-"));
const cachePath = path.join(cacheDirectory, "schedules.json");
await writeFile(cachePath, `${JSON.stringify(fixture)}\n`, "utf8");
process.env.SCHEDULE_CACHE_PATH = cachePath;

const { default: app } = await import("../src/app");
const server = createServer(app);
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") {
  throw new Error("The test server did not expose a TCP address.");
}
const baseUrl = `http://127.0.0.1:${address.port}`;

test.after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await rm(cacheDirectory, { recursive: true, force: true });
});
test("searching by destination country returns matching sailings", async () => {
  const response = await fetch(`${baseUrl}/api/schedules?destination=United%20States`);
  assert.equal(response.status, 200);

  const body = (await response.json()) as {
    count: number;
    schedules: Array<{ id: string; destinationCountry: string | null }>;
  };
  assert.equal(body.count, 2);
  assert.deepEqual(
    body.schedules.map((schedule) => schedule.id),
    ["us-1", "us-2"],
  );
  assert.ok(body.schedules.every((schedule) => schedule.destinationCountry === "United States"));
});
test("searching by lowercase destination country is case-insensitive", async () => {
  const response = await fetch(`${baseUrl}/api/schedules?destination=united%20states`);
  assert.equal(response.status, 200);

  const body = (await response.json()) as {
    count: number;
    schedules: Array<{ id: string; destinationCountry: string | null }>;
  };
  assert.equal(body.count, 2);
  assert.deepEqual(
    body.schedules.map((schedule) => schedule.id),
    ["us-1", "us-2"],
  );
  assert.ok(body.schedules.every((schedule) => schedule.destinationCountry === "United States"));
});

test("searching by destination country ignores surrounding spaces", async () => {
  const response = await fetch(`${baseUrl}/api/schedules?destination=%20%20United%20States%20%20`);
  assert.equal(response.status, 200);

  const body = (await response.json()) as {
    count: number;
    schedules: Array<{ id: string; destinationCountry: string | null }>;
  };
  assert.equal(body.count, 2);
  assert.deepEqual(
    body.schedules.map((schedule) => schedule.id),
    ["us-1", "us-2"],
  );
  assert.ok(body.schedules.every((schedule) => schedule.destinationCountry === "United States"));
});

test("searching by multiple ports or countries returns matches for any term", async () => {
  const response = await fetch(`${baseUrl}/api/schedules?destination=United%20States%2CFelixstowe`);
  assert.equal(response.status, 200);

  const body = (await response.json()) as {
    count: number;
    schedules: Array<{ id: string }>;
  };
  assert.equal(body.count, 3);
  assert.deepEqual(
    body.schedules.map((schedule) => schedule.id),
    ["us-1", "us-2", "uk-1"],
  );
});

test("searching by an unrelated country excludes all fixture sailings", async () => {
  const response = await fetch(`${baseUrl}/api/schedules?destination=Canada`);
  assert.equal(response.status, 200);

  const body = (await response.json()) as {
    count: number;
    schedules: unknown[];
  };
  assert.equal(body.count, 0);
  assert.deepEqual(body.schedules, []);
});

test("searching by one or more carriers is case-insensitive", async () => {
  const response = await fetch(`${baseUrl}/api/schedules?carrier=msc%2Cmaersk`);
  assert.equal(response.status, 200);

  const body = (await response.json()) as {
    count: number;
    schedules: Array<{ id: string; carrier: string }>;
  };
  assert.equal(body.count, 5);
  assert.deepEqual(
    body.schedules.map((schedule) => schedule.id),
    ["us-1", "us-2", "uk-1", "undated-1", "maersk-1"],
  );
  assert.deepEqual(new Set(body.schedules.map((schedule) => schedule.carrier)), new Set(["MSC", "Maersk"]));
});

test("searching by a single carrier excludes other carriers", async () => {
  const response = await fetch(`${baseUrl}/api/schedules?carrier=Maersk`);
  assert.equal(response.status, 200);

  const body = (await response.json()) as {
    count: number;
    schedules: Array<{ id: string; carrier: string }>;
  };
  assert.equal(body.count, 1);
  assert.equal(body.schedules[0]?.id, "maersk-1");
  assert.equal(body.schedules[0]?.carrier, "Maersk");
});

test("departureFrom includes the boundary date and excludes earlier sailings", async () => {
  const response = await fetch(`${baseUrl}/api/schedules?departureFrom=2026-10-03`);
  assert.equal(response.status, 200);

  const body = (await response.json()) as {
    count: number;
    schedules: Array<{ id: string; departureDate: string | null }>;
  };
  assert.equal(body.count, 3);
  assert.deepEqual(
    body.schedules.map((schedule) => schedule.id),
    ["us-2", "uk-1", "maersk-1"],
  );
  assert.ok(!body.schedules.some((schedule) => schedule.id === "undated-1"));
  assert.ok(body.schedules.every((schedule) => schedule.departureDate >= "2026-10-03"));
});

test("departureTo includes the boundary date and excludes later sailings", async () => {
  const response = await fetch(`${baseUrl}/api/schedules?departureTo=2026-10-03`);
  assert.equal(response.status, 200);

  const body = (await response.json()) as {
    count: number;
    schedules: Array<{ id: string; departureDate: string | null }>;
  };
  assert.equal(body.count, 2);
  assert.deepEqual(
    body.schedules.map((schedule) => schedule.id),
    ["us-1", "us-2"],
  );
  assert.ok(!body.schedules.some((schedule) => schedule.id === "undated-1"));
  assert.ok(body.schedules.every((schedule) => schedule.departureDate?.slice(0, 10) <= "2026-10-03"));
});

test("malformed departureFrom returns a client validation error", async () => {
  const response = await fetch(`${baseUrl}/api/schedules?departureFrom=not-a-date`);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "departureFrom must be a valid date in YYYY-MM-DD format.",
  });
});

test("malformed departureTo returns a client validation error", async () => {
  const response = await fetch(`${baseUrl}/api/schedules?departureTo=2026-02-30`);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "departureTo must be a valid date in YYYY-MM-DD format.",
  });
});

test("reversed departure date ranges return a client validation error", async () => {
  const response = await fetch(
    `${baseUrl}/api/schedules?departureFrom=2026-10-04&departureTo=2026-10-03`,
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "departureFrom must be on or before departureTo.",
  });
}); // EOF
// End of schedule route tests.
// File intentionally ends after the fixture assertions.
