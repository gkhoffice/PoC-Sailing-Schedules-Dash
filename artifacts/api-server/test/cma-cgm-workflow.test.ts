import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { chromium } from "playwright";
import { configureCmaCgmSearch, parseCmaCgmSchedules } from "../src/lib/cma-cgm-scraper";

test("CMA CGM form chooses Port Louis, clears destination, and requests five departure weeks", async () => {
  const browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
      (existsSync("/repl/tools/bin/chromium") ? "/repl/tools/bin/chromium" : undefined),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(2500);
    const baseForm = `
      <label>Origin <input id="origin" oninput="document.querySelector('#port').hidden=false"></label>
      <button id="port" type="button" role="option" hidden
        onclick="document.querySelector('#origin').value='Port Louis, Mauritius (MUPLU)'; this.hidden=true">
        Port Louis, Mauritius (MUPLU)
      </button>
      <label>Destination <input id="destination" value="Singapore"></label>
      <label>Date <input id="date" type="date"></label>
      <label><input name="basis" type="radio" value="departure">Departure</label>
      <label><input name="basis" type="radio" value="arrival" checked>Arrival</label>
    `;
    for (const periodMarkup of [
      '<label>Period (weeks) <input id="weeks" type="number" value="2"></label>',
      `<div><span>Period (weeks)</span>
        <button type="button" aria-label="Decrease" onclick="document.querySelector('#weeks').textContent--">−</button>
        <span id="weeks">2</span>
        <button type="button" aria-label="Increase" onclick="document.querySelector('#weeks').textContent++">+</button>
      </div>`,
    ]) {
      await page.setContent(`<form>${baseForm}${periodMarkup}</form>`);
      await configureCmaCgmSearch(page);
      assert.match(await page.locator("#origin").inputValue(), /Port Louis, Mauritius/);
      assert.equal(await page.locator("#destination").inputValue(), "");
      assert.equal(await page.locator("#date").inputValue(), new Date().toISOString().slice(0, 10));
      assert.equal(await page.locator('input[value="departure"]').isChecked(), true);
      const weeks = page.locator("#weeks");
      assert.equal(
        await weeks.inputValue().catch(() => weeks.innerText()),
        "5",
      );
    }
  } finally {
    await browser.close();
  }
});

test("CMA CGM parser supports table rows and excludes location suggestions", () => {
  const schedules = parseCmaCgmSchedules(
    [{ destination: "Not a sailing" }],
    [{
      Destination: "Durban",
      Vessel: "CMA CGM Fixture",
      Voyage: "012N",
      Departure: "30/10/2026",
      Arrival: "04/11/2026",
    }],
  );
  assert.equal(schedules.length, 1);
  assert.equal(schedules[0].departureDate, "2026-10-30");
  assert.equal(schedules[0].arrivalDate, "2026-11-04");
  assert.equal(schedules[0].originCountry, "Mauritius");
});
