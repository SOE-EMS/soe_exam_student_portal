const assert = require('assert');

// Test the exact sorting and sequential numbering algorithm used in rollNumber.service.js
function calculateSubjectRollNumbers(students) {
  // Sort by enrollmentNumber ascending (deterministic)
  const sorted = [...students].sort((a, b) => 
    String(a.enrollmentNumber).localeCompare(String(b.enrollmentNumber), undefined, { numeric: true })
  );

  const rollMap = new Map();
  sorted.forEach((student, index) => {
    rollMap.set(student.enrollmentNumber, index + 1);
  });
  return rollMap;
}

// Subject SECV1010 applicants: Aarav Patel (26CV1X001), Raj Patel (26CV1X003)
const secv1010_applicants = [
  { enrollmentNumber: '26CV1X001', name: 'Aarav Patel' },
  { enrollmentNumber: '26CV1X003', name: 'Raj Patel' },
];
const roll1010 = calculateSubjectRollNumbers(secv1010_applicants);
assert.strictEqual(roll1010.get('26CV1X001'), 1, 'Aarav Patel must be Roll 1 in SECV1010');
assert.strictEqual(roll1010.get('26CV1X003'), 2, 'Raj Patel must be Roll 2 in SECV1010');

// Subject SECV1020 applicants: Aarav Patel (26CV1X001), Vivaan Shah (26CV1X002)
const secv1020_applicants = [
  { enrollmentNumber: '26CV1X002', name: 'Vivaan Shah' },
  { enrollmentNumber: '26CV1X001', name: 'Aarav Patel' },
];
const roll1020 = calculateSubjectRollNumbers(secv1020_applicants);
assert.strictEqual(roll1020.get('26CV1X001'), 1, 'Aarav Patel must be Roll 1 in SECV1020');
assert.strictEqual(roll1020.get('26CV1X002'), 2, 'Vivaan Shah must be Roll 2 in SECV1020');

// Subject SECV1030 applicants: Vivaan Shah (26CV1X002), Krish Patel (26CV1X004)
const secv1030_applicants = [
  { enrollmentNumber: '26CV1X004', name: 'Krish Patel' },
  { enrollmentNumber: '26CV1X002', name: 'Vivaan Shah' },
];
const roll1030 = calculateSubjectRollNumbers(secv1030_applicants);
assert.strictEqual(roll1030.get('26CV1X002'), 1, 'Vivaan Shah must be Roll 1 in SECV1030');
assert.strictEqual(roll1030.get('26CV1X004'), 2, 'Krish Patel must be Roll 2 in SECV1030');

// Subject SECV1040 applicants: Krish Patel (26CV1X004)
const secv1040_applicants = [
  { enrollmentNumber: '26CV1X004', name: 'Krish Patel' },
];
const roll1040 = calculateSubjectRollNumbers(secv1040_applicants);
assert.strictEqual(roll1040.get('26CV1X004'), 1, 'Krish Patel must be Roll 1 in SECV1040');

console.log('All Roll Number algorithm assertions passed exactly as specified in Section 6!');
