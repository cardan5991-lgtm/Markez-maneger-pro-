import https from 'node:https';

const url1 = 'https://markez-manager-pro.vercel.app/icon-192-final.png';
const url2 = 'https://markez-manager-pro.vercel.app/icon-192-v2.png';
const url3 = 'https://markez-manager-pro.vercel.app/icon-192-v9.png';
const url4 = 'https://markez-manager-pro.vercel.app/icon-512-final.png';

const check = (url) => {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      resolve(`${url}: ${res.statusCode} ${res.headers['content-type']}`);
    });
  });
};

async function run() {
  console.log(await check(url1));
  console.log(await check(url2));
  console.log(await check(url3));
  console.log(await check(url4));
}
run();
