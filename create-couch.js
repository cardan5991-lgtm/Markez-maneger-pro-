import sharp from 'sharp';
import fs from 'fs';

const svgCouch = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1A1A1A"/>
      <stop offset="100%" stop-color="#0A0A0A"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#FF3366" flood-opacity="0.3"/>
    </filter>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <rect width="512" height="512" rx="112" fill="none" stroke="#333333" stroke-width="4"/>
  <g transform="translate(106, 136) scale(1.17)" filter="url(#glow)">
    <!-- Couch Outline -->
    <path fill="#FF3366" d="M228.6 47.9c-8.9-10.3-21.7-16-35.3-15.9H62.6C49 31.9 36.2 37.6 27.4 47.9 16.7 60.5 10.9 77.2 11.2 94.4v48.6c-5.8 4.6-9.6 11.6-9.6 19.6v53.5c0 13.3 10.8 24.1 24.1 24.1h2.2v16.1c0 8.9 7.2 16.1 16.1 16.1 8.9 0 16.1-7.2 16.1-16.1v-16.1h136.2v16.1c0 8.9 7.2 16.1 16.1 16.1 8.9 0 16.1-7.2 16.1-16.1v-16.1h2.2c13.3 0 24.1-10.8 24.1-24.1v-53.5c0-8-3.8-15-9.6-19.6V94.4c.3-17.2-5.5-33.9-16.2-46.5zM224 216c0 4.4-3.6 8-8 8H40c-4.4 0-8-3.6-8-8v-32c0-8.8 7.2-16 16-16h160c8.8 0 16 7.2 16 16v32zm-32-132.1v64.1H64V83.9c0-10.6 8.6-19.2 19.2-19.2h89.6c10.6 0 19.2 8.6 19.2 19.2z"/>
  </g>
</svg>`;

async function run() {
  await sharp(Buffer.from(svgCouch))
    .resize(192, 192)
    .png()
    .toFile('public/icon-192.png');
    
  await sharp(Buffer.from(svgCouch))
    .resize(512, 512)
    .png()
    .toFile('public/icon-512.png');
    
  console.log("Couch icons generated!");
}
run();
