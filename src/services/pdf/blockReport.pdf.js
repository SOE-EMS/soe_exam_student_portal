const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Ensure Vercel Node File Trace (@vercel/nft) bundles PDFKit standard fonts
try {
  require('pdfkit/standard-fonts/Helvetica');
  require('pdfkit/standard-fonts/HelveticaBold');
} catch (_) {}

async function generateBlockReportPDF(sections, examInfo) {
  return new Promise((resolve, reject) => {
    try {
      const margin = 30;
      const doc = new PDFDocument({ size: 'A4', margin: margin, layout: 'portrait' });
      
      let fontRegular = 'Helvetica';
      let fontBold = 'Helvetica-Bold';

      const possibleFontDirs = [
        path.join(__dirname, '../../../public/assets/fonts'),
        path.join(process.cwd(), 'public/assets/fonts'),
        path.join(__dirname, '../../public/assets/fonts'),
      ];

      for (const dir of possibleFontDirs) {
        try {
          if (fs.existsSync(path.join(dir, 'cambria.ttc')) && fontRegular === 'Helvetica') {
            doc.registerFont('Cambria', path.join(dir, 'cambria.ttc'), 'Cambria');
            fontRegular = 'Cambria';
          }
          if (fs.existsSync(path.join(dir, 'cambriab.ttf')) && fontBold === 'Helvetica-Bold') {
            doc.registerFont('Cambria-Bold', path.join(dir, 'cambriab.ttf'));
            fontBold = 'Cambria-Bold';
          }
        } catch (fontErr) {
          console.warn('[PDF] Font registration error:', fontErr.message);
        }
      }

      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = 595.28;
      const pageHeight = 841.89;
      const contentWidth = pageWidth - 2 * margin; // 535.28

      const possibleLogoPaths = [
        path.join(__dirname, '../../../public/assets/ppsu-logo-naac.png'),
        path.join(process.cwd(), 'public/assets/ppsu-logo-naac.png'),
        path.join(__dirname, '../../public/assets/ppsu-logo-naac.png'),
      ];
      const logoPath = possibleLogoPaths.find(p => fs.existsSync(p));
      const maxLogoWidth = 140; // slightly smaller so it fits well
      const maxLogoHeight = 40;

      // Draw Header Helper
      const drawHeader = (section, isContinuation = false) => {
        // Logo
        if (logoPath && fs.existsSync(logoPath)) {
          doc.image(logoPath, margin, margin, { fit: [maxLogoWidth, maxLogoHeight], align: 'left', valign: 'top' });
        } else {
          doc.fontSize(12).font(fontBold).text('PPSU NAAC A+', margin, margin, { width: maxLogoWidth });
        }

        // Title right aligned
        doc.fontSize(12).font(fontBold)
           .text('Internal Assessment Attendance Signature List', margin, margin + 15, { align: 'right', width: contentWidth });
        
        // Line separator
        doc.moveTo(margin, margin + 45).lineTo(pageWidth - margin, margin + 45).lineWidth(0.5).stroke('#000000');

        if (isContinuation) {
          return margin + 50; // Just return space below the line
        }

        // Info Section
        let y = margin + 50;
        const leftCol = margin;
        const rightCol = 300;

        doc.fontSize(10);
        
        // Row 1: ExamName + Course
        doc.font(fontBold).text('ExamName :- ', leftCol, y, { continued: true });
        doc.font(fontRegular).text(`${section.program || ''} | Sem-${section.semester || ''} | ${examInfo.examName || ''} | ${examInfo.academicYear || ''}`);
        
        doc.font(fontBold).text('Course :- ', rightCol, y, { continued: true });
        doc.font(fontRegular).text(`${section.subjectCode || ''} - ${section.subjectName || ''}`);
        
        y += 15;
        // Row 2: Subject Block + Block No.
        const subjectBlockDisplay = section.subjectBlock && section.totalBlocks
          ? `${section.subjectBlock} of ${section.totalBlocks}`
          : `${section.blockNumber || ''}`;
        doc.font(fontBold).text('Subject Block :- ', leftCol, y, { continued: true });
        doc.font(fontRegular).text(subjectBlockDisplay);
        
        doc.font(fontBold).text('Block No. :- ', rightCol, y, { continued: true });
        doc.font(fontRegular).text(`${section.blockNumber || ''}`);

        y += 15;
        // Row 3: ExamDate + Time
        doc.font(fontBold).text('ExamDate :- ', leftCol, y, { continued: true });
        
        let formattedDate = section.examDate || '';
        if (formattedDate) {
          const d = new Date(formattedDate);
          if (!isNaN(d)) {
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            formattedDate = `${day}-${month}-${d.getFullYear()}`;
          }
        }
        
        doc.font(fontRegular).text(formattedDate);
        
        doc.font(fontBold).text('Time :- ', rightCol, y, { continued: true });
        doc.font(fontRegular).text(`${section.examTime || ''}`);

        y += 15;
        // Row 4: Room No. + Program
        doc.font(fontBold).text('Room No. :- ', leftCol, y, { continued: true });
        doc.font(fontRegular).text(`${section.classroom || ''}`);
        
        doc.font(fontBold).text('Program :- ', rightCol, y, { continued: true });
        doc.font(fontRegular).text(`${section.program || ''}`);

        y += 15;
        // Row 5: Semester
        doc.font(fontBold).text('Semester :- ', leftCol, y, { continued: true });
        doc.font(fontRegular).text(`${section.semester || ''}`);

        y += 20;
        return y; // Returns the starting Y for the table
      };

      // Draw Table Header Helper
      const drawTableHeader = (startY, isImprovement = false) => {
        const colWidths = isImprovement
          ? [24, 30, 72, 119.28, 55, 65, 75, 60, 35]
          : [30, 75, 130, 60, 70, 75, 60, 35.28];
        const headers = isImprovement
          ? [
              'Sr\nNo',
              'Roll\nNo',
              'Enrollment\nNo.',
              'Student Name',
              'Division\nName',
              'Main Answer\nSheet No.',
              'Extra\nSupplementary\nCount',
              'Signature',
              'Marks'
            ]
          : [
              'Sr\nNo', 
              'Enrollment\nNo.', 
              'Student Name', 
              'Division', 
              'Main Answer\nSheet No.', 
              'Extra\nSupplementary\nCount', 
              'Signature', 
              'Marks'
            ];

        let colX = margin;
        const rowHeight = 35; 

        doc.lineWidth(0.5).strokeColor('#000000');
        
        headers.forEach((header, i) => {
          doc.rect(colX, startY, colWidths[i], rowHeight).stroke();
          doc.font(fontBold).fontSize(9)
             .text(header, colX + 2, startY + 5, { width: colWidths[i] - 4, align: 'left' });
          colX += colWidths[i];
        });

        return startY + rowHeight;
      };

      sections.forEach((section, sIdx) => {
        if (sIdx > 0) doc.addPage();
        
        const isImprovement = Boolean(section.isImprovement || examInfo?.isImprovement);
        const colWidths = isImprovement
          ? [24, 30, 72, 119.28, 55, 65, 75, 60, 35]
          : [30, 75, 130, 60, 70, 75, 60, 35.28];

        let rowY = drawHeader(section, false);
        rowY = drawTableHeader(rowY, isImprovement);

        const rowHeight = 22; 

        section.students.forEach((student, idx) => {
          if (rowY + rowHeight > pageHeight - margin - 20) {
            doc.addPage();
            rowY = drawHeader(section, true);
            rowY = drawTableHeader(rowY, isImprovement);
          }

          let colX = margin;
          const rowData = isImprovement
            ? [
                String(idx + 1),
                String(student.rollNo !== null && student.rollNo !== undefined ? student.rollNo : '—'),
                student.enrollmentNumber,
                student.studentName,
                student.division || '—',
                '',
                '',
                '',
                ''
              ]
            : [
                String(idx + 1),
                student.enrollmentNumber,
                student.studentName,
                student.division || '—',
                '',
                '',
                '',
                ''
              ];

          doc.lineWidth(0.5).strokeColor('#000000');
          doc.font(fontRegular).fontSize(9);

          rowData.forEach((cell, i) => {
            doc.rect(colX, rowY, colWidths[i], rowHeight).stroke();
            if (cell) {
              doc.text(cell, colX + 2, rowY + 5, { align: 'left', lineBreak: false });
            }
            colX += colWidths[i];
          });

          rowY += rowHeight;
        });

        // Draw Footer
        // We need about 130 points for the footer.
        if (rowY + 130 > pageHeight - margin) {
          doc.addPage();
          rowY = drawHeader(section);
          rowY += 10; // little padding
        } else {
          rowY += 20; // Margin before footer
        }

        doc.fontSize(10).font(fontRegular);
        const fCol1 = margin;
        const fCol2 = margin + 340;
        
        let y = rowY;
        
        const drawField = (label, startX, endX, lineY) => {
          doc.text(label, startX, lineY, { lineBreak: false });
          const labelWidth = doc.widthOfString(label);
          doc.moveTo(startX + labelWidth + 5, lineY + 10).lineTo(endX, lineY + 10).lineWidth(0.5).stroke('#000000');
        };

        const rightEnd = pageWidth - margin;
        const leftEnd = margin + 280;

        drawField('Name of First Invigilator :', fCol1, leftEnd, y);
        drawField('Signature :', fCol2, rightEnd, y);
        
        y += 25;
        drawField('Name of Second Invigilator :', fCol1, leftEnd, y);
        drawField('Signature :', fCol2, rightEnd, y);
        
        y += 25;
        drawField('Name of Examiner :', fCol1, leftEnd, y);
        drawField('Signature :', fCol2, rightEnd, y);
        
        y += 25;
        drawField('Name of Exam Coordinator :', fCol1, leftEnd, y);
        drawField('Signature :', fCol2, rightEnd, y);
        
        y += 25;
        doc.text('No. of Present : _______   No. of Absent : __________   No. of UFM Cases : _______   Total No. of Students : _____', fCol1, y, { lineBreak: false });
        
        y += 25;
        drawField('No. of Main AnswerSheet :', fCol1, leftEnd, y);
        drawField('No. of Extra AnswerSheet :', fCol2, rightEnd, y);

      });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = { generateBlockReportPDF };
