const PDFDocument = require('pdfkit');
const fs = require('fs');
const doc = new PDFDocument();
doc.pipe(fs.createWriteStream('scratch_font.pdf'));
try {
  doc.registerFont('Cambria', 'public/assets/fonts/cambria.ttc', 'Cambria');
  doc.registerFont('Cambria-Bold', 'public/assets/fonts/cambriab.ttf');
  doc.font('Cambria').fontSize(12).text('This is Cambria regular.');
  doc.font('Cambria-Bold').text('This is Cambria bold.');
  console.log('Success');
} catch (e) {
  console.error(e);
}
doc.end();
