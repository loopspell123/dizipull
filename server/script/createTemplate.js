// scripts/createTemplate.js - Run this to create template files
import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const createTemplateFiles = () => {
  console.log('Creating WhatsApp campaign template files...');

  // Sample data for number messaging template
  const numberTemplateData = [
    { Name: 'Rahul Sharma', Number: '+919876543210' },
    { Name: 'Priya Patel', Number: '+919876543211' },
    { Name: 'Amit Kumar', Number: '+919876543212' },
    { Name: 'Sneha Singh', Number: '+919876543213' },
    { Name: 'Rajesh Gupta', Number: '+919876543214' }
  ];

  // Create workbook for number template
  const numberWb = XLSX.utils.book_new();
  const numberWs = XLSX.utils.json_to_sheet(numberTemplateData);

  // Set column widths
  numberWs['!cols'] = [
    { wch: 20 }, // Name column
    { wch: 18 }  // Number column
  ];

  // Add styling and notes
  XLSX.utils.book_append_sheet(numberWb, numberWs, 'Contacts');

  // Ensure public directory exists
  const publicDir = 'public';
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // Write template files
  XLSX.writeFile(numberWb, path.join(publicDir, 'template.xlsx'));
  XLSX.writeFile(numberWb, path.join(publicDir, 'number-template.xlsx'));

  // Create a CSV version too
  const csvData = [
    'Name,Number',
    'Rahul Sharma,+919876543210',
    'Priya Patel,+919876543211',
    'Amit Kumar,+919876543212',
    'Sneha Singh,+919876543213',
    'Rajesh Gupta,+919876543214'
  ].join('\n');

  fs.writeFileSync(path.join(publicDir, 'template.csv'), csvData);

  // Create instructions file
  const instructions = `# WhatsApp Campaign Excel Format

## Required Columns:

### For Name Column (any of these headers):
- Name
- name
- NAME
- Contact
- ContactName
- Contact Name

### For Number Column (any of these headers):
- Number
- Phone
- Mobile
- WhatsApp
- Cell
- Phone Number

## Number Format Examples:
- +919876543210 (with country code)
- 9876543210 (will auto-add +91)
- +1234567890 (international)

## Important Notes:
1. Numbers are automatically formatted for WhatsApp
2. Invalid numbers are skipped
3. Duplicates are handled automatically
4. Maximum file size: 10MB
5. Supports .xlsx, .xls, and .csv files

## Safety Features:
- 6-second delay between messages (configurable)
- Batching system (1000 contacts per batch)
- 10-minute breaks between batches
- Campaign tracking and monitoring
- Automatic retry for failed messages

## Campaign Limits:
- Recommended: Max 5000 numbers per campaign
- Daily limit: Based on WhatsApp restrictions
- Batch processing prevents bans
`;

  fs.writeFileSync(path.join(publicDir, 'EXCEL-FORMAT-GUIDE.md'), instructions);

  console.log('✅ Template files created:');
  console.log('   - public/template.xlsx');
  console.log('   - public/number-template.xlsx');
  console.log('   - public/template.csv');
  console.log('   - public/EXCEL-FORMAT-GUIDE.md');
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createTemplateFiles();
}

export default createTemplateFiles;