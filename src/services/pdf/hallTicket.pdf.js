const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const QRCode = require('qrcode');

/**
 * Check if string contains Indic characters (Devanagari, Gujarati, Bengali, etc.)
 */
function containsIndic(str) {
  if (!str) return false;
  return /[\u0900-\u0D7F]/.test(String(str));
}

/**
 * Secret used for signing Hall Tickets
 */
function getVerificationSecret() {
  return process.env.SESSION_SECRET || 'soe-verification-secret-key-2026';
}

/**
 * Generate a cryptographically signed verification token for a Hall Ticket
 */
function generateVerificationToken(examId, enrollmentNumber, version = 1) {
  const secret = getVerificationSecret();
  const payload = `${examId}:${enrollmentNumber}:${version}`;
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex').substring(0, 24);
  const data = JSON.stringify({ e: examId, n: enrollmentNumber, v: version, s: signature });
  return Buffer.from(data).toString('base64url');
}

/**
 * Verify a Hall Ticket verification token
 */
function verifyTicketToken(token) {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    const { e, n, v, s } = JSON.parse(raw);
    if (!e || !n || !s) return { valid: false, error: 'Malformed verification token' };

    const secret = getVerificationSecret();
    const payload = `${e}:${n}:${v || 1}`;
    const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex').substring(0, 24);

    const isMatch = crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expectedSig));
    if (!isMatch) {
      return { valid: false, error: 'Tampered or forged signature' };
    }

    return { valid: true, examId: e, enrollmentNumber: n, version: v || 1 };
  } catch (err) {
    return { valid: false, error: 'Invalid verification token' };
  }
}

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
  formatted = formatted.replace(/\s*-\s*/g, ' TO ');
  formatted = formatted.replace(/(:\d{2}):\d{2}\b/g, '$1');
  formatted = formatted.replace(/(?<!:)\b(\d{1,2})\s+(AM|PM)\b/gi, '$1:00 $2');
  return formatted;
}

/**
 * Helper to draw a single student's Hall Ticket on the given doc
 */
async function drawHallTicketPage(doc, studentData, examInfo, schedules, blockInfo, photoUrl, hasIndicFont = false) {
  const pageWidth = 595.28;
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;

  const examId = examInfo.id || examInfo.examId || '';
  const token = generateVerificationToken(examId, studentData.enrollmentNumber);
  const baseUrl = process.env.PORTAL_URL || 'http://localhost:3000';
  const verifyUrl = `${baseUrl}/api/hall-ticket/verify/${token}`;

  // ==========================================
  // 1. HEADER SECTION
  // ==========================================
  const logoPath = path.join(__dirname, '../../../public/assets/ppsu-logo-naac.png');
  const maxLogoWidth = 180;
  const maxLogoHeight = 50;

  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, margin, margin, { fit: [maxLogoWidth, maxLogoHeight], align: 'left', valign: 'top' });
  } else {
    doc.fontSize(12).font('Cambria-Bold').text('PPSU NAAC A+', margin, margin, { width: maxLogoWidth });
  }

  // UNIVERSITY NAME
  doc.fontSize(16).font('Cambria')
    .text('P P Savani University', margin, margin + 15, { align: 'center', width: contentWidth });

  // SUBTITLE
  const tableTop = 115;
  doc.fontSize(10).font('Cambria-Bold');
  const subtitle = `Admit Card for SOE | Sem-${studentData.semester} | ${examInfo.name || examInfo.examName || ''} | AY-${examInfo.academicYear || ''}`;
  doc.text(subtitle, margin, tableTop - 20, { align: 'center', width: contentWidth });

  // ENROLLMENT NUMBER (Top Right above Photo)
  const photoW = 80;
  const photoH = 100;
  const tableWidth = contentWidth - photoW;
  const photoX = margin + tableWidth;

  doc.fontSize(10).font('Cambria-Bold')
    .text(studentData.enrollmentNumber, photoX, tableTop - 15, { width: photoW, align: 'center' });

  // ==========================================
  // 2. STUDENT INFO & PHOTO SECTION
  // ==========================================
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

  const isIndicName = containsIndic(studentData.name) && hasIndicFont;
  doc.font(isIndicName ? 'Nirmala' : 'Cambria').fontSize(isIndicName ? 9 : 10).text(studentData.name, margin + 103, rY + 7);

  // Row 2: Enrollment No & Program
  rY += rowHeight;
  doc.rect(margin, rY, 100, rowHeight).stroke();
  doc.rect(margin + 100, rY, 90, rowHeight).stroke();
  doc.rect(margin + 190, rY, 80, rowHeight).stroke();
  doc.rect(margin + 270, rY, tableWidth - 270, rowHeight).stroke();

  doc.font('Cambria-Bold').fontSize(10).text('Enrollment No.', margin + 3, rY + 7);
  doc.font('Cambria').text(studentData.enrollmentNumber, margin + 103, rY + 7);

  doc.font('Cambria-Bold').text('Program :', margin + 193, rY + 7);
  doc.font('Cambria').text(studentData.program, margin + 273, rY + 7);

  // Row 3: Institute
  rY += rowHeight;
  doc.rect(margin, rY, 100, rowHeight).stroke();
  doc.rect(margin + 100, rY, tableWidth - 100, rowHeight).stroke();
  doc.font('Cambria-Bold').text('Institute', margin + 3, rY + 7);
  doc.font('Cambria').text('School of Engineering', margin + 103, rY + 7);

  // Row 4: Security Serial Row
  rY += rowHeight;
  doc.rect(margin, rY, 100, rowHeight).stroke();
  doc.rect(margin + 100, rY, 90, rowHeight).stroke();
  doc.rect(margin + 190, rY, 80, rowHeight).stroke();
  doc.rect(margin + 270, rY, tableWidth - 270, rowHeight).stroke();

  doc.font('Cambria-Bold').fontSize(9).text('Ticket ID :', margin + 3, rY + 7);
  doc.font('Cambria').fontSize(9).text(`${studentData.enrollmentNumber.slice(-6)}-${token.substring(0, 4).toUpperCase()}`, margin + 103, rY + 7);

  doc.font('Cambria-Bold').fontSize(9).text('Security Code :', margin + 193, rY + 7);
  doc.font('Cambria').fontSize(8).text(token.substring(4, 16).toUpperCase(), margin + 273, rY + 7);

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
    { label: "Supervisor's\nSign", width: 85.28, align: 'center' },
  ];

  doc.font('Cambria-Bold').fontSize(9);
  let headerH = 30;

  let hX = margin;
  cols.forEach(col => {
    doc.rect(hX, currentY, col.width, headerH).stroke();
    const textH = doc.heightOfString(col.label, { width: col.width - 4, align: col.align });
    const yOffset = (headerH - textH) / 2;
    doc.text(col.label, hX + 2, currentY + yOffset, { width: col.width - 4, align: col.align });
    hX += col.width;
  });

  currentY += headerH;

  doc.font('Cambria').fontSize(9);

  schedules.forEach(schedule => {
    const rowData = [
      String(schedule.subjectCode || ''),
      String(schedule.subjectName || ''),
      String(formatDateForPDF(schedule.examDate)),
      String(formatTime(schedule.examTime)),
      'Theory',
      String(blockInfo?.classroom || ''),
      '',
    ];

    let rowH = 20;
    cols.forEach((col, i) => {
      const textH = doc.heightOfString(rowData[i], { width: col.width - 6, align: col.align });
      if (textH + 8 > rowH) rowH = textH + 8;
    });

    let cX = margin;
    cols.forEach((col, i) => {
      doc.rect(cX, currentY, col.width, rowH).stroke();
      const textH = doc.heightOfString(rowData[i], { width: col.width - 6, align: col.align });
      const yOffset = (rowH - textH) / 2;

      const isSubIndic = i === 1 && containsIndic(rowData[i]) && hasIndicFont;
      doc.font(isSubIndic ? 'Nirmala' : 'Cambria').text(rowData[i], cX + 3, currentY + yOffset, { width: col.width - 6, align: col.align });
      doc.font('Cambria');

      cX += col.width;
    });

    currentY += rowH;
  });

  // ==========================================
  // 4. INSTRUCTIONS & QR CODE VERIFICATION
  // ==========================================
  const instructTop = currentY + 12;
  doc.y = instructTop;
  doc.font('Cambria-Bold').fontSize(10).text('Instructions to Candidates', margin, doc.y, { align: 'left', underline: true });
  doc.moveDown(0.4);

  const qrBoxWidth = 85;
  const qrX = margin + contentWidth - qrBoxWidth;
  const instructWidth = contentWidth - qrBoxWidth - 15;

  // Generate QR Code Buffer
  try {
    const qrBuffer = await QRCode.toBuffer(verifyUrl, {
      width: 75,
      margin: 1,
      errorCorrectionLevel: 'M',
    });
    doc.image(qrBuffer, qrX + 5, instructTop + 10, { width: 75, height: 75 });
    doc.rect(qrX, instructTop + 8, qrBoxWidth, 98).lineWidth(0.5).stroke('#000');
    doc.font('Cambria-Bold').fontSize(7).text('VERIFY ONLINE', qrX, instructTop + 88, { width: qrBoxWidth, align: 'center' });
    doc.font('Cambria').fontSize(6).text('Scan with camera', qrX, instructTop + 96, { width: qrBoxWidth, align: 'center' });
  } catch (err) {
    console.warn('[PDF] QR generation error:', err.message);
  }

  doc.font('Cambria').fontSize(7.5);
  doc.x = margin;

  const instructions = [
    "1.   During examination time having in possession or access to:",
    "      a) Any paper, book, note or any unauthorized study material.",
    "      b) Mobile Phones or electronic gadgets other than authorized calculators.",
    "      c) Anything written on furniture, instruments, clothes or body.",
    "      d) Anything written on the question paper relevant to syllabus.",
    "2.   Giving or receiving assistance in answering question papers in or outside hall.",
    "3.   Talking to another candidate without permission of invigilating staff.",
    "4.   Swallowing or attempting to destroy notes or incriminating materials.",
    "5.   Impersonating any candidate or getting impersonated by any person.",
    "6.   Reading or possessing incriminating material in verandah, urinal, etc.",
    "7.   Violence or resistance against invigilator on examination duty.",
  ];

  instructions.forEach(inst => {
    if (inst.match(/^[2-7]\./)) {
      doc.moveDown(0.2);
    }
    doc.text(inst, { width: instructWidth, align: 'left', lineGap: 0.5 });
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

      let hasIndicFont = false;
      const nirmalaPath = path.join(fontDir, 'Nirmala.ttc');
      if (fs.existsSync(nirmalaPath)) {
        try {
          doc.registerFont('Nirmala', nirmalaPath, 'NirmalaUI');
          hasIndicFont = true;
        } catch (fontErr) {
          console.warn('[PDF] Nirmala font registration warning:', fontErr.message);
        }
      }

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      await drawHallTicketPage(doc, studentData, examInfo, schedules, blockInfo, photoUrl, hasIndicFont);

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

      let hasIndicFont = false;
      const nirmalaPath = path.join(fontDir, 'Nirmala.ttc');
      if (fs.existsSync(nirmalaPath)) {
        try {
          doc.registerFont('Nirmala', nirmalaPath, 'NirmalaUI');
          hasIndicFont = true;
        } catch (fontErr) {
          console.warn('[PDF] Nirmala font registration warning:', fontErr.message);
        }
      }

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      for (let i = 0; i < payloads.length; i++) {
        doc.addPage();
        await drawHallTicketPage(doc, payloads[i].studentData, payloads[i].examInfo, payloads[i].schedules, payloads[i].blockInfo, payloads[i].photoUrl, hasIndicFont);
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = {
  generateHallTicketPDF,
  generateBulkHallTicketPDF,
  generateVerificationToken,
  verifyTicketToken,
};
