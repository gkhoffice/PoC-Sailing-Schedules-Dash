import { chromium, type Locator, type Page } from "playwright";
import type { NormalizedSchedule } from "./schedule-store";
import { addDays, normalizeRecord } from "./msc-scraper";
import { logger } from "./logger";

const CMA_CGM_SCHEDULE_URL = "https://www.cma-cgm.com/ebusiness/schedules/routing-finder";
const CMA_CGM_BOOKING_URL = CMA_CGM_SCHEDULE_URL;
const ORIGIN_NAME = "Port Louis";
const ORIGIN_COUNTRY = "Mauritius";
const SEARCH_PERIOD_WEEKS = 5;
const SEARCH_PERIOD_DAYS = SEARCH_PERIOD_WEEKS * 7;
const CHROMIUM_EXECUTABLE_PATH =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (process.platform === "linux" && process.env.REPL_ID && "/repl/tools/bin/chromium");

function collectScheduleRecords(value: unknown, records: Record<string, unknown>[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectScheduleRecords(item, records);
    return;
  }
  if (!value || typeof value !== "object") return;

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.some((key) => /destination|vessel|voyage|departure|arrival|etd|eta/i.test(key))
  ) {
    records.push(record);
  }

  for (const nested of Object.values(record)) collectScheduleRecords(nested, records);
}

export function parseCmaCgmSchedules(
  payloads: unknown[],
  tableRecords: Record<string, unknown>[] = [],
): NormalizedSchedule[] {
  const records = [...tableRecords];
  for (const payload of payloads) collectScheduleRecords(payload, records);

  const unique = new Map<string, NormalizedSchedule>();
  records.forEach((record, index) => {
    const normalized = normalizeRecord(record, index, {
      carrier: "CMA CGM",
      bookingUrl: CMA_CGM_BOOKING_URL,
    });
    if (!normalized || normalized.destination === "Any destination") return;

    unique.set(normalized.id, {
      ...normalized,
      origin: normalized.origin || ORIGIN_NAME,
      originCountry: normalized.originCountry || ORIGIN_COUNTRY,
    });
  });
  return [...unique.values()];
}

async function findField(page: Page, label: RegExp): Promise<Locator | null> {
  const accessible = page.getByLabel(label).first();
  if (await accessible.isVisible().catch(() => false)) return accessible;

  const visibleLabel = page.getByText(label).first();
  if (await visibleLabel.isVisible().catch(() => false)) {
    const labeledContainer = visibleLabel.locator(
      'xpath=ancestor::*[.//input or .//textarea or .//*[@role="combobox"]][1]',
    );
    const nestedField = labeledContainer.locator('input, textarea, [role="combobox"]').first();
    if (await nestedField.isVisible().catch(() => false)) return nestedField;
  }

  const fields = page.locator('input, textarea, [role="combobox"]');
  const candidates: Array<{ field: Locator; score: number }> = [];
  for (let index = 0; index < (await fields.count()); index += 1) {
    const field = fields.nth(index);
    if (!(await field.isVisible().catch(() => false))) continue;

    const attributes = [
      await field.getAttribute("name"),
      await field.getAttribute("id"),
      await field.getAttribute("placeholder"),
      await field.getAttribute("aria-label"),
    ]
      .filter(Boolean)
      .join(" ");
    const labelText = await field
      .locator("xpath=ancestor::label[1]")
      .innerText()
      .catch(() => "");
    const nearbyText = await field.locator("xpath=..").innerText().catch(() => "");
    const exactLabel = label.test(`${attributes} ${labelText}`);
    const nearbyLabel = label.test(nearbyText);
    const score = exactLabel ? 2 : nearbyLabel ? 1 : 0;
    if (score) candidates.push({ field, score });
  }

  candidates.sort((left, right) => right.score - left.score);
  return candidates[0]?.field ?? null;
}

async function fillField(field: Locator, value: string): Promise<void> {
  try {
    await field.fill(value);
  } catch {
    await field.click();
    await field.press("Control+A");
    if (value) await field.type(value);
  }
}

async function acceptCookies(page: Page): Promise<void> {
  const candidates = [
    page.locator("#onetrust-accept-btn-handler"),
    page.getByRole("button", { name: /accept all|allow all|agree/i }).first(),
    page.getByText(/accept all cookies/i).last(),
  ];
  for (const candidate of candidates) {
    try {
      if (await candidate.isVisible({ timeout: 1200 })) {
        await candidate.click();
        await page.waitForTimeout(300);
        return;
      }
    } catch {
      // Cookie consent is optional.
    }
  }
}

async function chooseOrigin(page: Page): Promise<void> {
  const origin = await findField(page, /origin|from|port of loading|load port/i);
  if (!origin) throw new Error("CMA CGM origin field was not found.");

  await fillField(origin, ORIGIN_NAME);
  await page.waitForTimeout(800);

  const optionPatterns = [
    /port louis.*mauritius|mauritius.*port louis/i,
    /port louis.*MUPLU|MUPLU.*port louis/i,
  ];
  for (const pattern of optionPatterns) {
    const candidates = [
      page.getByRole("option", { name: pattern }).first(),
      page.locator('[role="option"]').filter({ hasText: pattern }).first(),
      page.getByText(pattern).last(),
    ];
    for (const candidate of candidates) {
      try {
        if (await candidate.isVisible({ timeout: 1200 })) {
          await candidate.click();
          return;
        }
      } catch {
        // Try the next accessible suggestion.
      }
    }
  }

  await origin.press("ArrowDown").catch(() => undefined);
  await origin.press("Enter").catch(() => undefined);
  const selectedValue = await origin.inputValue().catch(() => "");
  if (!/port louis/i.test(selectedValue)) {
    throw new Error("CMA CGM did not offer Port Louis, Mauritius in the origin suggestions.");
  }
}

async function setDestinationToAny(page: Page): Promise<void> {
  const destination = await findField(page, /destination|\bto\b|port of discharge|discharge port/i);
  if (!destination) return;
  await fillField(destination, "");
}

async function setSearchDate(page: Page): Promise<void> {
  const date = await findField(page, /^date$|departure date|search date/i);
  if (!date) return;

  const type = await date.getAttribute("type");
  const today = new Date().toISOString().slice(0, 10);
  try {
    await date.fill(type === "date" ? today : today);
  } catch {
    // The page may provide a date picker with a preselected current date.
  }
}

async function setPeriodToFiveWeeks(page: Page): Promise<void> {
  const period = await findField(page, /period.*weeks|weeks.*period/i);
  if (period) {
    await fillField(period, String(SEARCH_PERIOD_WEEKS));
    const value = await period.inputValue().catch(() => "");
    if (value === String(SEARCH_PERIOD_WEEKS)) return;
  }

  const spinbutton = page.getByRole("spinbutton").first();
  if (await spinbutton.isVisible().catch(() => false)) {
    await fillField(spinbutton, String(SEARCH_PERIOD_WEEKS));
    const value = await spinbutton.inputValue().catch(() => "");
    if (value === String(SEARCH_PERIOD_WEEKS)) return;
  }

  const label = page.getByText(/period\s*\(weeks\)/i).first();
  for (const parentSelector of ["xpath=..", "xpath=../..", "xpath=../../.."]) {
    const group = label.locator(parentSelector);
    try {
      if (!(await group.isVisible({ timeout: 800 }))) continue;
      const numbers = await group.locator("*").evaluateAll((elements) =>
        elements
          .filter((element) => element.children.length === 0)
          .map((element) => (element.textContent ?? "").trim())
          .filter((text) => /^\d{1,2}$/.test(text))
          .map(Number),
      );
      let current = numbers[0];
      const buttons = group.locator("button");
      const buttonDetails = await buttons.evaluateAll((elements) =>
        elements.map((element) => ({
          label: [
            element.getAttribute("aria-label"),
            element.getAttribute("title"),
            element.textContent,
          ]
            .filter(Boolean)
            .join(" "),
        })),
      );
      const decrementIndex = buttonDetails.findIndex((button) => /minus|decrease|subtract/i.test(button.label));
      const incrementIndex = buttonDetails.findIndex((button) => /plus|increase|add/i.test(button.label));
      const buttonCount = await buttons.count();
      const minus = decrementIndex >= 0 ? decrementIndex : 0;
      const plus = incrementIndex >= 0 ? incrementIndex : buttonCount - 1;

      if (buttonCount < 2 || typeof current !== "number" || minus === plus) continue;
      while (current < SEARCH_PERIOD_WEEKS) {
        await buttons.nth(plus).click();
        current += 1;
      }
      while (current > SEARCH_PERIOD_WEEKS) {
        await buttons.nth(minus).click();
        current -= 1;
      }
      return;
    } catch {
      // Try a larger field group.
    }
  }

  throw new Error("CMA CGM period field was not found or could not be set to five weeks.");
}

async function submitSearch(page: Page): Promise<void> {
  const searchButton = page.getByRole("button", { name: /^search$/i }).first();
  if (await searchButton.isVisible({ timeout: 1500 }).catch(() => false)) {
    await searchButton.click();
    return;
  }

  const fallback = page.getByText(/^search$/i).last();
  if (await fallback.isVisible({ timeout: 1500 }).catch(() => false)) {
    await fallback.click();
    return;
  }
  throw new Error("CMA CGM schedule search button was not found.");
}

async function readTableRecords(page: Page): Promise<Record<string, unknown>[]> {
  const records: Record<string, unknown>[] = [];
  const tables = page.locator("table");
  for (let tableIndex = 0; tableIndex < (await tables.count()); tableIndex += 1) {
    const table = tables.nth(tableIndex);
    const rows = table.locator("tr");
    const rowCount = await rows.count();
    if (!rowCount) continue;

    const headerInHead = table.locator("thead tr").first();
    let headerIndex = 0;
    if (!(await headerInHead.count())) {
      for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
        if (await rows.nth(rowIndex).locator("th").count()) {
          headerIndex = rowIndex;
          break;
        }
      }
    }
    const headerRow = (await headerInHead.count()) ? headerInHead : rows.nth(headerIndex);
    const headerCells = headerRow.locator("th, td");
    const headers = (await headerCells.allInnerTexts()).map((header) => header.trim());
    if (!headers.some((header) => /destination|vessel|voyage|departure|arrival/i.test(header))) continue;

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const row = rows.nth(rowIndex);
      if (rowIndex === headerIndex) continue;
      const cells = row.locator("td");
      if ((await cells.count()) !== headers.length) continue;
      const values = await cells.allInnerTexts();
      const record: Record<string, unknown> = {};
      headers.forEach((header, cellIndex) => {
        if (header) record[header] = values[cellIndex]?.trim() ?? "";
      });
      records.push(record);
    }
  }
  return records;
}

export async function scrapeCmaCgmSchedules(): Promise<NormalizedSchedule[]> {
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({ locale: "en-US" });
  const payloadPromises: Promise<unknown>[] = [];

  page.on("response", (response) => {
    const contentType = response.headers()["content-type"] ?? "";
    const url = response.url();
    if (!/json/i.test(contentType) || !url.startsWith("https://www.cma-cgm.com/")) return;
    payloadPromises.push(response.json().catch(() => null));
  });

  try {
    const response = await page.goto(CMA_CGM_SCHEDULE_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    const bodyText = await page.locator("body").innerText().catch(() => "");
    if (response?.status() === 403 || /access denied|permission to access/i.test(bodyText)) {
      throw new Error(
        "CMA CGM denied this Playwright request. Run the app from an environment where the schedule page is accessible.",
      );
    }

    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
    await acceptCookies(page);
    await chooseOrigin(page);
    await setDestinationToAny(page);
    await setSearchDate(page);
    await setPeriodToFiveWeeks(page);
    await submitSearch(page);
    await page.waitForLoadState("networkidle", { timeout: 25_000 }).catch(() => undefined);
    await page.waitForTimeout(1_500);

    const payloads = await Promise.all(payloadPromises);
    const tableRecords = await readTableRecords(page);
    const schedules = parseCmaCgmSchedules(payloads, tableRecords);
    const fromDate = new Date().toISOString().slice(0, 10);
    const throughDate = addDays(fromDate, SEARCH_PERIOD_DAYS);
    const inWindow = schedules.filter(
      (schedule) =>
        !schedule.departureDate ||
        (schedule.departureDate >= fromDate && schedule.departureDate <= throughDate),
    );

    if (!inWindow.length) {
      throw new Error(
        `CMA CGM search returned no recognizable schedules (${payloads.length} JSON responses, ${tableRecords.length} result rows).`,
      );
    }
    logger.info({ count: inWindow.length, periodWeeks: SEARCH_PERIOD_WEEKS }, "CMA CGM schedule refresh completed");
    return inWindow;
  } finally {
    await browser.close();
  }
}

export async function refreshCmaCgmSchedules(): Promise<NormalizedSchedule[]> {
  logger.info({ periodWeeks: SEARCH_PERIOD_WEEKS }, "Starting CMA CGM schedule refresh");
  const schedules = await scrapeCmaCgmSchedules();
  logger.info({ count: schedules.length }, "CMA CGM schedule refresh completed");
  return schedules;
}
