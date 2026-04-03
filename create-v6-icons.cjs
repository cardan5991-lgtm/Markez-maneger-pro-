const sharp = require('sharp');
const fs = require('fs');

async function run() {
  const svg = fs.readFileSync('public/icon.svg');
  
  await sharp(svg)
    .resize(192, 192)
    .png()
    .toFile('public/icon-192-v6.png');
    
  await sharp(svg)
    .resize(512, 512)
    .png()
    .toFile('public/icon-512-v6.png');
    
  console.log("Created valid scissors icons v6");
}
run();
