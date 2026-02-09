const cloudinary = require('cloudinary').v2;
const stream = require('stream');

// Configure Cloudinary with environment variables
const configureCloudinary = () => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  console.log('🔧 Configuring Cloudinary...');
  console.log('   Cloud Name:', cloudName ? 'Set' : 'Missing');
  console.log('   API Key:', apiKey ? 'Set' : 'Missing');
  console.log('   API Secret:', apiSecret ? 'Set' : 'Missing');

  if (!cloudName || !apiKey || !apiSecret) {
    console.error('❌ Cloudinary configuration missing!');
    console.error('   Please check your .env file for CLOUDINARY_* variables');
    throw new Error('Cloudinary configuration incomplete');
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret
  });

  console.log('✅ Cloudinary configured successfully');
  return cloudinary;
};

// Configure immediately
configureCloudinary();

class CloudinaryService {
  /**
   * Upload image to Cloudinary
   * @param {Buffer} fileBuffer - File buffer
   * @param {string} folder - Folder name (e.g., 'footman/profiles', 'footman/nid')
   * @param {string} publicId - Public ID for the image
   * @returns {Promise<Object>} Cloudinary upload result
   */
  static async uploadImage(fileBuffer, folder = 'footman/profiles', publicId = null) {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: folder,
          public_id: publicId,
          resource_type: 'image',
          transformation: [
            { width: 500, height: 500, crop: 'limit' }, // Resize for profiles
            { quality: 'auto:good' } // Auto optimize quality
          ]
        },
        (error, result) => {
          if (error) {
            console.error('❌ Cloudinary upload error:', error.message);
            reject(error);
          } else {
            console.log(`✅ Cloudinary upload success: ${result.secure_url}`);
            resolve(result);
          }
        }
      );

      // Create a readable stream from buffer
      const bufferStream = new stream.PassThrough();
      bufferStream.end(fileBuffer);
      bufferStream.pipe(uploadStream);
    });
  }

  /**
   * Upload image from multer file object
   * @param {Object} file - Multer file object
   * @param {string} folder - Folder name
   * @param {string} userId - User ID for public ID
   * @returns {Promise<Object>} Upload result with URL
   */
  static async uploadMulterFile(file, folder = 'footman/profiles', userId = 'unknown') {
    if (!file || !file.buffer) {
      throw new Error('No file buffer provided');
    }

    console.log(`📤 Uploading file to Cloudinary: ${file.originalname}`);
    console.log(`   Folder: ${folder}, User: ${userId}`);

    // Generate public ID: user_id_timestamp
    const timestamp = Date.now();
    const publicId = `${userId}_${timestamp}`;

    try {
      const result = await this.uploadImage(file.buffer, folder, publicId);
      
      return {
        success: true,
        url: result.secure_url,
        public_id: result.public_id,
        format: result.format,
        bytes: result.bytes,
        width: result.width,
        height: result.height,
        folder: result.folder
      };
    } catch (error) {
      console.error('❌ Cloudinary upload failed:', error.message);
      throw new Error(`Image upload failed: ${error.message}`);
    }
  }

  /**
   * Delete image from Cloudinary
   * @param {string} publicId - Public ID of the image
   * @returns {Promise<Object>} Deletion result
   */
  static async deleteImage(publicId) {
    try {
      console.log(`🗑️ Deleting image from Cloudinary: ${publicId}`);
      const result = await cloudinary.uploader.destroy(publicId);
      
      console.log(`   Deletion result: ${result.result}`);
      return {
        success: result.result === 'ok',
        message: result.result === 'ok' ? 'Image deleted successfully' : 'Failed to delete image'
      };
    } catch (error) {
      console.error('❌ Cloudinary delete error:', error.message);
      throw new Error(`Image deletion failed: ${error.message}`);
    }
  }

  /**
   * Extract public ID from Cloudinary URL
   * @param {string} url - Cloudinary URL
   * @returns {string} Public ID
   */
  static extractPublicIdFromUrl(url) {
    if (!url || !url.includes('cloudinary.com')) {
      return null;
    }
    
    // Extract public ID from URL
    const matches = url.match(/\/v\d+\/(.+)\.\w+$/);
    return matches ? matches[1] : null;
  }

  /**
   * Check if URL is a Cloudinary URL
   * @param {string} url - URL to check
   * @returns {boolean}
   */
  static isCloudinaryUrl(url) {
    return url && url.includes('cloudinary.com');
  }

  /**
   * Test Cloudinary connection
   * @returns {Promise<boolean>} Connection success
   */
  static async testConnection() {
    try {
      // Simple test by trying to ping Cloudinary
      const result = await cloudinary.api.ping();
      console.log('✅ Cloudinary connection test:', result);
      return true;
    } catch (error) {
      console.error('❌ Cloudinary connection test failed:', error.message);
      return false;
    }
  }
}

module.exports = CloudinaryService;
