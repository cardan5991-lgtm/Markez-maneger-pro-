import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generate() {
  const publicDir = path.join(__dirname, '..', 'public');
  // Use the high-quality vector icon instead of the base64 encoded one
  const svgPath = path.join(publicDir, 'icon.svg');
  
  if (!fs.existsSync(svgPath)) {
    console.error('icon.svg not found!');
    return;
  }

  console.log('Generating fresh icons directly from SVG vector...');
  
  try {
    // Generate 512x512
    await sharp(svgPath)
      .resize(512, 512)
      .png()
      .toFile(path.join(publicDir, 'markez-512.png'));
    console.log('Generated markez-512.png');
    
    // Generate 192x192
    await sharp(svgPath)
      .resize(192, 192)
      .png()
      .toFile(path.join(publicDir, 'markez-192.png'));
    console.log('Generated markez-192.png');

    // Generate 64x64 favicon
    await sharp(svgPath)
      .resize(64, 64)
      .png()
      .toFile(path.join(publicDir, 'favicon.ico'));
    console.log('Generated favicon.ico');

    console.log('Icons generation complete!');
  } catch (error) {
    console.error('Error generating icons:', error);
  }
}

generate().catch(console.error);
