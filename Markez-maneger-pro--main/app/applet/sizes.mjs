import fs from 'fs';
const files = fs.readdirSync('/app/applet/public');
for (const file of files) {
  if (file.endsWith('.png')) {
    const stats = fs.statSync(`/app/applet/public/${file}`);
    console.log(`${file}: ${stats.size} bytes`);
  }
}
