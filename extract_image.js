const fs = require('fs');
const { PDFDocument } = require('pdf-lib');

async function extractImages() {
    const pdfPath = 'Admit_Card_SOE_BTech_Sem_7_2nd_Internal_Exam_TH_Odd_2026_27 (3).pdf';
    if (!fs.existsSync(pdfPath)) {
        console.log("File not found:", pdfPath);
        return;
    }
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    
    let imageCount = 0;
    
    // In pdf-lib, extracting images is a bit complex as we have to traverse the PDF objects.
    // However, if we just want to grab the logo, maybe we can search the web for the horizontal logo.
    console.log("PDF loaded. Pages:", pdfDoc.getPageCount());
}

extractImages().catch(console.error);
