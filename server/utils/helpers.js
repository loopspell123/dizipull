import fs from 'fs';
import path from 'path';

export const ensureDirectoryExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

export const generateSessionId = () => {
  return `session_${Date.now()}`;
};

export const sanitizeFilename = (filename) => {
  return filename.replace(/[^a-z0-9]/gi, '_').toLowerCase();
};

export const delay = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};