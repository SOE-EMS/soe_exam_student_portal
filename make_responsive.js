const fs = require('fs');
const path = require('path');

const dirs = [
  path.join(__dirname, 'public/admin'),
  path.join(__dirname, 'public/student')
];

const cssLink = '\n  <!-- Responsive Overrides -->\n  <link rel="stylesheet" href="/css/mobile-responsive.css">\n  <script src="/js/mobile-nav.js"></script>\n';

let updatedCount = 0;

for (const dir of dirs) {
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file.endsWith('.html')) {
        const filePath = path.join(dir, file);
        let content = fs.readFileSync(filePath, 'utf8');
        
        // Don't inject twice
        if (!content.includes('mobile-responsive.css')) {
          content = content.replace('</head>', cssLink + '</head>');
          fs.writeFileSync(filePath, content, 'utf8');
          console.log('Updated: ' + filePath);
          updatedCount++;
        }
      }
    }
  }
}

console.log(`Total files updated: ${updatedCount}`);
