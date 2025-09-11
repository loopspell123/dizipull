// This file ensures the uploads directory exists
const fs = require('fs');
const path = require('path');

const uploadsDir = path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('📁 Created uploads directory');
} else {
  console.log('📁 Uploads directory already exists');
}

module.exports = { uploadsDir };