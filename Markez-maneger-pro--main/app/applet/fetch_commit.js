const https = require('https');
https.get('https://api.github.com/repos/cardan5991-lgtm/Markez-maneger-pro-/commits', {
  headers: { 'User-Agent': 'Node.js' }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const commits = JSON.parse(data);
    if (commits && commits.length > 0) {
      console.log('Latest commit:', commits[0].commit.message);
      console.log('Date:', commits[0].commit.author.date);
    } else {
      console.log('No commits found or error', data);
    }
  });
});
