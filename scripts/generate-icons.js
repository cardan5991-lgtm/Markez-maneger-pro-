import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generate() {
  const publicDir = path.join(__dirname, '..', 'public');
  const svgPath = path.join(publicDir, 'logo-512.svg');
  
  if (!fs.existsSync(svgPath)) {
    console.error('logo-512.svg not found!');
    return;
  }

  const svgContent = fs.readFileSync(svgPath, 'utf8');
  const match = svgContent.match(/href="data:image\/png;base64,([^"]+)"/);
  
  if (match) {
    const base64Data = match[1];
    const buffer = Buffer.from(base64Data, 'base64');
    
    console.log('Generating fresh icons...');
    
    // Save 512
    await fs.promises.writeFile(path.join(publicDir, 'markez-512.png'), buffer);
    console.log('Generated markez-512.png');
    
    // Resize to 192 and save
    await sharp(buffer)
      .resize(192, 192)
      .toFile(path.join(publicDir, 'markez-192.png'));
    console.log('Generated markez-192.png');

    // Resize to 64 for favicon
    await sharp(buffer)
      .resize(64, 64)
      .toFile(path.join(publicDir, 'favicon.ico'));
    console.log('Generated favicon.ico');

    console.log('Icons generation complete!');
  } else {
    console.error('Could not extract base64 from logo-512.svg');
  }
}

generate().catch(console.error);
