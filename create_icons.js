// Simple icon creator using Node.js
const fs = require('fs');
const path = require('path');

// Create a simple PNG manually (basic 1x1 colored square, then scaled)
// For MVP, we'll create simple solid color PNGs

// PNG file signature and basic structure
function createSimplePNG(size, r, g, b) {
  // For simplicity, create a basic PNG with a solid color
  // This is a minimal PNG file structure
  const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const width = size;
  const height = size;
  const ihdr = Buffer.concat([
    Buffer.from([0, 0, 0, 13]), // Chunk length
    Buffer.from('IHDR'),
    Buffer.from([
      (width >> 24) & 0xff, (width >> 16) & 0xff, (width >> 8) & 0xff, width & 0xff,
      (height >> 24) & 0xff, (height >> 16) & 0xff, (height >> 8) & 0xff, height & 0xff,
      8, // Bit depth
      2, // Color type (RGB)
      0, 0, 0 // Compression, filter, interlace
    ]),
  ]);

  // Calculate CRC for IHDR
  const crc32 = require('zlib').crc32;
  const ihdrCrc = Buffer.alloc(4);
  const ihdrData = Buffer.concat([Buffer.from('IHDR'), ihdr.slice(8, -4)]);
  ihdrCrc.writeUInt32BE(crc32(ihdrData), 0);

  // Create image data
  const imageData = [];
  for (let y = 0; y < height; y++) {
    imageData.push(0); // Filter type
    for (let x = 0; x < width; x++) {
      // Draw a simple eye shape
      const centerX = width / 2;
      const centerY = height / 2;
      const dx = x - centerX;
      const dy = y - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Circle background
      if (distance < width / 2 - width / 8) {
        imageData.push(r, g, b); // Main color
      } else {
        imageData.push(0, 0, 0, 0); // Transparent
      }
    }
  }

  const zlib = require('zlib');
  const compressed = zlib.deflateSync(Buffer.from(imageData));

  const idat = Buffer.concat([
    Buffer.from([
      (compressed.length >> 24) & 0xff,
      (compressed.length >> 16) & 0xff,
      (compressed.length >> 8) & 0xff,
      compressed.length & 0xff
    ]),
    Buffer.from('IDAT'),
    compressed
  ]);

  const idatCrc = Buffer.alloc(4);
  const idatData = Buffer.concat([Buffer.from('IDAT'), compressed]);
  idatCrc.writeUInt32BE(crc32(idatData), 0);

  const iend = Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);

  return Buffer.concat([PNG_SIGNATURE, ihdr, ihdrCrc, idat, idatCrc, iend]);
}

// Simpler approach - use SVG and let browser convert it
// Create SVG icons instead
function createSVGIcon(size) {
  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <circle cx="${size/2}" cy="${size/2}" r="${size/2 - size/8}" fill="#667eea"/>
  <ellipse cx="${size/2}" cy="${size/2}" rx="${size/3}" ry="${size/6}" fill="white"/>
  <circle cx="${size/2}" cy="${size/2}" r="${size/8}" fill="#667eea"/>
</svg>`;
  return svg;
}

// Create icons directory
const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir);
}

// Create SVG icons
const sizes = [16, 32, 48, 128];
sizes.forEach(size => {
  const svg = createSVGIcon(size);
  const filename = path.join(iconsDir, `icon${size}.svg`);
  fs.writeFileSync(filename, svg);
  console.log(`Created ${filename}`);
});

console.log('\nSVG icons created! To convert to PNG, open create_icons.html in a browser and download the PNG files, or use an online SVG to PNG converter.');
console.log('Alternatively, if you have ImageMagick or another tool installed, you can convert them.');

// For now, also copy one of the SVGs as PNG (browsers will render SVG)
// This is a workaround for the MVP
sizes.forEach(size => {
  const svg = createSVGIcon(size);
  const base64 = Buffer.from(svg).toString('base64');
  console.log(`\nFor icon${size}.png, use this data URL:`);
  console.log(`data:image/svg+xml;base64,${base64}`);
});
