const fs = require('fs');

// 192x192 solid blue PNG
const png192Base64 = "iVBORw0KGgoAAAANSUhEUgAAAMAAAADAAQMAAAB/a0V2AAAAA1BMVEUAA/81u21LAAAAHklEQVR4Ae3BMQEAAADCIPunNsReYAAAAAAAAAAw0gB8AAH2k0cAAAAASUVORK5CYII=";

// 512x512 solid blue PNG
const png512Base64 = "iVBORw0KGgoAAAANSUhEUgAAAgAAAAIAAQMAAADOtka5AAAAA1BMVEUAA/81u21LAAAAI0lEQVR4Ae3BMQEAAADCIPunNsReYAAAAAAAAAAAAAAAAABw1gB8AAH2k0cAAAAASUVORK5CYII=";

fs.writeFileSync('public/icon-192-v3.png', Buffer.from(png192Base64, 'base64'));
fs.writeFileSync('public/icon-512-v3.png', Buffer.from(png512Base64, 'base64'));

console.log("Created solid blue icons");
