const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

async function generateBlockReportPDF(sections, examInfo) {
  return new Promise((resolve, reject) => {
    try {
      const margin = 30;
      const doc = new PDFDocument({ size: 'A4', margin: margin, layout: 'portrait' });
      
      const fontDir = path.join(__dirname, '../../../public/assets/fonts');
      if (fs.existsSync(path.join(fontDir, 'cambria.ttc'))) doc.registerFont('Cambria', path.join(fontDir, 'cambria.ttc'), 'Cambria');
      if (fs.existsSync(path.join(fontDir, 'cambriab.ttf'))) doc.registerFont('Cambria-Bold', path.join(fontDir, 'cambriab.ttf'));

      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = 595.28;
      const pageHeight = 841.89;
      const contentWidth = pageWidth - 2 * margin; // 535.28

      const logoPath = path.join(__dirname, '../../../public/assets/ppsu-logo-naac.png');
      const maxLogoWidth = 140; // slightly smaller so it fits well
      const maxLogoHeight = 40;

      // Draw Header Helper
      const drawHeader = (section, isContinuation = false) => {
        // Logo
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, margin, margin, { fit: [maxLogoWidth, maxLogoHeight], align: 'left', valign: 'top' });
        } else {
          doc.fontSize(12).font('Cambria-Bold').text('PPSU NAAC A+', margin, margin, { width: maxLogoWidth });
        }

        // Title right aligned
        doc.fontSize(12).font('Cambria-Bold')
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
        doc.font('Cambria-Bold').text('ExamName :- ', leftCol, y, { continued: true });
        doc.font('Cambria').text(`${section.program || ''} | Sem-${section.semester || ''} | ${examInfo.examName || ''} | ${examInfo.academicYear || ''}`);
        
        doc.font('Cambria-Bold').text('Course :- ', rightCol, y, { continued: true });
        doc.font('Cambria').text(`${section.subjectCode || ''} - ${section.subjectName || ''}`);
        
        y += 15;
        // Row 2: Subject Block + Block No.
        const subjectBlockDisplay = section.subjectBlock && section.totalBlocks
          ? `${section.subjectBlock} of ${section.totalBlocks}`
          : `${section.blockNumber || ''}`;
        doc.font('Cambria-Bold').text('Subject Block :- ', leftCol, y, { continued: true });
        doc.font('Cambria').text(subjectBlockDisplay);
        
        doc.font('Cambria-Bold').text('Block No. :- ', rightCol, y, { continued: true });
        doc.font('Cambria').text(`${section.blockNumber || ''}`);

        y += 15;
        // Row 3: ExamDate + Time
        doc.font('Cambria-Bold').text('ExamDate :- ', leftCol, y, { continued: true });
        
        let formattedDate = section.examDate || '';
        if (formattedDate) {
          const d = new Date(formattedDate);
          if (!isNaN(d)) {
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            formattedDate = `${day}-${month}-${d.getFullYear()}`;
          }
        }
        
        doc.font('Cambria').text(formattedDate);
        
        doc.font('Cambria-Bold').text('Time :- ', rightCol, y, { continued: true });
        doc.font('Cambria').text(`${section.examTime || ''}`);

        y += 15;
        // Row 4: Room No. + Program
        doc.font('Cambria-Bold').text('Room No. :- ', leftCol, y, { continued: true });
        doc.font('Cambria').text(`${section.classroom || ''}`);
        
        doc.font('Cambria-Bold').text('Program :- ', rightCol, y, { continued: true });
        doc.font('Cambria').text(`${section.program || ''}`);

        y += 15;
        // Row 5: Semester
        doc.font('Cambria-Bold').text('Semester :- ', leftCol, y, { continued: true });
        doc.font('Cambria').text(`${section.semester || ''}`);

        y += 20;
        return y; // Returns the starting Y for the table
      };

      // Draw Table Header Helper
      const drawTableHeader = (startY) => {
        const colWidths = [30, 75, 130, 60, 70, 75, 60, 35.28];
        const headers = [
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
          doc.font('Cambria-Bold').fontSize(9)
             .text(header, colX + 2, startY + 5, { width: colWidths[i] - 4, align: 'left' });
          colX += colWidths[i];
        });

        return startY + rowHeight;
      };

      sections.forEach((section, sIdx) => {
        if (sIdx > 0) doc.addPage();
        
        let rowY = drawHeader(section, false);
        rowY = drawTableHeader(rowY);

        const colWidths = [30, 75, 130, 60, 70, 75, 60, 35.28];
        const rowHeight = 22; 

        section.students.forEach((student, idx) => {
          if (rowY + rowHeight > pageHeight - margin - 20) {
            doc.addPage();
            rowY = drawHeader(section, true);
          }

          let colX = margin;
          const rowData = [
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
          doc.font('Cambria').fontSize(9);

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

        doc.fontSize(10).font('Cambria');
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
