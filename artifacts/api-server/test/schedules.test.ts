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