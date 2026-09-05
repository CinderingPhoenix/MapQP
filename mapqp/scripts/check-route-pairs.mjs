import { readFile, writeFile } from "node:fs/promises";

const buildings = JSON.parse(await readFile(new URL("../app/data/wpi-buildings.json", import.meta.url), "utf8"));
const output = new URL("../route-screenshots/failed-routes.txt", import.meta.url);
const pairs = buildings.flatMap((origin) => buildings
  .filter((destination) => destination.name !== origin.name)
  .map((destination) => ({ origin, destination })));
const failures = [];
const concurrency = 8;

async function checkPair({ origin, destination }) {
  const originEntrance = origin.entrances[0];
  const destinationEntrance = destination.entrances[0];
  const url = `https://routing.openstreetmap.de/routed-foot/route/v1/driving/${originEntrance.longitude},${originEntrance.latitude};${destinationEntrance.longitude},${destinationEntrance.latitude}?overview=false&geometries=geojson`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      failures.push(`${origin.name} -> ${destination.name}: HTTP ${response.status}`);
    }
  } catch (error) {
    failures.push(`${origin.name} -> ${destination.name}: ${error.name === "AbortError" ? "request timed out" : error.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

for (let index = 0; index < pairs.length; index += concurrency) {
  await Promise.all(pairs.slice(index, index + concurrency).map(checkPair));
  process.stdout.write(`Checked ${Math.min(index + concurrency, pairs.length)}/${pairs.length}\n`);
}

failures.sort();
await writeFile(output, [
  `Pedestrian route failures: ${failures.length}/${pairs.length}`,
  "",
  ...failures,
  "",
  "No route screenshots were generated because the pedestrian routing service was unavailable during capture.",
].join("\n"));
