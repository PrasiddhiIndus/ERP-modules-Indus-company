import React, { useState, useEffect } from 'react';
import { formatInputValue, parseIndianNumber } from '../utils/numberFormat';

/**
 * NumberInput component with Indian number formatting (5,00,000 format)
 * Formats numbers as user types and stores numeric value
 */
const NumberInput = ({ 
  value, 
  onChange, 
  onBlur, 
  placeholder, 
  className = '', 
  step = '0.01',
  ...props 
}) => {
  const [displayValue, setDisplayValue] = useState('');

  useEffect(() => {
    // Format the value when it changes externally
    if (value !== undefined && value !== null && value !== '') {
      setDisplayValue(formatInputValue(value.toString()));
    } else {
      setDisplayValue('');
    }
  }, [value]);

  const handleChange = (e) => {
    const inputValue = e.target.value;
    const formatted = formatInputValue(inputValue);
    setDisplayValue(formatted);
    
    // Call onChange with the numeric value (without commas) for storage
    if (onChange) {
      const numericValue = parseIndianNumber(formatted);
      // Pass the numeric value (as string) to parent, or empty string if invalid
      const valueToStore = numericValue > 0 || inputValue === '' ? numericValue.toString() : '';
      onChange({
        ...e,
        target: {
          ...e.target,
          value: valueToStore,
        }
      });
    }
  };

  const handleBlur = (e) => {
    // Ensure we have a properly formatted value on blur
    const numericValue = parseIndianNumber(displayValue);
    const finalValue = numericValue > 0 ? formatInputValue(numericValue.toString()) : '';
    setDisplayValue(finalValue);
    
    if (onBlur) {
      onBlur({
        ...e,
        target: {
          ...e.target,
          value: numericValue > 0 ? numericValue.toString() : '',
        }
      });
    }
  };

  return (
    <input
      type="text"
      value={displayValue}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder}
      className={className}
      {...props}
    />
  );
};

export default NumberInput;

