const fs = require('fs');

const file = 'src/services/pdf/blockReport.pdf.js';
let content = fs.readFileSync(file, 'utf8');

// Add font registration
const reg = `
      const fontDir = path.join(__dirname, '../../../public/assets/fonts');
      if (fs.existsSync(path.join(fontDir, 'cambria.ttc'))) doc.registerFont('Cambria', path.join(fontDir, 'cambria.ttc'), 'Cambria');
      if (fs.existsSync(path.join(fontDir, 'cambriab.ttf'))) doc.registerFont('Cambria-Bold', path.join(fontDir, 'cambriab.ttf'));
`;

content = content.replace(/const chunks = \[\];/, reg + '\n      const chunks = [];');

// Replace Helvetica with Cambria
content = content.replace(/Helvetica-Bold/g, 'Cambria-Bold');
content = content.replace(/Helvetica/g, 'Cambria');

// Fix signature overlap
// Reduce underscores for First Invigilator
content = content.replace(/'Name of First Invigilator : _{37}'/, "'Name of First Invigilator : _________________________'");
content = content.replace(/'Name of Second Invigilator : _{33}'/, "'Name of Second Invigilator : _________________________'");
content = content.replace(/'Name of Examiner : _{34}'/, "'Name of Examiner : _________________________'");
content = content.replace(/'Name of Exam Coordinator : _{34}'/, "'Name of Exam Coordinator : _________________________'");

// Shift fCol2
content = content.replace(/const fCol2 = margin \+ 300;/, 'const fCol2 = margin + 340;');
// Reset fCol2 offset for Extra AnswerSheet since we shifted fCol2
content = content.replace(/fCol2 - 30/g, 'fCol2');

fs.writeFileSync(file, content);
console.log('Patched');
