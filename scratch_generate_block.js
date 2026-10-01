const fs = require('fs');
const path = require('path');
const { generateBlockReportPDF } = require('./src/services/pdf/blockReport.pdf');

const mockSections = [
  {
    examDate: '15-09-2026',
    examTime: '01:30 PM - 02:30 PM',
    subjectCode: 'IDCE3050',
    subjectName: 'Software Engineering',
    semester: '5',
    program: 'Computer Engineering',
    blockNumber: 1,
    classroom: 'Classroom I010',
    students: Array.from({length: 22}).map((_, i) => ({
      enrollmentNumber: `24ID01CE${String(i+2).padStart(3, '0')}`,
      studentName: 'STUDENT NAME ' + i,
      division: 'A',
      feesStatus: 'Paid'
    }))
  },
  {
    examDate: '15-09-2026',
    examTime: '01:30 PM - 02:30 PM',
    subjectCode: 'IDCE3050',
    subjectName: 'Software Engineering',
    semester: '5',
    program: 'Computer Engineering',
    blockNumber: 2,
    classroom: 'Classroom I011',
    students: Array.from({length: 10}).map((_, i) => ({
      enrollmentNumber: `24ID01CE${String(i+50).padStart(3, '0')}`,
      studentName: 'STUDENT NAME ' + i,
      division: 'A',
      feesStatus: 'Paid'
    }))
  }
];

const mockExamInfo = {
  examName: 'IDS Diploma| Sem-5 | 2nd Internal Exam - TH | Odd 2026-27',
  academicYear: 'Odd 2026-27'
};

generateBlockReportPDF(mockSections, mockExamInfo)
  .then(buffer => {
    fs.writeFileSync('scratch_block_report.pdf', buffer);
    console.log('Saved to scratch_block_report.pdf');
  })
  .catch(err => console.error(err));
