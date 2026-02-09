// src/lib/auditLogger.js
import { supabase } from './supabase';

class AuditLogger {
  constructor() {
    this.logs = [];
    this.maxLogs = 100; // Keep last 100 logs in memory
  }

  // Get user info from Supabase auth
  async getUserInfo() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      // Get additional user info from app_users table
      const { data: userData } = await supabase
        .from('app_users')
        .select('full_name, email')
        .eq('id', user.id)
        .single();

      return {
        id: user.id,
        email: user.email,
        name: userData?.full_name || user.email?.split('@')[0] || 'Unknown User'
      };
    } catch (error) {
      console.error('Error getting user info:', error);
      return {
        id: 'unknown',
        email: 'unknown@example.com',
        name: 'Unknown User'
      };
    }
  }

  // Get client info
  getClientInfo() {
    return {
      ip: 'Unknown', // Would need server-side implementation for real IP
      userAgent: navigator.userAgent
    };
  }

  // Log an action - focused on unit cost changes
  async log(action, tableName, recordId = null, fieldName = null, oldValue = null, newValue = null, description = null) {
    try {
      // Only log unit cost related changes
      if (fieldName !== 'unit_cost' && fieldName !== 'unitCost' && action !== 'COMPARISON') {
        return null;
      }

      const userInfo = await this.getUserInfo();
      const clientInfo = this.getClientInfo();

      const logEntry = {
        user_id: userInfo.id,
        user_email: userInfo.email,
        user_name: userInfo.name,
        action,
        table_name: tableName,
        record_id: recordId?.toString() || null,
        field_name: fieldName,
        old_value: oldValue?.toString() || null,
        new_value: newValue?.toString() || null,
        description: description || `${action} ${fieldName ? `field '${fieldName}'` : 'record'} in ${tableName}`,
        ip_address: clientInfo.ip,
        user_agent: clientInfo.userAgent
      };

      // Save to database
      const { error } = await supabase
        .from('audit_logs')
        .insert([logEntry]);

      if (error) {
        console.error('Error saving audit log:', error);
      }

      // Add to local logs for console display
      const consoleLog = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        user: userInfo.name,
        action,
        table: tableName,
        record: recordId,
        field: fieldName,
        oldValue,
        newValue,
        description: logEntry.description
      };

      this.logs.unshift(consoleLog);
      
      // Keep only the last maxLogs entries
      if (this.logs.length > this.maxLogs) {
        this.logs = this.logs.slice(0, this.maxLogs);
      }

      // Emit event for console component
      window.dispatchEvent(new CustomEvent('auditLog', { detail: consoleLog }));

      return consoleLog;
    } catch (error) {
      console.error('Error in audit logger:', error);
      return null;
    }
  }

  // Method to detect price drift between saved Costing Sheets and current Price Master
  async detectPriceDrift() {
    try {
      const userInfo = await this.getUserInfo();
      
      // Get all saved costing rows with their original prices
      const { data: costingRows, error: costingError } = await supabase
        .from('costing_rows')
        .select(`
          *,
          tenders!inner(tender_name, tender_number)
        `)
        .not('costing_saved_at', 'is', null)
        .order('costing_saved_at', { ascending: false });

      if (costingError) {
        console.error('Error fetching costing rows:', costingError);
        return;
      }

      // Get current Price Master data
      const { data: priceMasterData, error: priceError } = await supabase
        .from('price_master')
        .select('*');

      if (priceError) {
        console.error('Error fetching price master data:', priceError);
        return;
      }

      // Create price master lookup
      const priceMasterLookup = {};
      priceMasterData.forEach(item => {
        const key = `${item.main_component}|${item.sub_category1 || ''}|${item.sub_category2 || ''}|${item.sub_category3 || ''}|${item.sub_category4 || ''}|${item.sub_category5 || ''}`;
        priceMasterLookup[key] = item;
      });

      // Check for price drift
      const driftAlerts = [];
      
      costingRows.forEach(row => {
        if (row.main_component && row.original_unit_cost) {
          const priceKey = `${row.main_component}|${row.sub_category1 || ''}|${row.sub_category2 || ''}|${row.sub_category3 || ''}|${row.sub_category4 || ''}|${row.sub_category5 || ''}`;
          const currentPriceMaster = priceMasterLookup[priceKey];
          
          if (currentPriceMaster) {
            const originalPrice = parseFloat(row.original_unit_cost) || 0;
            const currentPrice = parseFloat(currentPriceMaster.unit_cost) || 0;
            
            // Use small threshold for floating point comparison
            if (Math.abs(currentPrice - originalPrice) > 0.01) {
              const difference = currentPrice - originalPrice;
              const percentage = originalPrice > 0 ? ((difference / originalPrice) * 100).toFixed(2) : 0;
              
              driftAlerts.push({
                tenderId: row.tender_id,
                tenderName: row.tenders?.tender_name || `Tender #${row.tender_id}`,
                component: row.main_component,
                subCategories: [row.sub_category1, row.sub_category2, row.sub_category3, row.sub_category4, row.sub_category5].filter(Boolean).join(' > '),
                originalPrice: originalPrice,
                currentPrice: currentPrice,
                difference: difference,
                percentage: percentage,
                costingSavedAt: row.costing_saved_at,
                priceMasterUpdatedAt: currentPriceMaster.updated_at
              });
            }
          }
        }
      });

      console.log('Price drift detection results:', {
        costingRowsCount: costingRows.length,
        priceMasterCount: priceMasterData.length,
        driftAlertsCount: driftAlerts.length,
        sampleCostingRow: costingRows[0],
        samplePriceMaster: priceMasterData[0]
      });

      if (driftAlerts.length > 0) {
        const description = `🚨 PRICE DRIFT DETECTED: ${driftAlerts.length} costing sheets have outdated prices`;
        
        const consoleLog = {
          id: Date.now(),
          timestamp: new Date().toISOString(),
          user: userInfo.name,
          action: 'PRICE_DRIFT',
          table: 'price_drift_detection',
          record: 'bulk',
          field: 'unit_cost',
          oldValue: null,
          newValue: null,
          description,
          driftAlerts: driftAlerts
        };

        this.logs.unshift(consoleLog);
        
        // Keep only the last maxLogs entries
        if (this.logs.length > this.maxLogs) {
          this.logs = this.logs.slice(0, this.maxLogs);
        }

        // Emit event for console component
        window.dispatchEvent(new CustomEvent('auditLog', { detail: consoleLog }));

        return consoleLog;
      } else {
        console.log('No price drift detected');
      }
    } catch (error) {
      console.error('Error in price drift detection:', error);
      return null;
    }
  }

  // Method to log price changes in Price Master
  async logPriceMasterChange(priceMasterId, oldValue, newValue, component) {
    try {
      const userInfo = await this.getUserInfo();
      
      // Create version record
      const { error: versionError } = await supabase
        .from('price_master_versions')
        .insert({
          price_master_id: priceMasterId,
          unit_cost: newValue,
          user_id: userInfo.id,
          change_reason: `Price changed from ₹${oldValue} to ₹${newValue}`
        });

      if (versionError) {
        console.error('Error creating price master version:', versionError);
      }

      // Log the change
      await this.log(
        'UPDATE',
        'price_master',
        priceMasterId,
        'unit_cost',
        oldValue,
        newValue,
        `Price changed for ${component}: ₹${oldValue} → ₹${newValue}`
      );

      // Trigger price drift detection
      setTimeout(() => {
        this.detectPriceDrift();
      }, 1000);

    } catch (error) {
      console.error('Error logging price master change:', error);
    }
  }

  // Get recent logs
  getRecentLogs(limit = 50) {
    return this.logs.slice(0, limit);
  }

  // Clear logs
  clearLogs() {
    this.logs = [];
  }
}

// Create singleton instance
const auditLogger = new AuditLogger();

export default auditLogger;










