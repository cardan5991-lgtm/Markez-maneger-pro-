import sharp from 'sharp';
import fs from 'fs';

async function generate() {
  try {
    const svgBuffer = fs.readFileSync('public/logo-192.svg');
    await sharp(svgBuffer)
      .resize(192, 192)
      .png()
      .toFile('public/icon-192.png');
    
    await sharp(svgBuffer)
      .resize(512, 512)
      .png()
      .toFile('public/icon-512.png');
      
    console.log("Icons generated successfully.");
  } catch (e) {
    console.error("Error generating icons:", e);
  }
}
generate();
