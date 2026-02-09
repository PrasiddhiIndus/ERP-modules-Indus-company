import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { X, Edit2, Trash2, Download, Upload, Plus, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { exportToExcel } from './utils/excelExport';
import * as XLSX from 'xlsx';

const ProductCatalog = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [editingCell, setEditingCell] = useState(null); // {productId, field}
  const [cellValue, setCellValue] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState({
    product_name: '',
    product_code: '',
    category: '',
    unit_of_measure: 'Nos',
    detailed_specifications: '',
    standard: '',
    hsn_code: '',
    self_life: '',
    certification: '',
    base_cost_price: '',
    standard_selling_price: '',
    custom_price: '',
    min_selling_price: '',
    max_discount_percentage: '',
    is_active: true,
  });

  useEffect(() => {
    fetchProducts();
  }, []);

  // Reset to page 1 when products or search query change
  useEffect(() => {
    setCurrentPage(1);
  }, [products.length, searchQuery]);

  // Filter products based on search query
  const filteredProducts = products.filter(product => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const productName = product.product_name?.toLowerCase() || '';
    const productCode = product.product_code?.toLowerCase() || '';
    const category = product.category?.toLowerCase() || '';
    return productName.includes(query) || 
           productCode.includes(query) || 
           category.includes(query);
  });

  // Calculate pagination
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentProducts = filteredProducts.slice(startIndex, endIndex);

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Helper function to parse additional fields from detailed_specifications
  const parseAdditionalFields = (detailedSpecs) => {
    if (!detailedSpecs) return { standard: '', hsn_code: '', self_life: '', certification: '' };
    
    const result = {
      standard: '',
      hsn_code: '',
      self_life: '',
      certification: '',
    };

    // Try to extract from "Additional Info:" section
    const additionalInfoMatch = detailedSpecs.match(/Additional Info:\s*([\s\S]*)/);
    if (additionalInfoMatch) {
      const additionalInfo = additionalInfoMatch[1];
      
      // Extract Standard - capture until next field or end
      const standardMatch = additionalInfo.match(/Standard:\s*([\s\S]*?)(?=\n(?:HSN Code|Self Life|Certification):|$)/i);
      // Extract HSN Code - capture until next field or end
      const hsnMatch = additionalInfo.match(/HSN Code:\s*([\s\S]*?)(?=\n(?:Standard|Self Life|Certification):|$)/i);
      // Extract Self Life - capture until next field or end
      const selfLifeMatch = additionalInfo.match(/Self Life:\s*([\s\S]*?)(?=\n(?:Standard|HSN Code|Certification):|$)/i);
      // Extract Certification - capture until end (it's usually the last field)
      const certMatch = additionalInfo.match(/Certification:\s*([\s\S]*?)(?=\n(?:Standard|HSN Code|Self Life):|$)/i);
      
      if (standardMatch) result.standard = standardMatch[1].trim();
      if (hsnMatch) result.hsn_code = hsnMatch[1].trim();
      if (selfLifeMatch) result.self_life = selfLifeMatch[1].trim();
      if (certMatch) result.certification = certMatch[1].trim();
    }

    return result;
  };

  // Helper function to get specification without additional info
  const getSpecificationOnly = (detailedSpecs) => {
    if (!detailedSpecs) return '';
    const parts = detailedSpecs.split('Additional Info:');
    return parts[0].trim();
  };

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('marketing_products')
        .select('*')
        .order('product_code', { ascending: true });

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }
      
      // Sort by numeric part of product_code for proper serial order
      // This ensures PROD-00010 comes after PROD-00009, not after PROD-00001
      const sortedProducts = (data || []).sort((a, b) => {
        const getNumericId = (productCode) => {
          if (!productCode) return 0;
          const numbers = String(productCode).replace(/[^0-9]/g, '');
          return parseInt(numbers.slice(-5)) || 0;
        };
        
        const idA = getNumericId(a.product_code);
        const idB = getNumericId(b.product_code);
        return idA - idB;
      });
      
      setProducts(sortedProducts);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching products:', error);
      alert('Error loading products: ' + (error.message || 'Unknown error'));
      setProducts([]);
      setLoading(false);
    }
  };


  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this product?')) return;

    try {
      const { error } = await supabase
        .from('marketing_products')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchProducts();
    } catch (error) {
      console.error('Error deleting product:', error);
      alert('Error deleting product: ' + error.message);
    }
  };

  const handleEdit = (product) => {
    setEditingProduct(product);
    const additionalFields = parseAdditionalFields(product.detailed_specifications);
    const specificationOnly = getSpecificationOnly(product.detailed_specifications);
    
    setFormData({
      product_name: product.product_name || '',
      product_code: product.product_code || '',
      category: product.category || '',
      unit_of_measure: product.unit_of_measure || 'Nos',
      detailed_specifications: specificationOnly || product.detailed_specifications || '',
      standard: product.standard || additionalFields.standard || '',
      hsn_code: product.hsn_code || additionalFields.hsn_code || '',
      self_life: product.self_life || additionalFields.self_life || '',
      certification: product.certification || additionalFields.certification || '',
      base_cost_price: product.base_cost_price || '',
      standard_selling_price: product.standard_selling_price || '',
      custom_price: product.custom_price || '',
      min_selling_price: product.min_selling_price || '',
      max_discount_percentage: product.max_discount_percentage || '',
      is_active: product.is_active !== undefined ? product.is_active : true,
    });
    setShowForm(true);
  };

  const handleCellEdit = (productId, field, currentValue) => {
    setEditingCell({ productId, field });
    setCellValue(currentValue || '');
  };

  const handleCellSave = async (productId, field) => {
    try {
      const product = products.find(p => p.id === productId);
      if (!product) return;

      const { data: { user } } = await supabase.auth.getUser();
      let updateData = {};

      if (field === 'standard' || field === 'hsn_code' || field === 'self_life' || field === 'certification') {
        // These fields are stored in detailed_specifications, need to update it
        const additionalFields = parseAdditionalFields(product.detailed_specifications);
        const specificationOnly = getSpecificationOnly(product.detailed_specifications);
        
        const updatedFields = {
          ...additionalFields,
          [field === 'hsn_code' ? 'hsn_code' : field === 'self_life' ? 'self_life' : field]: cellValue
        };

        const additionalInfo = [];
        if (updatedFields.standard) additionalInfo.push(`Standard: ${updatedFields.standard}`);
        if (updatedFields.hsn_code) additionalInfo.push(`HSN Code: ${updatedFields.hsn_code}`);
        if (updatedFields.self_life) additionalInfo.push(`Self Life: ${updatedFields.self_life}`);
        if (updatedFields.certification) additionalInfo.push(`Certification: ${updatedFields.certification}`);
        
        const fullSpecification = specificationOnly 
          ? `${specificationOnly}\n\nAdditional Info:\n${additionalInfo.join('\n')}`
          : `Additional Info:\n${additionalInfo.join('\n')}`;
        
        updateData = {
          detailed_specifications: fullSpecification,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        };
      } else if (field === 'product_name') {
        updateData = {
          product_name: cellValue,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        };
      } else if (field === 'specification') {
        const additionalFields = parseAdditionalFields(product.detailed_specifications);
        const additionalInfo = [];
        if (additionalFields.standard) additionalInfo.push(`Standard: ${additionalFields.standard}`);
        if (additionalFields.hsn_code) additionalInfo.push(`HSN Code: ${additionalFields.hsn_code}`);
        if (additionalFields.self_life) additionalInfo.push(`Self Life: ${additionalFields.self_life}`);
        if (additionalFields.certification) additionalInfo.push(`Certification: ${additionalFields.certification}`);
        
        const fullSpecification = cellValue 
          ? `${cellValue}\n\nAdditional Info:\n${additionalInfo.join('\n')}`
          : `Additional Info:\n${additionalInfo.join('\n')}`;
        
        updateData = {
          detailed_specifications: fullSpecification,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        };
      } else if (field === 'price') {
        // Remove ₹ symbol and commas, then parse
        const priceStr = String(cellValue).replace(/[₹,\s]/g, '');
        const priceValue = priceStr ? parseFloat(priceStr) : null;
        updateData = {
          standard_selling_price: priceValue,
          base_cost_price: priceValue,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        };
      } else if (field === 'custom_price') {
        // Remove ₹ symbol and commas, then parse
        const priceStr = String(cellValue).replace(/[₹,\s]/g, '');
        const priceValue = priceStr ? parseFloat(priceStr) : null;
        updateData = {
          custom_price: priceValue,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        };
      }

      const { error } = await supabase
        .from('marketing_products')
        .update(updateData)
        .eq('id', productId);

      if (error) throw error;

      setEditingCell(null);
      fetchProducts();
    } catch (error) {
      console.error('Error updating cell:', error);
      alert('Error updating: ' + error.message);
    }
  };

  const generateUniqueProductCode = async () => {
    // Get all existing product codes to find the next available one
    const { data: existingProducts } = await supabase
      .from('marketing_products')
      .select('product_code');
    
    const existingCodes = new Set(existingProducts?.map(p => p.product_code) || []);
    
    // Find the highest numeric ID
    let maxId = 0;
    existingProducts?.forEach(p => {
      const numbers = String(p.product_code || '').replace(/[^0-9]/g, '');
      if (numbers) {
        const numId = parseInt(numbers.slice(-5)) || 0;
        if (numId > maxId) maxId = numId;
      }
    });
    
    // Generate new code and check for uniqueness
    let newProductCode;
    let attempts = 0;
    do {
      maxId++;
      newProductCode = `PROD-${String(maxId).padStart(5, '0')}`;
      attempts++;
      if (attempts > 1000) {
        // Fallback: use timestamp-based code
        newProductCode = `PROD-${Date.now().toString().slice(-8)}`;
        break;
      }
    } while (existingCodes.has(newProductCode));
    
    return newProductCode;
  };

  const handleAddNewRow = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('Please login first to add a new product.');
        return;
      }
      
      const newProductCode = await generateUniqueProductCode();
      
      const { error } = await supabase
        .from('marketing_products')
        .insert([{
          product_name: 'New Product',
          product_code: newProductCode,
          unit_of_measure: 'Nos',
          is_active: true,
          created_by: user.id,
          updated_by: user.id,
        }]);

      if (error) throw error;
      fetchProducts();
    } catch (error) {
      console.error('Error adding new row:', error);
      alert('Error adding new product: ' + error.message);
    }
  };

  const handleNewProduct = () => {
    setEditingProduct(null);
    setFormData({
      product_name: '',
      product_code: '',
      category: '',
      unit_of_measure: 'Nos',
      detailed_specifications: '',
      standard: '',
      hsn_code: '',
      self_life: '',
      certification: '',
      base_cost_price: '',
      standard_selling_price: '',
      custom_price: '',
      min_selling_price: '',
      max_discount_percentage: '',
      is_active: true,
    });
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Generate unique product code if it's a new product and code is empty
      let productCode = formData.product_code;
      if (!editingProduct && !productCode) {
        productCode = await generateUniqueProductCode();
      }
      
      // Combine specification with additional fields
      let fullSpecification = formData.detailed_specifications || '';
      const additionalInfo = [];
      if (formData.standard) additionalInfo.push(`Standard: ${formData.standard}`);
      if (formData.hsn_code) additionalInfo.push(`HSN Code: ${formData.hsn_code}`);
      if (formData.self_life) additionalInfo.push(`Self Life: ${formData.self_life}`);
      if (formData.certification) additionalInfo.push(`Certification: ${formData.certification}`);
      
      if (additionalInfo.length > 0) {
        fullSpecification = formData.detailed_specifications 
          ? `${formData.detailed_specifications}\n\nAdditional Info:\n${additionalInfo.join('\n')}`
          : `Additional Info:\n${additionalInfo.join('\n')}`;
      }
      
      // Parse price
      const price = formData.standard_selling_price ? parseFloat(formData.standard_selling_price) : null;
      const customPrice = formData.custom_price ? parseFloat(formData.custom_price) : null;
      
      const submitData = {
        product_name: formData.product_name,
        product_code: productCode,
        category: formData.category || null,
        unit_of_measure: formData.unit_of_measure || 'Nos',
        detailed_specifications: fullSpecification || null,
        base_cost_price: price,
        standard_selling_price: price,
        custom_price: customPrice,
        min_selling_price: null,
        max_discount_percentage: null,
        is_active: true,
      };

      if (editingProduct) {
        const { error } = await supabase
          .from('marketing_products')
          .update({
            ...submitData,
            updated_by: user.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingProduct.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('marketing_products')
          .insert([{
            ...submitData,
            created_by: user.id,
            updated_by: user.id,
          }]);

        if (error) throw error;
      }

      setShowForm(false);
      setEditingProduct(null);
      setFormData({
        product_name: '',
        product_code: '',
        category: '',
        unit_of_measure: 'Nos',
        detailed_specifications: '',
        standard: '',
        hsn_code: '',
        self_life: '',
        certification: '',
      base_cost_price: '',
      standard_selling_price: '',
      custom_price: '',
      min_selling_price: '',
      max_discount_percentage: '',
      is_active: true,
      });
      fetchProducts();
    } catch (error) {
      console.error('Error saving product:', error);
      alert('Error saving product: ' + error.message);
    }
  };

  const handleExport = () => {
    const exportData = products.map(product => {
      const additionalFields = parseAdditionalFields(product.detailed_specifications);
      const specificationOnly = getSpecificationOnly(product.detailed_specifications);
      
      return {
        'Product Name': product.product_name || '',
        'Product Code': product.product_code || '',
        'Specification': specificationOnly || product.detailed_specifications || '',
        'Standard': product.standard || additionalFields.standard || '',
        'HSN Code': product.hsn_code || additionalFields.hsn_code || '',
        'Self Life': product.self_life || additionalFields.self_life || '',
        'Certification': product.certification || additionalFields.certification || '',
        'Price': product.standard_selling_price || product.base_cost_price || '',
        'Custom Price (₹)': product.custom_price || '',
        'Category': product.category || '',
        'Unit of Measure': product.unit_of_measure || 'Nos',
        'Base Cost Price (₹)': product.base_cost_price || '',
        'Standard Selling Price (₹)': product.standard_selling_price || '',
        'Min Selling Price (₹)': product.min_selling_price || '',
        'Max Discount (%)': product.max_discount_percentage || '',
        'Active': product.is_active ? 'Yes' : 'No',
        'Created At': product.created_at ? new Date(product.created_at).toLocaleDateString() : '',
      };
    });
    exportToExcel(exportData, 'Products_Export', 'Products');
  };

  const handleExcelImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setUploadProgress('Reading Excel file...');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('Please login first.');
        setUploading(false);
        return;
      }

      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const data = new Uint8Array(evt.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          
          // First, let's see what the raw sheet looks like
          const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
          console.log('Sheet range:', range);
          console.log('Total rows in sheet:', range.e.r + 1);
          
          // Read with header row - this ensures proper column mapping
          // Use header: 1 to use first row as headers, or try without header option
          let rows = XLSX.utils.sheet_to_json(sheet, { 
            defval: '',
            raw: false, // Convert all values to strings
            blankrows: false, // Skip blank rows
            header: 1 // Read as array first to see structure
          });

          console.log('Raw rows (first 3):', rows.slice(0, 3));
          
          // If header is in row 1, convert to object format
          if (rows.length > 0 && Array.isArray(rows[0])) {
            // First row should be headers
            const headers = rows[0].map((h, i) => {
              const header = String(h || '').trim();
              return header || `Column${i + 1}`;
            });
            console.log('Detected headers:', headers);
            
            // Convert remaining rows to objects
            rows = rows.slice(1).map(row => {
              const obj = {};
              headers.forEach((header, index) => {
                obj[header] = row[index] !== undefined ? String(row[index] || '').trim() : '';
              });
              return obj;
            });
          } else {
            // Already in object format, but let's ensure we have the right structure
            rows = XLSX.utils.sheet_to_json(sheet, { 
              defval: '',
              raw: false,
              blankrows: false
            });
          }

          console.log('Processed rows:', rows.length);
          console.log('First row sample:', rows[0]);
          console.log('All column names in first row:', rows[0] ? Object.keys(rows[0]) : 'No rows');

          if (!rows || rows.length === 0) {
            alert('No rows found in Excel file. Please check that your Excel file has data rows.');
            setUploading(false);
            return;
          }

          setUploadProgress(`Processing ${rows.length} rows...`);

          // Get existing products to avoid duplicates and generate sequential IDs
          const { data: existingProducts } = await supabase
        .from('marketing_products')
            .select('product_code')
            .order('created_at', { ascending: false });
          
          const existingCodes = new Set(existingProducts?.map(p => p.product_code) || []);
          
          // Get the highest numeric ID to continue sequence
          let maxId = 0;
          existingProducts?.forEach(p => {
            const numbers = String(p.product_code || '').replace(/[^0-9]/g, '');
            if (numbers) {
              const numId = parseInt(numbers.slice(-5)) || 0;
              if (numId > maxId) maxId = numId;
            }
          });

          // Map Excel columns to database fields
          // Support multiple column name variations
          const parsedRows = [];
          const errors = [];
          
          // Helper function to get value from row
          const getValue = (row, keys) => {
            // First try exact match
            for (const key of keys) {
              if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
                return String(row[key]).trim();
              }
            }
            
            // Then try case-insensitive match
            const rowKeys = Object.keys(row);
            for (const key of keys) {
              const lowerKey = key.toLowerCase().trim();
              for (const rowKey of rowKeys) {
                if (rowKey.toLowerCase().trim() === lowerKey) {
                  const value = String(row[rowKey] || '').trim();
                  if (value !== '') {
                    return value;
                  }
                }
              }
            }
            
            // Try partial match (contains)
            for (const key of keys) {
              const searchKey = key.toLowerCase().replace(/\s+/g, '');
              for (const rowKey of rowKeys) {
                const rowKeyClean = rowKey.toLowerCase().replace(/\s+/g, '');
                if (rowKeyClean.includes(searchKey) || searchKey.includes(rowKeyClean)) {
                  const value = String(row[rowKey] || '').trim();
                  if (value !== '') {
                    return value;
                  }
                }
              }
            }
            
            return '';
          };

          // FIRST PASS: Collect all values to detect if all rows have the same value
          const allStandards = new Set();
          const allHsnCodes = new Set();
          const allSelfLives = new Set();
          const allCertifications = new Set();

          for (let index = 0; index < rows.length; index++) {
            const row = rows[index];
            const standard = getValue(row, ['Standard', 'standard', 'STANDARD']);
            const hsnCode = getValue(row, ['HSN Code', 'HSNCode', 'hsn_code', 'HSN', 'HSN CODE']);
            const selfLife = getValue(row, ['Self Life', 'SelfLife', 'self_life', 'Shelf Life', 'ShelfLife', 'SELF LIFE']);
            const certification = getValue(row, ['Certification', 'certification', 'CERTIFICATION']);
            
            if (standard) allStandards.add(standard);
            if (hsnCode) allHsnCodes.add(hsnCode);
            if (selfLife) allSelfLives.add(selfLife);
            if (certification) allCertifications.add(certification);
          }

          // Determine common values (if only one unique value exists, use it for all rows)
          const commonStandard = allStandards.size === 1 ? Array.from(allStandards)[0] : null;
          const commonHsnCode = allHsnCodes.size === 1 ? Array.from(allHsnCodes)[0] : null;
          const commonSelfLife = allSelfLives.size === 1 ? Array.from(allSelfLives)[0] : null;
          const commonCertification = allCertifications.size === 1 ? Array.from(allCertifications)[0] : null;

          console.log('Common values detected:', {
            standard: commonStandard,
            hsnCode: commonHsnCode,
            selfLife: commonSelfLife,
            certification: commonCertification
          });

          // Track last non-empty values for carry-forward (handles merged cells in Excel)
          let lastStandard = '';
          let lastHsnCode = '';
          let lastSelfLife = '';
          let lastCertification = '';

          // SECOND PASS: Process each row
          for (let index = 0; index < rows.length; index++) {
            const row = rows[index];
            try {
              // Log first row to debug
              if (index === 0) {
                console.log('Processing first row:', row);
                console.log('Available keys in row:', Object.keys(row));
              }

              // Try to get product name with many variations
              // Also try to find any column that might contain product name
              let productName = getValue(row, [
                'Product Name', 
                'ProductName', 
                'product_name', 
                'Product', 
                'PRODUCT NAME',
                'Product  Name', // with extra space
                'Product_Name',
                'Name',
                'NAME',
                'Product  Name',
                'Product  Name ',
                'ProductName ',
                ' Product Name',
                'Product  Name'
              ]);

              // If still not found, try to find any column that starts with "product" or "name"
              if (!productName || productName.trim() === '') {
                for (const key in row) {
                  const lowerKey = key.toLowerCase().trim();
                  if ((lowerKey.includes('product') || lowerKey.includes('name')) && 
                      String(row[key]).trim() !== '') {
                    productName = String(row[key]).trim();
                    console.log(`Found product name in column "${key}":`, productName);
                    break;
                  }
                }
              }
              
              if (!productName || productName.trim() === '') {
                // Skip empty rows but log for debugging
                if (index < 5) {
                  console.log(`Row ${index + 2} skipped - no product name. Available columns:`, Object.keys(row));
                  console.log(`Row ${index + 2} data:`, row);
                }
                continue;
              }

              const specification = getValue(row, ['Specification', 'specification', 'Detailed Specifications', 'Specifications', 'SPECIFICATION']);
              let standard = getValue(row, ['Standard', 'standard', 'STANDARD']);
              let hsnCode = getValue(row, ['HSN Code', 'HSNCode', 'hsn_code', 'HSN', 'HSN CODE']);
              let selfLife = getValue(row, ['Self Life', 'SelfLife', 'self_life', 'Shelf Life', 'ShelfLife', 'SELF LIFE']);
              let certification = getValue(row, ['Certification', 'certification', 'CERTIFICATION']);
              const price = getValue(row, ['Price', 'price', 'Standard Selling Price (₹)', 'Selling Price', 'PRICE']);
              const customPrice = getValue(row, ['Custom Price', 'Custom Price (₹)', 'custom_price', 'CUSTOM PRICE']);
              
              // Apply common value if detected, otherwise carry forward from previous row
              if (!standard) {
                if (commonStandard) {
                  standard = commonStandard;
                } else if (lastStandard) {
                  standard = lastStandard;
                }
              }
              
              if (!hsnCode) {
                if (commonHsnCode) {
                  hsnCode = commonHsnCode;
                } else if (lastHsnCode) {
                  hsnCode = lastHsnCode;
                }
              }
              
              if (!selfLife) {
                if (commonSelfLife) {
                  selfLife = commonSelfLife;
                } else if (lastSelfLife) {
                  selfLife = lastSelfLife;
                }
              }
              
              if (!certification) {
                if (commonCertification) {
                  certification = commonCertification;
                } else if (lastCertification) {
                  certification = lastCertification;
                }
              }
              
              // Update last values for next iteration (for carry-forward)
              if (standard) lastStandard = standard;
              if (hsnCode) lastHsnCode = hsnCode;
              if (selfLife) lastSelfLife = selfLife;
              if (certification) lastCertification = certification;
              let productCode = getValue(row, ['Product Code', 'ProductCode', 'product_code', 'PRODUCT CODE']);
              const category = getValue(row, ['Category', 'category', 'CATEGORY']);
              const unitOfMeasure = getValue(row, ['Unit of Measure', 'UnitOfMeasure', 'unit_of_measure', 'Unit']) || 'Nos';

              // Generate unique product code if not provided or if duplicate
              if (!productCode || existingCodes.has(productCode)) {
                // Generate sequential ID starting from maxId + 1
                maxId++;
                productCode = `PROD-${String(maxId).padStart(5, '0')}`;
                
                // Ensure uniqueness
                while (existingCodes.has(productCode)) {
                  maxId++;
                  productCode = `PROD-${String(maxId).padStart(5, '0')}`;
                }
              }
              
              existingCodes.add(productCode);

              // Store specification as-is (preserve formatting)
              let fullSpecification = specification || '';
              
              // Store additional fields separately in detailed_specifications with a separator
              // This allows us to parse them back for display
              if (standard || hsnCode || selfLife || certification) {
                const additionalInfo = [];
                if (standard) additionalInfo.push(`Standard: ${standard}`);
                if (hsnCode) additionalInfo.push(`HSN Code: ${hsnCode}`);
                if (selfLife) additionalInfo.push(`Self Life: ${selfLife}`);
                if (certification) additionalInfo.push(`Certification: ${certification}`);
                
                if (additionalInfo.length > 0) {
                  fullSpecification = fullSpecification 
                    ? `${fullSpecification}\n\nAdditional Info:\n${additionalInfo.join('\n')}`
                    : `Additional Info:\n${additionalInfo.join('\n')}`;
                }
              }

              // Parse price - handle different formats
              let parsedPrice = null;
              if (price) {
                const priceStr = String(price).replace(/[₹,\s]/g, '');
                parsedPrice = parseFloat(priceStr);
                if (isNaN(parsedPrice)) parsedPrice = null;
              }

              // Parse custom price - handle different formats
              let parsedCustomPrice = null;
              if (customPrice) {
                const customPriceStr = String(customPrice).replace(/[₹,\s]/g, '');
                parsedCustomPrice = parseFloat(customPriceStr);
                if (isNaN(parsedCustomPrice)) parsedCustomPrice = null;
              }

              parsedRows.push({
                product_name: productName.trim(),
                product_code: productCode,
                category: category || null,
                unit_of_measure: unitOfMeasure,
                detailed_specifications: fullSpecification || null,
                standard_selling_price: parsedPrice,
                base_cost_price: parsedPrice,
                custom_price: parsedCustomPrice,
                is_active: true,
                created_by: user.id,
                updated_by: user.id,
              });

              console.log(`Row ${index + 2} parsed:`, {
                product_name: productName.trim(),
                specification: specification.substring(0, 50) + '...',
                standard,
                hsnCode,
                selfLife,
                certification: certification.substring(0, 50) + '...',
                price: parsedPrice
              });
            } catch (rowError) {
              errors.push(`Row ${index + 2}: ${rowError.message}`);
            }
          }

          if (parsedRows.length === 0) {
            // Show what columns were actually found
            const foundColumns = rows.length > 0 && rows[0] ? Object.keys(rows[0]) : [];
            const sampleRow = rows.length > 0 ? rows[0] : {};
            
            let errorMsg = 'No valid products found in Excel file.\n\n';
            errorMsg += `Found ${rows.length} rows in Excel file.\n\n`;
            errorMsg += `Columns detected in Excel file:\n${foundColumns.length > 0 ? foundColumns.join(', ') : 'No columns found'}\n\n`;
            
            if (foundColumns.length > 0) {
              errorMsg += 'Sample row data:\n';
              Object.keys(sampleRow).slice(0, 5).forEach(key => {
                const value = String(sampleRow[key] || '').substring(0, 50);
                errorMsg += `  ${key}: ${value}\n`;
              });
              errorMsg += '\n';
            }
            
            errorMsg += 'Please ensure:\n';
            errorMsg += '1. Your Excel file has a header row (first row with column names)\n';
            errorMsg += '2. At least one column contains "Product Name" (case-insensitive)\n';
            errorMsg += '3. At least one data row has a product name value\n\n';
            errorMsg += 'Expected column names:\n';
            errorMsg += '- Product Name (required)\n';
            errorMsg += '- Specification\n';
            errorMsg += '- Standard\n';
            errorMsg += '- HSN Code\n';
            errorMsg += '- Self Life\n';
            errorMsg += '- Certification\n';
            errorMsg += '- Price';
            
            if (errors.length > 0) {
              errorMsg += `\n\nRow errors:\n${errors.slice(0, 5).join('\n')}`;
            }
            
            alert(errorMsg);
            setUploading(false);
            return;
          }

          console.log(`Total products to import: ${parsedRows.length}`);
          setUploadProgress(`Uploading ${parsedRows.length} products...`);

          // Insert in chunks of 100 (Supabase limit)
          const chunkSize = 100;
          const chunks = [];
          for (let i = 0; i < parsedRows.length; i += chunkSize) {
            chunks.push(parsedRows.slice(i, i + chunkSize));
          }

          let successCount = 0;
          let errorCount = 0;
          const importErrors = [];

          for (let i = 0; i < chunks.length; i++) {
            setUploadProgress(`Uploading batch ${i + 1} of ${chunks.length}...`);
            const { data, error } = await supabase
              .from('marketing_products')
              .insert(chunks[i])
              .select();

            if (error) {
              console.error('Error inserting batch:', error);
              errorCount += chunks[i].length;
              importErrors.push(`Batch ${i + 1}: ${error.message}`);
            } else {
              successCount += data ? data.length : 0;
            }
          }

          setUploading(false);
          setUploadProgress('');
          
          let message = `Import completed!\n✅ ${successCount} products imported successfully.`;
          if (errorCount > 0) {
            message += `\n❌ ${errorCount} failed.`;
            if (importErrors.length > 0) {
              message += `\n\nErrors:\n${importErrors.slice(0, 5).join('\n')}`;
            }
          }
          if (errors.length > 0 && errors.length <= 10) {
            message += `\n\nRow errors:\n${errors.join('\n')}`;
          } else if (errors.length > 10) {
            message += `\n\nRow errors (showing first 10):\n${errors.slice(0, 10).join('\n')}\n... and ${errors.length - 10} more`;
          }
          
          alert(message);
          e.target.value = ''; // Reset file input
          
          // Refresh products list
          await fetchProducts();
          
          // Show success message
          if (successCount > 0) {
            console.log(`Successfully imported ${successCount} products`);
          }
    } catch (error) {
          console.error('Error processing Excel:', error);
          alert('Error processing Excel file: ' + error.message + '\n\nDetails: ' + JSON.stringify(error, null, 2));
          setUploading(false);
          setUploadProgress('');
          e.target.value = ''; // Reset file input
        }
      };

      reader.readAsArrayBuffer(file);
    } catch (error) {
      console.error('Error reading file:', error);
      alert('Error reading file: ' + error.message);
      setUploading(false);
      setUploadProgress('');
      e.target.value = ''; // Reset file input
    }
  };

  if (loading && products.length === 0) {
    return (
      <div className="w-full h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading products...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen overflow-y-auto p-2 sm:p-3 md:p-4 lg:p-6">
      <div className="bg-white shadow p-3 sm:p-4 md:p-6 rounded-lg mb-4 md:mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 md:mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Product Catalog</h1>
            {/* Search Bar */}
            <div className="mt-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search by product name, product code, or category..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
            </div>
            <p className="text-sm sm:text-base text-gray-600 mt-1">Manage your product catalog</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
            <button
              onClick={handleNewProduct}
              className="flex items-center justify-center space-x-2 px-3 sm:px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm sm:text-base"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add New Product</span>
              <span className="sm:hidden">Add</span>
            </button>
            <label className="flex items-center justify-center space-x-2 px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm sm:text-base cursor-pointer">
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Import Excel</span>
              <span className="sm:hidden">Import</span>
              <input
                type="file"
                accept=".xlsx,.xls,.ods"
                onChange={handleExcelImport}
                className="hidden"
                disabled={uploading}
              />
            </label>
            <button
              onClick={handleExport}
              className="flex items-center justify-center space-x-2 px-3 sm:px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm sm:text-base"
              disabled={uploading}
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export Excel</span>
              <span className="sm:hidden">Export</span>
            </button>
          </div>
        </div>

        {/* Upload Progress */}
        {uploading && uploadProgress && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-700">{uploadProgress}</p>
          </div>
        )}

        {/* Products Table */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-4 sm:p-8 text-center text-gray-500">Loading...</div>
          ) : products.length === 0 ? (
            <div className="p-4 sm:p-8 text-center text-gray-500">No products found</div>
          ) : (
            <div className="overflow-x-auto -mx-3 sm:mx-0">
              <table className="w-full border-collapse text-sm" style={{ border: '1px solid #000', minWidth: '1300px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f3f4f6', borderBottom: '2px solid #000' }}>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-center text-xs sm:text-sm font-bold text-gray-900 border border-gray-400" style={{ border: '1px solid #000', minWidth: '80px' }}>ID No.</th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs sm:text-sm font-bold text-gray-900 border border-gray-400" style={{ border: '1px solid #000', minWidth: '180px' }}>Product Name</th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs sm:text-sm font-bold text-gray-900 border border-gray-400" style={{ border: '1px solid #000', minWidth: '300px' }}>Specification</th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs sm:text-sm font-bold text-gray-900 border border-gray-400 hidden md:table-cell" style={{ border: '1px solid #000', minWidth: '150px' }}>Standard</th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs sm:text-sm font-bold text-gray-900 border border-gray-400 hidden lg:table-cell" style={{ border: '1px solid #000', minWidth: '100px' }}>HSN Code</th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs sm:text-sm font-bold text-gray-900 border border-gray-400 hidden lg:table-cell" style={{ border: '1px solid #000', minWidth: '100px' }}>Self Life</th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs sm:text-sm font-bold text-gray-900 border border-gray-400 hidden md:table-cell" style={{ border: '1px solid #000', minWidth: '200px' }}>Certification</th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs sm:text-sm font-bold text-gray-900 border border-gray-400" style={{ border: '1px solid #000', minWidth: '100px' }}>Price (₹)</th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs sm:text-sm font-bold text-gray-900 border border-gray-400" style={{ border: '1px solid #000', minWidth: '100px' }}>Custom Price (₹)</th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-center text-xs sm:text-sm font-bold text-gray-900 border border-gray-400" style={{ border: '1px solid #000', minWidth: '120px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {currentProducts.map((product, index) => {
                    const additionalFields = parseAdditionalFields(product.detailed_specifications);
                    const specificationOnly = getSpecificationOnly(product.detailed_specifications);
                    const standard = product.standard || additionalFields.standard;
                    const hsnCode = product.hsn_code || additionalFields.hsn_code;
                    const selfLife = product.self_life || additionalFields.self_life;
                    const certification = product.certification || additionalFields.certification;
                    
                    // Generate unique ID - extract numeric part from product_code
                    // Use actual index in full products array
                    const actualIndex = startIndex + index;
                    let uniqueId = '';
                    if (product.product_code) {
                      // Extract all numbers from product_code (format: PROD-00001)
                      const numbers = product.product_code.replace(/[^0-9]/g, '');
                      if (numbers) {
                        uniqueId = numbers.slice(-5).padStart(5, '0'); // Take last 5 digits
                      } else {
                        uniqueId = String(actualIndex + 1).padStart(5, '0');
                      }
                    } else {
                      // Fallback: use actual index + 1
                      uniqueId = String(actualIndex + 1).padStart(5, '0');
                    }
                    
                    const isEditing = editingCell?.productId === product.id;
                    const isEditingField = (field) => isEditing && editingCell?.field === field;
                    
                    return (
                      <tr key={product.id} style={{ borderBottom: '1px solid #000' }} className="hover:bg-gray-50">
                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-center text-xs sm:text-sm border border-gray-400 align-top font-semibold text-gray-900" style={{ border: '1px solid #000', verticalAlign: 'top' }}>
                          {uniqueId}
                      </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm border border-gray-400 align-top" style={{ border: '1px solid #000', verticalAlign: 'top' }}>
                          {isEditingField('product_name') ? (
                            <input
                              type="text"
                              value={cellValue}
                              onChange={(e) => setCellValue(e.target.value)}
                              onBlur={() => handleCellSave(product.id, 'product_name')}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.target.blur();
                                } else if (e.key === 'Escape') {
                                  setEditingCell(null);
                                }
                              }}
                              className="w-full px-2 py-1 border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-semibold"
                              autoFocus
                            />
                          ) : (
                            <div 
                              className="font-semibold text-gray-900 break-words cursor-pointer hover:bg-blue-50 p-1 rounded"
                              onClick={() => handleCellEdit(product.id, 'product_name', product.product_name)}
                              title="Click to edit"
                            >
                              {product.product_name || '-'}
                            </div>
                          )}
                      </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-700 border border-gray-400 align-top" style={{ border: '1px solid #000', verticalAlign: 'top', maxWidth: '400px' }}>
                          {isEditingField('specification') ? (
                            <textarea
                              value={cellValue}
                              onChange={(e) => setCellValue(e.target.value)}
                              onBlur={() => handleCellSave(product.id, 'specification')}
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                  setEditingCell(null);
                                }
                              }}
                              className="w-full px-2 py-1 border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                              rows={3}
                              autoFocus
                            />
                          ) : (
                            <div 
                              className="break-words whitespace-pre-wrap leading-relaxed cursor-pointer hover:bg-blue-50 p-1 rounded"
                              onClick={() => handleCellEdit(product.id, 'specification', specificationOnly || product.detailed_specifications)}
                              title="Click to edit"
                            >
                              {specificationOnly || product.detailed_specifications || '-'}
                            </div>
                          )}
                      </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-700 border border-gray-400 align-top hidden md:table-cell" style={{ border: '1px solid #000', verticalAlign: 'top', maxWidth: '200px' }}>
                          {isEditingField('standard') ? (
                            <textarea
                              value={cellValue}
                              onChange={(e) => setCellValue(e.target.value)}
                              onBlur={() => handleCellSave(product.id, 'standard')}
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                  setEditingCell(null);
                                }
                              }}
                              className="w-full px-2 py-1 border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                              rows={4}
                              autoFocus
                            />
                          ) : (
                            <div 
                              className="break-words whitespace-pre-wrap leading-relaxed cursor-pointer hover:bg-blue-50 p-1 rounded"
                              onClick={() => handleCellEdit(product.id, 'standard', standard)}
                              title="Click to edit"
                            >
                              {standard || '-'}
                            </div>
                          )}
                      </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-700 border border-gray-400 align-top hidden lg:table-cell" style={{ border: '1px solid #000', verticalAlign: 'top' }}>
                          {isEditingField('hsn_code') ? (
                            <input
                              type="text"
                              value={cellValue}
                              onChange={(e) => setCellValue(e.target.value)}
                              onBlur={() => handleCellSave(product.id, 'hsn_code')}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.target.blur();
                                } else if (e.key === 'Escape') {
                                  setEditingCell(null);
                                }
                              }}
                              className="w-full px-2 py-1 border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                              autoFocus
                            />
                          ) : (
                            <div 
                              className="cursor-pointer hover:bg-blue-50 p-1 rounded"
                              onClick={() => handleCellEdit(product.id, 'hsn_code', hsnCode)}
                              title="Click to edit"
                            >
                              {hsnCode || '-'}
                            </div>
                          )}
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-700 border border-gray-400 align-top hidden lg:table-cell" style={{ border: '1px solid #000', verticalAlign: 'top' }}>
                          {isEditingField('self_life') ? (
                            <input
                              type="text"
                              value={cellValue}
                              onChange={(e) => setCellValue(e.target.value)}
                              onBlur={() => handleCellSave(product.id, 'self_life')}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.target.blur();
                                } else if (e.key === 'Escape') {
                                  setEditingCell(null);
                                }
                              }}
                              className="w-full px-2 py-1 border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                              autoFocus
                            />
                          ) : (
                            <div 
                              className="cursor-pointer hover:bg-blue-50 p-1 rounded"
                              onClick={() => handleCellEdit(product.id, 'self_life', selfLife)}
                              title="Click to edit"
                            >
                              {selfLife || '-'}
                            </div>
                          )}
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-700 border border-gray-400 align-top hidden md:table-cell" style={{ border: '1px solid #000', verticalAlign: 'top', maxWidth: '250px' }}>
                          {isEditingField('certification') ? (
                            <textarea
                              value={cellValue}
                              onChange={(e) => setCellValue(e.target.value)}
                              onBlur={() => handleCellSave(product.id, 'certification')}
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                  setEditingCell(null);
                                }
                              }}
                              className="w-full px-2 py-1 border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                              rows={6}
                              autoFocus
                            />
                          ) : (
                            <div 
                              className="break-words whitespace-pre-wrap leading-relaxed cursor-pointer hover:bg-blue-50 p-1 rounded"
                              onClick={() => handleCellEdit(product.id, 'certification', certification)}
                              title="Click to edit"
                            >
                              {certification || '-'}
                            </div>
                          )}
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-700 font-semibold border border-gray-400 align-top" style={{ border: '1px solid #000', verticalAlign: 'top' }}>
                          {isEditingField('price') ? (
                            <input
                              type="number"
                              step="0.01"
                              value={cellValue}
                              onChange={(e) => setCellValue(e.target.value)}
                              onBlur={() => handleCellSave(product.id, 'price')}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.target.blur();
                                } else if (e.key === 'Escape') {
                                  setEditingCell(null);
                                }
                              }}
                              className="w-full px-2 py-1 border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                              placeholder="0"
                              autoFocus
                            />
                          ) : (
                            <div 
                              className="cursor-pointer hover:bg-blue-50 p-1 rounded"
                              onClick={() => {
                                const price = product.standard_selling_price || product.base_cost_price;
                                handleCellEdit(product.id, 'price', price ? price.toString() : '');
                              }}
                              title="Click to edit"
                            >
                              {product.standard_selling_price 
                                ? `₹${parseFloat(product.standard_selling_price).toLocaleString('en-IN')}` 
                                : product.base_cost_price 
                                ? `₹${parseFloat(product.base_cost_price).toLocaleString('en-IN')}` 
                                : '-'}
                            </div>
                          )}
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-700 font-semibold border border-gray-400 align-top" style={{ border: '1px solid #000', verticalAlign: 'top' }}>
                          {isEditingField('custom_price') ? (
                            <input
                              type="number"
                              step="0.01"
                              value={cellValue}
                              onChange={(e) => setCellValue(e.target.value)}
                              onBlur={() => handleCellSave(product.id, 'custom_price')}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.target.blur();
                                } else if (e.key === 'Escape') {
                                  setEditingCell(null);
                                }
                              }}
                              className="w-full px-2 py-1 border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                              placeholder="0"
                              autoFocus
                            />
                          ) : (
                            <div 
                              className="cursor-pointer hover:bg-blue-50 p-1 rounded"
                              onClick={() => {
                                const customPrice = product.custom_price;
                                handleCellEdit(product.id, 'custom_price', customPrice ? customPrice.toString() : '');
                              }}
                              title="Click to edit"
                            >
                              {product.custom_price 
                                ? `₹${parseFloat(product.custom_price).toLocaleString('en-IN')}` 
                                : '-'}
                            </div>
                          )}
                        </td>
                        <td className="px-2 sm:px-4 py-3 text-center border border-gray-400 align-top" style={{ border: '1px solid #000', verticalAlign: 'top' }}>
                          <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                            <button
                              onClick={() => handleEdit(product)}
                              className="px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-xs font-medium whitespace-nowrap"
                              title="Edit"
                            >
                              <Edit2 className="w-4 h-4 inline mr-1" />
                              <span className="hidden sm:inline">Edit</span>
                            </button>
                            <button
                              onClick={() => handleDelete(product.id)}
                              className="px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-xs font-medium whitespace-nowrap"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4 inline mr-1" />
                              <span className="hidden sm:inline">Delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {products.length === 0 && (
                    <tr>
                      <td colSpan="10" className="px-4 py-8 text-center text-gray-500">
                        No products found. Upload an Excel file to get started.
                      </td>
                    </tr>
                  )}
                  {/* Add New Row Button - Show on last page or when no pagination */}
                  {(products.length === 0 || currentPage === totalPages) && (
                    <tr className="bg-gray-50">
                      <td colSpan="10" className="px-4 py-3 text-center border border-gray-400" style={{ border: '1px solid #000' }}>
                        <button
                          onClick={handleAddNewRow}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium flex items-center justify-center gap-2 mx-auto"
                        >
                          <Plus className="w-4 h-4" />
                          Add New Row
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls */}
          {products.length > itemsPerPage && (
            <div className="mt-4 flex items-center justify-between px-2 sm:px-4 py-3 bg-gray-50 border-t border-gray-200">
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePreviousPage}
                  disabled={currentPage === 1}
                  className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    currentPage === 1
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                  }`}
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span className="hidden sm:inline">Previous</span>
                </button>
                <span className="text-sm text-gray-700 px-3">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={handleNextPage}
                  disabled={currentPage === totalPages}
                  className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    currentPage === totalPages
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                  }`}
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="text-sm text-gray-600">
                Showing {startIndex + 1} to {Math.min(endIndex, products.length)} of {products.length} products
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Product Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
                  {editingProduct ? 'Edit Product' : 'Create New Product'}
                </h2>
                <p className="text-xs sm:text-sm text-gray-600 mt-1">Update product information</p>
              </div>
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingProduct(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 sm:p-6">
              <div className="space-y-4 sm:space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Product Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.product_name}
                      onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      required
                    placeholder="Enter product name"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                    Specification
                    </label>
                  <textarea
                    value={formData.detailed_specifications}
                    onChange={(e) => setFormData({ ...formData, detailed_specifications: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    rows={4}
                    placeholder="Enter product specifications"
                    />
                  </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Standard</label>
                    <textarea
                      value={formData.standard}
                      onChange={(e) => setFormData({ ...formData, standard: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      rows={4}
                      placeholder="e.g., RAL 1004 - Golden Yellow&#10;RAL 7035 - Light Grey&#10;RAL 1018 - Zinc Yellow&#10;RAL 9010 - Pure White"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">HSN Code</label>
                    <input
                      type="text"
                      value={formData.hsn_code}
                      onChange={(e) => setFormData({ ...formData, hsn_code: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="Enter HSN Code"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Self Life</label>
                    <input
                      type="text"
                      value={formData.self_life}
                      onChange={(e) => setFormData({ ...formData, self_life: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="e.g., 5 years"
                  />
                </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Certification</label>
                    <textarea
                      value={formData.certification}
                      onChange={(e) => setFormData({ ...formData, certification: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      rows={6}
                      placeholder="e.g., FM Approved&#10;iBMB MPA&#10;IDV 900 GS&#10;DIN EN14470-1&#10;DIN EN14727&#10;OSHA, UE-OSHA"
                    />
                  </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Price (₹)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.standard_selling_price}
                        onChange={(e) => setFormData({ ...formData, standard_selling_price: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        placeholder="Enter price"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Custom Price (₹)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.custom_price}
                        onChange={(e) => setFormData({ ...formData, custom_price: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        placeholder="Enter custom price"
                      />
                    </div>
                  </div>
                  </div>

              <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-3 mt-6 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingProduct(null);
                  }}
                  className="w-full sm:w-auto px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-auto px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  {editingProduct ? 'Update Product' : 'Create Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductCatalog;

