#!/bin/bash

echo "🔧 Installing required dependencies..."
cd server
npm install multer xlsx

echo "📊 Creating Excel template utility..."
# The template utility is already created

echo "🌐 Adding contacts route to server..."
# Add the contacts route to the server index.js file manually

echo "✅ Setup complete! Restart the server to apply changes."
echo ""
echo "📋 Manual steps needed:"
echo "1. Add this line to server/index.js after other route imports:"
echo "   app.use('/api/contacts', require('./routes/contacts'));"
echo ""
echo "2. Create uploads directory:"
echo "   mkdir server/uploads"
echo ""
echo "3. Restart server: npm run dev"