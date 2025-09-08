/**
 * Safely convert a timestamp to a valid Date object
 * @param {number|string|Date} timestamp - The timestamp to convert
 * @param {Date} fallback - Fallback date if conversion fails
 * @returns {Date} A valid Date object
 */
export const safeDate = (timestamp, fallback = new Date()) => {
  if (!timestamp) return fallback;
  
  let date;
  
  // Handle different timestamp formats
  if (typeof timestamp === 'number') {
    // WhatsApp timestamps are usually in seconds, convert to milliseconds
    date = timestamp > 9999999999 ? new Date(timestamp) : new Date(timestamp * 1000);
  } else if (typeof timestamp === 'string') {
    date = new Date(timestamp);
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else {
    return fallback;
  }
  
  // Validate the date
  if (isNaN(date.getTime())) {
    console.warn(`Invalid date encountered: ${timestamp}, using fallback`);
    return fallback;
  }
  
  return date;
};

/**
 * Format a date for display
 * @param {Date} date - The date to format
 * @returns {string} Formatted date string
 */
export const formatDate = (date) => {
  if (!date || isNaN(date.getTime())) return 'Unknown';
  
  const now = new Date();
  const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
  
  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffHours < 168) return `${Math.floor(diffHours / 24)}d ago`;
  
  return date.toLocaleDateString();
};

/**
 * Validate if a value is a valid date
 * @param {any} value - Value to validate
 * @returns {boolean} True if valid date
 */
export const isValidDate = (value) => {
  return value instanceof Date && !isNaN(value.getTime());
};
