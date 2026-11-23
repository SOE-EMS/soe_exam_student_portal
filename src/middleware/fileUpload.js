const multer = require('multer');
const path = require('path');

// Allowed image types
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/jpg'];
const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2MB
const MAX_STUDENT_PHOTO_SIZE = 50 * 1024; // 50 KB strict limit
const MAX_EXCEL_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXCEL_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'application/octet-stream',
  'application/x-zip-compressed',
  'application/zip',
];

/**
 * Multer storage for student profile photo uploads (strictly 50 KB max)
 */
const studentPhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_STUDENT_PHOTO_SIZE },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      return cb(new Error('Only JPG, JPEG, and PNG images are allowed.'), false);
    }
    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
      return cb(new Error('Invalid file extension. Only JPG, JPEG, and PNG are allowed.'), false);
    }
    cb(null, true);
  },
});

/**
 * Multer storage for photo uploads (general)
 */
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE },
  fileFilter: (req, file, cb) => {
    // Validate MIME type
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      return cb(new Error('Only JPEG and PNG images are allowed.'), false);
    }
    // Validate extension (do not trust filename alone)
    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
      return cb(new Error('Invalid file extension.'), false);
    }
    cb(null, true);
  },
});

/**
 * Multer storage for Excel uploads (memory storage)
 */
const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_EXCEL_SIZE },
  fileFilter: (req, file, cb) => {
    // Validate MIME type
    if (!ALLOWED_EXCEL_TYPES.includes(file.mimetype)) {
      return cb(new Error('Only Excel files (.xlsx, .xls) are allowed.'), false);
    }
    // Validate extension
    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.xlsx', '.xls'].includes(ext)) {
      return cb(new Error('Invalid file extension.'), false);
    }
    cb(null, true);
  },
});

/**
 * Error handling middleware for multer
 */
function handleMulterError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File is too large.' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
}

/**
 * Error handling specifically for student photo (50 KB limit)
 */
function handleStudentPhotoMulterError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Profile photo exceeds 50 KB limit. Maximum allowed size is 50 KB.' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
}

/**
 * Validate authentic image file signatures (magic bytes)
 * JPEG: FF D8 FF
 * PNG: 89 50 4E 47 0D 0A 1A 0A
 */
function validateImageMagicBytes(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 8) return false;
  // JPEG check
  const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
  // PNG check
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
                buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A;
  return isJpeg || isPng;
}

/**
 * Middleware to verify magic bytes of uploaded image files after multer
 */
function verifyImageMagicBytes(req, res, next) {
  if (!req.file || !req.file.buffer) return next();
  if (!validateImageMagicBytes(req.file.buffer)) {
    return res.status(400).json({
      error: 'Invalid image file signature. File is corrupted or not an authentic JPEG or PNG image.',
    });
  }
  next();
}

module.exports = {
  photoUpload,
  studentPhotoUpload,
  excelUpload,
  handleMulterError,
  handleStudentPhotoMulterError,
  validateImageMagicBytes,
  verifyImageMagicBytes,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_EXCEL_TYPES,
  MAX_STUDENT_PHOTO_SIZE,
};
