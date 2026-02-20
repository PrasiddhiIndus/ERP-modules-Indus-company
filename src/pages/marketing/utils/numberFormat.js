// Utility functions for Indian number formatting (lakhs/crores system)

/**
 * Format a number to Indian locale (5,00,000 format)
 * @param {string|number} value - The number to format
 * @returns {string} - Formatted number string
 */
export const formatIndianNumber = (value) => {
  if (!value && value !== 0) return '';
  const numValue = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : value;
  if (isNaN(numValue)) return '';
  return numValue.toLocaleString('en-IN', { 
    maximumFractionDigits: 2,
    minimumFractionDigits: 0
  });
};

/**
 * Parse a formatted Indian number string back to a number
 * @param {string} value - The formatted number string (e.g., "5,00,000")
 * @returns {number} - Parsed number
 */
export const parseIndianNumber = (value) => {
  if (!value) return 0;
  const cleaned = value.toString().replace(/,/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

/**
 * Format number for input field (as user types)
 * @param {string} value - The input value
 * @returns {string} - Formatted value for display in input
 */
export const formatInputValue = (value) => {
  if (!value) return '';
  // Remove all commas first
  const cleaned = value.replace(/,/g, '').trim();
  // Allow empty string or just a decimal point
  if (cleaned === '' || cleaned === '.') return cleaned;
  // Check if it's a valid number (allow decimal numbers)
  const numValue = parseFloat(cleaned);
  if (isNaN(numValue)) {
    // If it's not a valid number, check if it ends with a decimal point (user might be typing)
    if (cleaned.endsWith('.')) {
      const beforeDecimal = cleaned.slice(0, -1);
      const beforeDecimalNum = parseFloat(beforeDecimal);
      if (!isNaN(beforeDecimalNum)) {
        return formatIndianNumber(beforeDecimalNum) + '.';
      }
    }
    // Return original if not a number and doesn't end with decimal
    return value;
  }
  // Format the number
  const formatted = formatIndianNumber(numValue);
  // If original had a trailing decimal point, preserve it
  if (cleaned.endsWith('.') && !formatted.includes('.')) {
    return formatted + '.';
  }
  return formatted;
};

