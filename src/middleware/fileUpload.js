const multer = require('multer');
const path = require('path');

// Allowed image types
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/jpg'];
const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2MB
const MAX_EXCEL_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXCEL_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
];

/**
 * Multer storage for photo uploads (memory storage for Cloudinary)
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

module.exports = {
  photoUpload,
  excelUpload,
  handleMulterError,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_EXCEL_TYPES,
};
