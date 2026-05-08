import fs from 'fs';
const dir = './public';
const files = fs.readdirSync(dir);
for (const file of files) {
  if (file.endsWith('.png')) {
    const stats = fs.statSync(`${dir}/${file}`);
    console.log(`${file}: ${stats.size} bytes`);
  }
}
