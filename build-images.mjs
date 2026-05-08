import sharp from 'sharp';
import fs from 'fs';

async function generate() {
  const svg = fs.readFileSync('public/icon.svg');
  
  // Icon 192 (transparent bg not needed since the svg has rect)
  await sharp(svg)
    .resize(192, 192)
    .png()
    .toFile('public/icon-192.png');
    
  // Icon 512
  await sharp(svg)
    .resize(512, 512)
    .png()
    .toFile('public/icon-512.png');
    
  // Maskable 512 (padding around the core)
  const maskableSvg = fs.readFileSync('public/icon.svg', 'utf8').replace('transform="translate(100, 100) scale(13)"', 'transform="translate(140, 140) scale(10)"');
  await sharp(Buffer.from(maskableSvg))
    .resize(512, 512)
    .png()
    .toFile('public/icon-512-maskable.png');

  // Wide screenshot (1280x720) -> Black bg with logo in middle
  await sharp({
    create: {
      width: 1280,
      height: 720,
      channels: 4,
      background: { r: 17, g: 17, b: 17, alpha: 1 }
    }
  }).composite([{ input: await sharp(svg).resize(300, 300).png().toBuffer() }]).png().toFile('public/pwa-screenshot-wide.png');

  // Narrow screenshot (720x1280)
  await sharp({
    create: {
      width: 720,
      height: 1280,
      channels: 4,
      background: { r: 17, g: 17, b: 17, alpha: 1 }
    }
  }).composite([{ input: await sharp(svg).resize(300, 300).png().toBuffer() }]).png().toFile('public/pwa-screenshot-narrow.png');

  console.log('Images generated successfully.');
}

generate().catch(console.error);
