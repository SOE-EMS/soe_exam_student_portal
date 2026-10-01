const https = require('https');

https.get('https://www.ppsu.ac.in', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        const matches = data.match(/<img[^>]+src="([^">]+)"/g);
        if (matches) {
            matches.forEach(m => {
                if (m.toLowerCase().includes('logo') || m.toLowerCase().includes('naac')) {
                    console.log(m);
                }
            });
        }
    });
});
