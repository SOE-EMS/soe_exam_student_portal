const PDFDocument = require('pdfkit');

/**
 * Generate Block Label PDF
 * Contains: Examination, Academic Year, Block No, Classroom, Division,
 *           Exam Date, Exam Time, Subject Code, Block Count
 * Does NOT contain: Student Name, Enrollment Number, Student List
 */
function generateBlockLabelPDF(blockData, examInfo) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const institutionName = process.env.INSTITUTION_NAME || 'School of Engineering';

      blockData.forEach((block, index) => {
        if (index > 0) doc.addPage();

        // Header
        doc.fontSize(16).font('Helvetica-Bold')
          .text(institutionName, { align: 'center' });
        doc.moveDown(0.3);
        doc.fontSize(13).font('Helvetica-Bold')
          .text(examInfo.examName, { align: 'center' });
        doc.fontSize(11).font('Helvetica')
          .text(`Academic Year: ${examInfo.academicYear}`, { align: 'center' });

        doc.moveDown(1);

        // Divider
        doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke('#1e3a5f');
        doc.moveDown(0.5);

        // Block info
        const labelY = doc.y;
        doc.fontSize(24).font('Helvetica-Bold')
          .text(`Block ${block.blockNumber}`, { align: 'center' });
        doc.moveDown(0.3);
        doc.fontSize(16).font('Helvetica')
          .text(block.classroom, { align: 'center' });

        doc.moveDown(1);

        // Details table
        const details = [
          ['Division', block.division || '—'],
          ['Semester', String(block.semester || '—')],
          ['Exam Date', block.examDate || '—'],
          ['Exam Time', block.examTime || '—'],
          ['Subject Code', block.subjectCode || '—'],
          ['Subject Name', block.subjectName || '—'],
          ['Total Students', String(block.blockCount || 0)],
        ];

        const tableX = 150;
        const labelWidth = 120;
        const valueWidth = 200;

        details.forEach(([label, value]) => {
          doc.fontSize(12).font('Helvetica-Bold').text(label + ':', tableX, doc.y, { width: labelWidth });
          doc.fontSize(12).font('Helvetica').text(value, tableX + labelWidth, doc.y - 14.5, { width: valueWidth });
          doc.moveDown(0.3);
        });

        doc.moveDown(1);
        doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke('#e2e8f0');

        // Footer note
        doc.moveDown(0.5);
        doc.fontSize(9).font('Helvetica').fillColor('#666666')
          .text('This label is to be displayed outside the examination classroom.', { align: 'center' });
        doc.fillColor('#000000');
      });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = { generateBlockLabelPDF };
