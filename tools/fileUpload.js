const multer = require('multer');
const path = require('path');
const fs = require('fs');

module.exports = function(uploadDir) {
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  return multer({
    storage: multer.diskStorage({
      destination: uploadDir,
      filename: (req, file, cb) => {
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(2, 8); // adds randomness
        const ext = path.extname(file.originalname); // keep original extension
        const baseName = path.basename(file.originalname, ext).replace(/\s+/g, '_'); // remove spaces
        const filename = `${baseName}_${timestamp}_${randomStr}${ext}`;
        cb(null, filename);
      }
    }),
    fileFilter: (req, file, cb) => {
      if (file.mimetype === 'application/pdf') {
        cb(null, true);
      } else {
        cb(new Error('Only PDF files are allowed'), false);
      }
    },
    limits: { fileSize: 100 * 1024 * 1024 } // 50MB max
  });
};
