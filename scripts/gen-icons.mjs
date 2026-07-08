// Regenerate the PWA / favicon artwork in public/ from one source drawing:
// the checkered-flag motif (cream + burnt orange checker on forest green),
// matching the app's retro country-club theme. Rasterizes an inline SVG to
// PNG at each required size with headless Chromium (Playwright).
//
//   node scripts/gen-icons.mjs
//
// Needs Playwright + a Chromium build. In this repo's dev container Chromium
// ships at /opt/pw-browsers/chromium; override with PW_CHROMIUM if elsewhere.
import { chromium } from "playwright";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const PUB = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const GREEN = "#1e4a2b", CREAM = "#f4eddb", ORANGE = "#de4f2c";

// The artwork in a 512 viewBox. `scale` pulls it toward center for the
// maskable safe zone; `radius` rounds the plate (favicon only).
function svg({ scale = 1, radius = 0 } = {}) {
  const cells = [];
  const cols = 4, rows = 3, x0 = 168, y0 = 150, cw = 50, ch = 52;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const fill = (r + c) % 2 === 0 ? CREAM : ORANGE;
      cells.push(`<rect x="${x0 + c * cw}" y="${y0 + r * ch}" width="${cw}" height="${ch}" fill="${fill}"/>`);
    }
  }
  const t = (512 - 512 * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect width="512" height="512" rx="${radius}" fill="${GREEN}"/>
    <g transform="translate(${t},${t}) scale(${scale})">
      <rect x="150" y="120" width="26" height="300" rx="13" fill="${CREAM}"/>
      <g>${cells.join("")}</g>
      <rect x="168" y="150" width="200" height="156" fill="none" stroke="${CREAM}" stroke-width="6"/>
    </g>
  </svg>`;
}

const b = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium",
});
async function render(markup, size, out) {
  const pg = await b.newPage({ viewport: { width: size, height: size } });
  const url = "data:image/svg+xml;base64," + Buffer.from(
    markup.replace('width="512" height="512"', `width="${size}" height="${size}"`),
  ).toString("base64");
  await pg.goto(url);
  await pg.waitForTimeout(150);
  writeFileSync(out, await pg.screenshot({ omitBackground: true }));
  await pg.close();
  console.log("wrote", out);
}

await render(svg({ scale: 1 }), 192, join(PUB, "pwa-192x192.png"));
await render(svg({ scale: 1 }), 512, join(PUB, "pwa-512x512.png"));
await render(svg({ scale: 1 }), 180, join(PUB, "apple-touch-icon.png"));
await render(svg({ scale: 0.72 }), 512, join(PUB, "pwa-maskable-512x512.png"));
writeFileSync(join(PUB, "favicon.svg"), svg({ scale: 1, radius: 96 }));
console.log("wrote", join(PUB, "favicon.svg"));

await b.close();
