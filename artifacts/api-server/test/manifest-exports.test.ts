import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { chromium, type Browser, type Page } from "playwright";

type FixtureSchedule = {
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

type XlsxModule = {
  read: (data: Buffer, options: { type: "buffer" }) => {
    SheetNames: string[];
    Sheets: Record<string, unknown>;
  };
  utils: {
    sheet_to_json: <T>(sheet: unknown, options: { defval: string }) => T[];
  };
};

const xlsx = createRequire(import.meta.url)(
  path.resolve(import.meta.dirname, "../../msc-schedules/node_modules/xlsx/xlsx.js"),
) as XlsxModule;

const fixture: FixtureSchedule[] = [
  {
    id: "sg-1",
    carrier: "MSC",
    bookingUrl: "https://www.msc.com/en/lp/book-with-mymsc",
    origin: "Port Louis",
    originCountry: "Mauritius",
    destination: "Singapore",
    destinationCountry: "Singapore",
    vessel: "Fixture Meridian",
    voyage: "001E",
    departureDate: "2026-10-12",
    arrivalDate: "2026-10-22",
    transitTime: "10 days",
    service: "Lion Service",
  },
  {
    id: "sg-blank",
    carrier: "MSC",
    bookingUrl: "https://www.msc.com/en/lp/book-with-mymsc",
    origin: "Port Louis",
    originCountry: null,
    destination: "Singapore",
    destinationCountry: null,
    vessel: "Fixture Unlisted",
    voyage: "004S",
    departureDate: null,
    arrivalDate: null,
    transitTime: null,
    service: null,
  },
  {
    id: "za-1",
    carrier: "Maersk",
    bookingUrl: "https://www.maersk.com/schedules/pointToPoint",
    origin: "Port Louis",
    originCountry: "Mauritius",
    destination: "Durban",
    destinationCountry: "South Africa",
    vessel: "Fixture Horizon",
    voyage: "002N",
    departureDate: "2026-10-15",
    arrivalDate: "2026-10-21",
    transitTime: "6 days",
    service: "Safari Service",
  },
  {
    id: "my-1",
    carrier: "MSC",
    bookingUrl: "https://www.msc.com/en/lp/book-with-mymsc",
    origin: "Port Louis",
    originCountry: "Mauritius",
    destination: "Port Klang",
    destinationCountry: "Malaysia",
    vessel: "Fixture Pacific",
    voyage: "003W",
    departureDate: "2026-10-28",
    arrivalDate: "2026-11-08",
    transitTime: "11 days",
    service: "Jade Service",
  },
];

const getAvailablePort = async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not determine an available port.");
  }
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return address.port;
};

const waitForFrontend = async (url: string, process: ChildProcess, output: string[]) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (process.exitCode !== null) {
      throw new Error(`The frontend exited before becoming ready.\n${output.join("")}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`The frontend did not become ready.\n${output.join("")}`);
};

const scheduleResponse = (schedules: FixtureSchedule[]) => ({
  schedules,
  lastUpdated: "2026-09-20T00:00:00.000Z",
  source: "Browser export test fixture",
  isStale: false,
  count: schedules.length,
});

const installApiFixture = async (page: Page) => {
  const scheduleRequests: URL[] = [];
  await page.route("**/api/schedules**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/summary")) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          count: fixture.length,
          destinationCount: fixture.length,
          vesselCount: fixture.length,
          nextDeparture: fixture[0].departureDate,
          lastUpdated: "2026-09-20T00:00:00.000Z",
          isStale: false,
        }),
      });
      return;
    }

    scheduleRequests.push(url);
    const destinationTerms = (url.searchParams.get("destination") ?? "")
      .split(",")
      .map((term) => term.trim().toLowerCase())
      .filter(Boolean);
    const departureFrom = url.searchParams.get("departureFrom");
    const departureTo = url.searchParams.get("departureTo");
    const schedules = fixture.filter((schedule) => {
      const matchesDestination =
        destinationTerms.length === 0 ||
        destinationTerms.some(
          (term) =>
            schedule.destination.toLowerCase().includes(term) ||
            schedule.destinationCountry?.toLowerCase().includes(term),
        );
      return (
        matchesDestination &&
        (!departureFrom || schedule.departureDate >= departureFrom) &&
        (!departureTo || schedule.departureDate <= departureTo)
      );
    });

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(scheduleResponse(schedules)),
    });
  });
  return scheduleRequests;
};

const assertDownload = async (
  page: Page,
  testId: string,
  extension: "pdf" | "csv" | "xlsx",
) => {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId(testId).click(),
  ]);
  assert.match(download.suggestedFilename(), new RegExp(`^departure-manifest-\\d{4}-\\d{2}-\\d{2}\\.${extension}$`));
  const downloadPath = await download.path();
  assert.ok(downloadPath, `${extension.toUpperCase()} download should have a file path`);
  const content = await readFile(downloadPath);
  assert.ok(content.length > 0, `${extension.toUpperCase()} export should not be empty`);
  return { content, filename: download.suggestedFilename() };
};

test("manifest exports download filtered rows as usable PDF, CSV, and XLSX files", async () => {
  const port = await getAvailablePort();
  const projectRoot = path.resolve(import.meta.dirname, "../..");
  const output: string[] = [];
  const frontend = spawn(
    "pnpm",
    ["--filter", "@workspace/msc-schedules", "run", "dev"],
    {
      cwd: projectRoot,
      env: { ...process.env, PORT: String(port), BASE_PATH: "/" },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    },
  );
  frontend.stdout?.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  frontend.stderr?.on("data", (chunk: Buffer) => output.push(chunk.toString()));

  let browser: Browser | undefined;
  try {
    const frontendUrl = `http://127.0.0.1:${port}`;
    await waitForFrontend(`${frontendUrl}/manifest`, frontend, output);
    const executablePath =
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? "/repl/tools/bin/chromium";
    browser = await chromium.launch({ headless: true, executablePath });
    const page = await browser.newPage({ acceptDownloads: true });
    const scheduleRequests = await installApiFixture(page);

    await page.goto(`${frontendUrl}/manifest`);
    await page.getByTestId("row-schedule-sg-1").waitFor();
    assert.equal(await page.locator('[data-testid^="row-schedule-"]').count(), fixture.length);

    await page.getByTestId("button-toggle-filters").click();
    await page.getByTestId("input-destination").fill("Singapore");
    await page.getByTestId("suggestion-destination-Singapore").click();
    await page.getByTestId("input-departure-from").fill("2026-10-10");
    await page.getByTestId("input-departure-to").fill("2026-10-20");
    await page.getByTestId("button-search-schedules").click();
    await page.getByTestId("row-schedule-sg-1").waitFor();

    assert.equal(await page.locator('[data-testid^="row-schedule-"]').count(), 1);
    assert.match(await page.getByTestId("text-destination-sg-1").textContent() ?? "", /Singapore.*Singapore/);
    assert.ok(
      scheduleRequests.some(
        (url) =>
          url.searchParams.get("destination") === "Singapore" &&
          url.searchParams.get("departureFrom") === "2026-10-10" &&
          url.searchParams.get("departureTo") === "2026-10-20",
      ),
      "the filtered manifest should request both destination and date filters",
    );

    await page.getByTestId("button-toggle-filters").click();
    await page.getByTestId("input-departure-from").fill("");
    await page.getByTestId("input-departure-to").fill("");
    await page.getByTestId("button-search-schedules").click();
    await page.getByTestId("row-schedule-sg-blank").waitFor();

    assert.equal(await page.locator('[data-testid^="row-schedule-"]').count(), 2);
    assert.equal(await page.getByTestId("text-departure-sg-blank").textContent(), "—");
    assert.equal(await page.getByTestId("text-arrival-sg-blank").textContent(), "—");
    assert.equal(await page.getByTestId("text-transit-sg-blank").textContent(), "—");

    const pdf = await assertDownload(page, "button-export-pdf", "pdf");
    const pdfText = pdf.content.toString("latin1");
    assert.match(pdfText, /^%PDF-/);
    assert.match(pdfText, /Singapore/);
    assert.match(pdfText, /Fixture Unlisted/);
    assert.ok(
      (pdfText.match(/\x97/g) ?? []).length >= 5,
      "PDF should preserve the em-dash fallback for country and blank schedule details",
    );
    assert.doesNotMatch(pdfText, /Durban|Port Klang/);

    const csv = await assertDownload(page, "button-export-csv", "csv");
    const csvText = csv.content.toString("utf8");
    assert.match(csvText, /Destination,Country,Carrier/);
    assert.match(csvText, /Singapore/);
    assert.match(
      csvText,
      /"Singapore","—","MSC","Port Louis","Fixture Unlisted","004S","—","—","—","—"/,
    );
    assert.doesNotMatch(csvText, /Durban|Port Klang/);

    const xlsxExport = await assertDownload(page, "button-export-xlsx", "xlsx");
    assert.deepEqual([...xlsxExport.content.subarray(0, 2)], [0x50, 0x4b]);
    const workbook = xlsx.read(xlsxExport.content, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json<{
      Destination: string;
      Country: string;
      Carrier: string;
      Origin: string;
      Vessel: string;
      Voyage: string;
      Departure: string;
      Arrival: string;
      Transit: string;
      Service: string;
      "Booking URL": string;
    }>(sheet, { defval: "" });
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.find((row) => row.Vessel === "Fixture Unlisted"), {
      Destination: "Singapore",
      Country: "—",
      Carrier: "MSC",
      Origin: "Port Louis",
      Vessel: "Fixture Unlisted",
      Voyage: "004S",
      Departure: "—",
      Arrival: "—",
      Transit: "—",
      Service: "—",
      "Booking URL": "https://www.msc.com/en/lp/book-with-mymsc",
    });
  } finally {
    await browser?.close();
    if (frontend.pid && !frontend.killed) {
      try {
        process.kill(-frontend.pid, "SIGTERM");
      } catch {
        frontend.kill("SIGTERM");
      }
    }
  }
});