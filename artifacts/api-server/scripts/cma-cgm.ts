import { scrapeCmaCgmSchedules } from "../src/lib/cma-cgm-scraper";

try {
  const schedules = await scrapeCmaCgmSchedules({
    headless: !process.argv.includes("--headed"),
  });
  process.stdout.write(`${JSON.stringify(schedules, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
