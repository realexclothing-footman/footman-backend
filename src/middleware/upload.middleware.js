const multer = require('multer');
const path = require('path');
const fs = require('fs');
const CloudinaryService = require('../services/cloudinary.service');

// For local development/testing - still create directories
const createDirectories = () => {
  if (process.env.NODE_ENV !== 'production') {
    const dirs = [
      './uploads/users/profiles',
      './uploads/users/nid'
    ];
    
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Created directory: ${dir}`);
      }
    });
  }
};

createDirectories();

// Configure storage - use memory storage for Cloudinary
const storage = multer.memoryStorage();

// File filter
const fileFilter = (req, file, cb) => {
  console.log('=== FILE UPLOAD ===');
  console.log('Fieldname:', file.fieldname);
  console.log('Originalname:', file.originalname);
  console.log('Mimetype:', file.mimetype);
  console.log('Size:', file.size, 'bytes');
  
  // Allowed file types
  const allowedMimeTypes = [
    'image/jpeg', 
    'image/jpg', 
    'image/png', 
    'image/gif', 
    'image/webp',
    'image/heic',
    'image/heif',
    'application/octet-stream'
  ];
  
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif'];
  const fileExtension = path.extname(file.originalname).toLowerCase();
  
  if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
    console.log('File accepted');
    cb(null, true);
  } else {
    console.log('File rejected. Type:', file.mimetype, 'Extension:', fileExtension);
    cb(new Error('Invalid file type. Only image files are allowed.'), false);
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 3
  }
});

// Middleware for registration
const uploadRegistration = upload.fields([
  { name: 'profile_image', maxCount: 1 },
  { name: 'nid_front_image', maxCount: 1 },
  { name: 'nid_back_image', maxCount: 1 }
]);

// Middleware for profile image
const uploadProfileImage = upload.single('profile_image');

// Middleware for NID images
const uploadNidImages = upload.fields([
  { name: 'nid_front_image', maxCount: 1 },
  { name: 'nid_back_image', maxCount: 1 }
]);

/**
 * Upload file to Cloudinary
 * @param {Object} file - Multer file object
 * @param {string} type - 'profile' or 'nid'
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Upload result
 */
const uploadToCloudinary = async (file, type = 'profile', userId = 'unknown') => {
  try {
    if (!file) {
      throw new Error('No file provided');
    }

    const folder = type === 'nid' ? 'footman/nid' : 'footman/profiles';
    const result = await CloudinaryService.uploadMulterFile(file, folder, userId);
    
    console.log(`✅ Uploaded to Cloudinary: ${result.url}`);
    return {
      success: true,
      url: result.url,
      public_id: result.public_id,
      filename: file.originalname
    };
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw error;
  }
};

/**
 * Get file URL (now returns Cloudinary URL)
 * @param {Object} uploadResult - Upload result from uploadToCloudinary
 * @param {string} type - 'profile' or 'nid'
 * @returns {string} File URL
 */
const getFileUrl = (uploadResult, type = 'profile') => {
  if (!uploadResult || !uploadResult.url) {
    return null;
  }
  return uploadResult.url;
};

/**
 * Delete file from Cloudinary
 * @param {string} url - Cloudinary URL
 * @returns {Promise<Object>} Deletion result
 */
const deleteFile = async (url) => {
  if (!url || !CloudinaryService.isCloudinaryUrl(url)) {
    console.log('Not a Cloudinary URL, skipping deletion:', url);
    return { success: true, message: 'Not a Cloudinary URL' };
  }

  try {
    const publicId = CloudinaryService.extractPublicIdFromUrl(url);
    if (publicId) {
      const result = await CloudinaryService.deleteImage(publicId);
      return result;
    }
    return { success: false, message: 'Could not extract public ID from URL' };
  } catch (error) {
    console.error('File deletion error:', error);
    return { success: false, message: error.message };
  }
};

module.exports = {
  uploadRegistration,
  uploadProfileImage,
  uploadNidImages,
  uploadToCloudinary,
  getFileUrl,
  deleteFile,
  createDirectories
};
