const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

/**
 * Helper to fetch image from URL
 */
function fetchImage(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (response) => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

function formatDateForPDF(date) {
  if (!date) return '—';
  const d = new Date(date);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
}

function formatTime(timeStr) {
  if (!timeStr) return '—';
  let formatted = String(timeStr).toUpperCase();
  formatted = formatted.replace(/\s*-\s*/g, ' TO '); // convert - to TO
  
  // Remove seconds part (e.g., 10:30:00 AM -> 10:30 AM)
  formatted = formatted.replace(/(:\d{2}):\d{2}\b/g, '$1');
  
  // Pad hours like "11 AM" to "11:00 AM" (if needed, but don't accidentally pad minutes)
  formatted = formatted.replace(/(?<!:)\b(\d{1,2})\s+(AM|PM)\b/gi, '$1:00 $2');

  return formatted;
}

/**
 * Helper to draw a single student's Hall Ticket on the given doc
 */
async function drawHallTicketPage(doc, studentData, examInfo, schedules, blockInfo, photoUrl) {
  const pageWidth = 595.28;
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;

  // ==========================================
  // 1. HEADER SECTION
  // ==========================================
  
  // LOGO (Top Left)
  // Only the official PPSU logo, no extra images
  const logoPath = path.join(__dirname, '../../../public/assets/ppsu-logo-naac.png');
  const maxLogoWidth = 180;
  const maxLogoHeight = 50;
  
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, margin, margin, { fit: [maxLogoWidth, maxLogoHeight], align: 'left', valign: 'top' });
  } else {
    doc.fontSize(12).font('Cambria-Bold').text('PPSU NAAC A+', margin, margin, { width: maxLogoWidth });
  }

  // UNIVERSITY NAME (Top Center)
  doc.fontSize(16).font('Cambria')
    .text('P P Savani University', margin, margin + 15, { align: 'center', width: contentWidth });
  
  // SUBTITLE (Centered above table)
  const tableTop = 115;
  doc.fontSize(10).font('Cambria-Bold');
  const subtitle = `Admit Card for SOE | Sem-${studentData.semester} | ${examInfo.name || examInfo.examName || ''} | AY-${examInfo.academicYear || ''}`;
  doc.text(subtitle, margin, tableTop - 20, { align: 'center', width: contentWidth });

  // ENROLLMENT NUMBER (Top Right above Photo)
  const photoW = 80;
  const photoH = 100; // Match the total height of the student table (4 rows * 25 = 100)
  const tableWidth = contentWidth - photoW; // 515.28 - 80 = 435.28
  const photoX = margin + tableWidth; // 40 + 435.28 = 475.28
  
  doc.fontSize(10).font('Cambria-Bold')
    .text(studentData.enrollmentNumber, photoX, tableTop - 15, { width: photoW, align: 'center' });

  // ==========================================
  // 2. STUDENT INFO & PHOTO SECTION
  // ==========================================
  
  // Draw Photo Box (Exactly ONE box, no empty signature box below it)
  if (photoUrl) {
    try {
      let imgBuffer;
      if (photoUrl.startsWith('http')) {
        imgBuffer = await fetchImage(photoUrl);
      } else {
        const localPath = path.join(__dirname, '../../../public', photoUrl);
        imgBuffer = fs.readFileSync(localPath);
      }
      doc.image(imgBuffer, photoX, tableTop, { width: photoW, height: photoH, fit: [photoW, photoH], align: 'center', valign: 'center' });
      doc.rect(photoX, tableTop, photoW, photoH).lineWidth(0.5).stroke('#000');
    } catch (e) {
      console.error('[PDF] Failed to load photo:', e.message);
      doc.rect(photoX, tableTop, photoW, photoH).lineWidth(0.5).stroke('#000');
      doc.fontSize(8).font('Cambria').text('Photo', photoX, tableTop + 45, { width: photoW, align: 'center' });
    }
  } else {
    doc.rect(photoX, tableTop, photoW, photoH).lineWidth(0.5).stroke('#000');
    doc.fontSize(8).font('Cambria').text('Photo', photoX, tableTop + 45, { width: photoW, align: 'center' });
  }
  
  // Draw Student Info Table
  doc.lineWidth(0.5).strokeColor('#000000');
  const rowHeight = 25;
  
  // Row 1: Name
  let rY = tableTop;
  doc.rect(margin, rY, 100, rowHeight).stroke();
  doc.rect(margin + 100, rY, tableWidth - 100, rowHeight).stroke();
  doc.font('Cambria-Bold').fontSize(10).text('Name', margin + 3, rY + 7);
  doc.font('Cambria').text(studentData.name, margin + 103, rY + 7);

  // Row 2: Enrollment No & Program
  rY += rowHeight;
  doc.rect(margin, rY, 100, rowHeight).stroke();
  doc.rect(margin + 100, rY, 90, rowHeight).stroke(); // Enrollment Value
  doc.rect(margin + 190, rY, 80, rowHeight).stroke(); // Program Label
  doc.rect(margin + 270, rY, tableWidth - 270, rowHeight).stroke(); // Program Value
  
  doc.font('Cambria-Bold').text('Enrollment No.', margin + 3, rY + 7);
  doc.font('Cambria').text(studentData.enrollmentNumber, margin + 103, rY + 7);
  
  doc.font('Cambria-Bold').text('Program :', margin + 193, rY + 7); 
  doc.font('Cambria').text(studentData.program, margin + 273, rY + 7);

  // Row 3: Institute
  rY += rowHeight;
  doc.rect(margin, rY, 100, rowHeight).stroke();
  doc.rect(margin + 100, rY, tableWidth - 100, rowHeight).stroke();
  doc.font('Cambria-Bold').text('Institute', margin + 3, rY + 7);
  doc.font('Cambria').text('School of Engineering', margin + 103, rY + 7);

  // Row 4: Blank Row
  rY += rowHeight;
  doc.rect(margin, rY, tableWidth, rowHeight).stroke();
  
  const tableBottom = rY + rowHeight; 

  // ==========================================
  // 3. COURSE TABLE SECTION
  // ==========================================
  let currentY = tableBottom + 15;

  const cols = [
    { label: 'Course\nCode', width: 60, align: 'center' },
    { label: 'Course Name', width: 130, align: 'left' },
    { label: 'Exam Date', width: 65, align: 'center' },
    { label: 'Exam Time', width: 85, align: 'center' },
    { label: 'Exam\nType', width: 40, align: 'center' },
    { label: 'Location', width: 50, align: 'center' },
    { label: "Supervisor's\nSign", width: 85.28, align: 'center' }
  ];

  // Draw Headers
  doc.font('Cambria-Bold').fontSize(9);
  let headerH = 30; // Fixed header height 
  
  let hX = margin;
  cols.forEach(col => {
    doc.rect(hX, currentY, col.width, headerH).stroke();
    // vertically center text
    const textH = doc.heightOfString(col.label, { width: col.width - 4, align: col.align });
    const yOffset = (headerH - textH) / 2;
    doc.text(col.label, hX + 2, currentY + yOffset, { width: col.width - 4, align: col.align });
    hX += col.width;
  });
  
  currentY += headerH;

  // Draw Data Rows
  doc.font('Cambria').fontSize(9);
  
  schedules.forEach(schedule => {
    const rowData = [
      String(schedule.subjectCode || ''),
      String(schedule.subjectName || ''),
      String(formatDateForPDF(schedule.examDate)),
      String(formatTime(schedule.examTime)),
      'Theory', 
      String(blockInfo?.classroom || ''), // Show Classroom here!
      '' 
    ];

    // 1) Calculate row height based on wrapped text
    let rowH = 20; // minimum height
    cols.forEach((col, i) => {
      const textH = doc.heightOfString(rowData[i], { width: col.width - 6, align: col.align });
      if (textH + 8 > rowH) rowH = textH + 8;
    });

    // 2) Draw cells and text
    let cX = margin;
    cols.forEach((col, i) => {
      doc.rect(cX, currentY, col.width, rowH).stroke();
      
      const textH = doc.heightOfString(rowData[i], { width: col.width - 6, align: col.align });
      const yOffset = (rowH - textH) / 2;
      
      doc.text(rowData[i], cX + 3, currentY + yOffset, { width: col.width - 6, align: col.align });
      
      cX += col.width;
    });

    currentY += rowH;
  });

  // ==========================================
  // 4. INSTRUCTIONS SECTION
  // ==========================================
  
  doc.y = currentY + 15;
  doc.font('Cambria-Bold').fontSize(10).text('Instructions to Candidates', margin, doc.y, { align: 'center', underline: true });
  doc.moveDown(0.5);

  doc.font('Cambria').fontSize(8); // smaller font to fit on one page
  doc.x = margin;
  
  // Exact instructions from the reference PDF
  // Sub-points a), b), c) correctly indented with spaces
  const instructions = [
    "1.   During examination time having in possession or access to",
    "      a) Any paper, book, note or any other material (relevant or irrelevant).",
    "      b) Mobile Phones or any electronic gadget other than scientific calculator, even in switch off mode, which can potentially be used for communication or copying.",
    "      c) Anything written on any other instrument or any kind of furniture or any other substance which may have relevance to the syllabus of the examination paper concerned.",
    "      d) Anything written or signs made on the body of the candidate or his/her clothes/garments, handkerchief etc. which may have relevance to the syllabus of the examination paper concerned.",
    "      e) Anything written on the question paper which may have relevance to the syllabus of the examination paper concerned.",
    "2.   Giving or receiving assistance in answering the question papers to or from any other candidate/person in the examination hall or outside during the examination hours.",
    "3.   Talking to another candidate or any unauthorized person inside or outside the examination room during the examination hours without the permission of the invigilating staff.",
    "4.   Swallowing or attempting to swallow or destroying or attempting to destroy a note or paper or any other material.",
    "5.   Impersonating any candidate or getting impersonated by any person for taking the examination.",
    "6.   If the candidate is found reading or possess some incriminating material relevant to the syllabus of the paper in verandah, urinal etc. during his/her examination duration.",
    "7.   If the behavior of the candidate on being caught is unsatisfactory or the candidate uses resistance/ violence against the invigilator or any person on examination duty or consistently refuses to obey the instructions."
  ];

  instructions.forEach(inst => {
    // Add extra padding before numbered items (except the first one)
    if (inst.match(/^[2-7]\./)) {
      doc.moveDown(0.3);
    }
    // Let PDFKit naturally flow the text by omitting the explicit coordinates
    doc.text(inst, { width: contentWidth, align: 'left', lineGap: 1 });
  });
}

/**
 * Generate a Single Hall Ticket PDF (returns buffer)
 */
async function generateHallTicketPDF(studentData, examInfo, schedules, blockInfo, photoUrl) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      
      const fontDir = path.join(__dirname, '../../../public/assets/fonts');
      if (fs.existsSync(path.join(fontDir, 'cambria.ttc'))) doc.registerFont('Cambria', path.join(fontDir, 'cambria.ttc'), 'Cambria');
      if (fs.existsSync(path.join(fontDir, 'cambriab.ttf'))) doc.registerFont('Cambria-Bold', path.join(fontDir, 'cambriab.ttf'));

      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      await drawHallTicketPage(doc, studentData, examInfo, schedules, blockInfo, photoUrl);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Generate Bulk Hall Ticket PDF for multiple students (returns a single buffer)
 */
async function generateBulkHallTicketPDF(payloads) {
  return new Promise(async (resolve, reject) => {
    try {
      if (!payloads || payloads.length === 0) {
        return reject(new Error('No payloads provided for bulk generation'));
      }

      const doc = new PDFDocument({ size: 'A4', margin: 40, autoFirstPage: false });

      const fontDir = path.join(__dirname, '../../../public/assets/fonts');
      if (fs.existsSync(path.join(fontDir, 'cambria.ttc'))) doc.registerFont('Cambria', path.join(fontDir, 'cambria.ttc'), 'Cambria');
      if (fs.existsSync(path.join(fontDir, 'cambriab.ttf'))) doc.registerFont('Cambria-Bold', path.join(fontDir, 'cambriab.ttf'));

      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      for (let i = 0; i < payloads.length; i++) {
        doc.addPage();
        await drawHallTicketPage(doc, payloads[i].studentData, payloads[i].examInfo, payloads[i].schedules, payloads[i].blockInfo, payloads[i].photoUrl);
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = { generateHallTicketPDF, generateBulkHallTicketPDF };
