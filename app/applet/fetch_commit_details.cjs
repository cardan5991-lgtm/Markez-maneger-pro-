const https = require('https');
https.get('https://api.github.com/repos/cardan5991-lgtm/Markez-maneger-pro-/commits/11498606c7ff2ffa056eaf038b2f1276fd4f44d6', {
  headers: { 'User-Agent': 'Node.js' }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const commit = JSON.parse(data);
    const appTsx = commit.files.find(f => f.filename === 'src/App.tsx');
    if (appTsx) {
      console.log('App.tsx patch:', appTsx.patch.substring(0, 500));
      if (appTsx.patch.includes('isFabOpen')) {
        console.log('FAB IS PRESENT!');
      } else {
        console.log('FAB IS MISSING!');
      }
    } else {
      console.log('App.tsx not modified in this commit');
    }
  });
});
