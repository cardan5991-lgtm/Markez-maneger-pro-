const sharp = require('sharp');

const svg = `
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="100" fill="#FFD700"/>
  <text x="256" y="350" font-family="sans-serif" font-size="300" font-weight="bold" fill="black" text-anchor="middle">M</text>
</svg>
`;

async function run() {
  await sharp(Buffer.from(svg))
    .resize(192, 192)
    .png()
    .toFile('public/icon-192-v4.png');
    
  await sharp(Buffer.from(svg))
    .resize(512, 512)
    .png()
    .toFile('public/icon-512-v4.png');
    
  console.log("Created bright yellow M icons (v4)");
}
run();
