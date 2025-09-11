// Temporary contacts route - add this to server/index.js as a quick fix
const multer = require('multer');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Quick fix contacts upload route - ADD THIS TO server/index.js
app.post('/api/contacts/upload', auth, upload.single('excel'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    // Parse contacts from Excel data
    const contacts = data.map((row, index) => {
      // Try to find name and number columns (flexible column names)
      const name = row.Name || row.name || row.NAME || 
                   row.Contact || row.contact || 
                   `Contact ${index + 1}`;
      
      const number = row.Number || row.number || row.NUMBER || 
                     row.Phone || row.phone || row.PHONE ||
                     row.Mobile || row.mobile || row.MOBILE ||
                     row.WhatsApp || row.whatsapp;

      return {
        name: String(name).trim(),
        number: String(number).replace(/[^\d+]/g, '') // Clean number
      };
    }).filter(contact => contact.number && contact.number.length > 5);

    // Clean up uploaded file
    try {
      fs.unlinkSync(req.file.path);
    } catch (cleanupError) {
      console.log('Warning: Could not clean up uploaded file:', cleanupError.message);
    }

    res.json({
      success: true,
      contacts: contacts,
      total: contacts.length
    });

  } catch (error) {
    console.error('Error parsing Excel file:', error);
    res.status(500).json({ error: 'Error parsing Excel file' });
  }
});

console.log('📊 Contacts upload route added to server');