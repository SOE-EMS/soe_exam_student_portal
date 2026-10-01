const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload image to Cloudinary
 * @param {Buffer|string} file - File buffer or path
 * @param {Object} options - Upload options
 * @returns {Promise<Object>} - Cloudinary upload result
 */
async function uploadImage(file, options = {}) {
  const defaultOptions = {
    folder: 'soe-student-portal/photos',
    resource_type: 'image',
    transformation: [
      { width: 300, height: 400, crop: 'fill', gravity: 'face' },
      { quality: 'auto', fetch_format: 'auto' },
    ],
    ...options,
  };

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      defaultOptions,
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );

    if (Buffer.isBuffer(file)) {
      uploadStream.end(file);
    } else {
      cloudinary.uploader.upload(file, defaultOptions)
        .then(resolve)
        .catch(reject);
    }
  });
}

/**
 * Delete image from Cloudinary
 * @param {string} publicId - Cloudinary public ID
 * @returns {Promise<Object>}
 */
async function deleteImage(publicId) {
  return cloudinary.uploader.destroy(publicId);
}

/**
 * Get optimized URL for an image
 * @param {string} publicId - Cloudinary public ID
 * @param {Object} options - Transformation options
 * @returns {string}
 */
function getImageUrl(publicId, options = {}) {
  return cloudinary.url(publicId, {
    secure: true,
    transformation: [
      { width: options.width || 300, height: options.height || 400, crop: 'fill' },
      { quality: 'auto', fetch_format: 'auto' },
    ],
    ...options,
  });
}

module.exports = {
  cloudinary,
  uploadImage,
  deleteImage,
  getImageUrl,
};
