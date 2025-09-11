const XLSX = require('xlsx');
const path = require('path');

// Create Excel template
const createExcelTemplate = () => {
  const templateData = [
    { Name: 'John Doe', Number: '+1234567890' },
    { Name: 'Jane Smith', Number: '+0987654321' },
    { Name: 'Mike Johnson', Number: '+1122334455' }
  ];

  const worksheet = XLSX.utils.json_to_sheet(templateData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Contacts');

  // Write template file
  const templatePath = path.join(__dirname, '../dist/template.xlsx');
  XLSX.writeFile(workbook, templatePath);
  
  console.log('📊 Excel template created at:', templatePath);
};

// Create template on server start
createExcelTemplate();

module.exports = { createExcelTemplate };