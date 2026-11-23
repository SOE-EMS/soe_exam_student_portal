const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

// In Vercel serverless environment, local disk is read-only, so use OS temp directory
const CACHE_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), 'hall-tickets')
  : path.join(__dirname, '../../storage/cache/hall-tickets');

// Ensure cache directory exists safely
try {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
} catch (err) {
  console.warn('[PDF Cache] Init warning:', err.message);
}

/**
 * Generate a deterministic hash representing the student's exam state
 */
function computeCacheKey({ examId, enrollmentNumber, photoUrl, schedules = [], eligibilityStatus }) {
  const scheduleStr = schedules
    .map(s => `${s.subjectCode}_${s.examDate}_${s.examTime}`)
    .sort()
    .join('|');
  const raw = `${examId}:${enrollmentNumber}:${photoUrl || 'nophoto'}:${eligibilityStatus || 'ELIGIBLE'}:${scheduleStr}`;
  return crypto.createHash('sha256').update(raw).digest('hex').substring(0, 16);
}

/**
 * Get cached PDF buffer if available and matches cache key
 */
async function getCachedPDF(examId, enrollmentNumber, cacheKey) {
  try {
    const filename = `${examId}_${enrollmentNumber}_${cacheKey}.pdf`;
    const filePath = path.join(CACHE_DIR, filename);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath);
    }
  } catch (err) {
    console.warn('[PDF Cache] Read error:', err.message);
  }
  return null;
}

/**
 * Save generated PDF buffer to cache
 */
async function saveCachedPDF(examId, enrollmentNumber, cacheKey, buffer) {
  try {
    // Invalidate older cached versions for this student and exam
    const prefix = `${examId}_${enrollmentNumber}_`;
    const existingFiles = fs.readdirSync(CACHE_DIR);
    for (const f of existingFiles) {
      if (f.startsWith(prefix) && f.endsWith('.pdf')) {
        try { fs.unlinkSync(path.join(CACHE_DIR, f)); } catch (_) {}
      }
    }

    const filename = `${examId}_${enrollmentNumber}_${cacheKey}.pdf`;
    const filePath = path.join(CACHE_DIR, filename);
    fs.writeFileSync(filePath, buffer);
  } catch (err) {
    console.warn('[PDF Cache] Write error:', err.message);
  }
}

/**
 * Invalidate cache for a single student
 */
function invalidateStudentCache(examId, enrollmentNumber) {
  try {
    const prefix = `${examId}_${enrollmentNumber}_`;
    const files = fs.readdirSync(CACHE_DIR);
    for (const f of files) {
      if (f.startsWith(prefix)) {
        try { fs.unlinkSync(path.join(CACHE_DIR, f)); } catch (_) {}
      }
    }
  } catch (err) {
    console.warn('[PDF Cache] Invalidate student error:', err.message);
  }
}

/**
 * Invalidate all cached tickets for an entire exam (e.g. after timetable change)
 */
function invalidateExamCache(examId) {
  try {
    const prefix = `${examId}_`;
    const files = fs.readdirSync(CACHE_DIR);
    for (const f of files) {
      if (f.startsWith(prefix)) {
        try { fs.unlinkSync(path.join(CACHE_DIR, f)); } catch (_) {}
      }
    }
  } catch (err) {
    console.warn('[PDF Cache] Invalidate exam error:', err.message);
  }
}

module.exports = {
  computeCacheKey,
  getCachedPDF,
  saveCachedPDF,
  invalidateStudentCache,
  invalidateExamCache,
};
