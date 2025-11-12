// Convert SVG icons to PNG using sharp
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const iconsDir = path.join(__dirname, 'icons');
const sizes = [16, 32, 48, 128];

async function convertIcons() {
  for (const size of sizes) {
    const svgPath = path.join(iconsDir, `icon${size}.svg`);
    const pngPath = path.join(iconsDir, `icon${size}.png`);

    try {
      await sharp(svgPath)
        .resize(size, size)
        .png()
        .toFile(pngPath);

      console.log(`Converted icon${size}.svg to icon${size}.png`);
    } catch (error) {
      console.error(`Error converting icon${size}:`, error.message);
    }
  }

  console.log('\nAll icons converted successfully!');
}

convertIcons();
