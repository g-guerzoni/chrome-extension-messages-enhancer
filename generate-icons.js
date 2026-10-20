const path = require("path");
const sharp = require("sharp");

const ICONS_DIR = path.join(__dirname, "icons");
const SOURCE_SVG = path.join(ICONS_DIR, "icon.svg");
const SIZES = [16, 48, 128];

async function generateIcons() {
  for (const size of SIZES) {
    const output = path.join(ICONS_DIR, `icon${size}.png`);
    // Rasterize at 4x (288 DPI) and downscale for smoother edges
    await sharp(SOURCE_SVG, { density: 288 })
      .resize(size, size)
      .png()
      .toFile(output);
    console.log(`Generated ${path.relative(__dirname, output)}`);
  }
}

generateIcons().catch((error) => {
  console.error("Failed to generate icons:", error);
  process.exit(1);
});
