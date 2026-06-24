/**
 * Utility to handle Supabase authentication errors globally
 * This helps catch and handle refresh token errors that might occur
 * in any part of the application
 */

import { supabase, clearAuthStorage } from './supabase';
import { isInvalidRefreshTokenError } from './authSessionUtils';

/**
 * Wraps a Supabase query/mutation to handle auth errors gracefully
 * @param {Function} operation - The Supabase operation to execute
 * @returns {Promise} - The result of the operation
 */
export const handleSupabaseError = async (operation) => {
  try {
    const result = await operation();
    
    // Check for refresh token errors in the result
    if (result.error) {
      const errorMessage = String(result.error.message || '');

      if (isInvalidRefreshTokenError(errorMessage)) {
        console.warn('Refresh token error detected, clearing session...');
        
        // Clear invalid session
        try {
          await supabase.auth.signOut();
        } catch (e) {
          // Ignore signOut errors
        }
        
        // Clear storage
        clearAuthStorage();
        
        // Redirect to login if we're not already there
        // App login route is `/` (not `/login`).
        if (window.location.pathname !== '/') {
          window.location.href = '/';
        }
        
        return {
          ...result,
          error: {
            ...result.error,
            message: 'Session expired. Please log in again.',
            shouldRedirect: true,
          },
        };
      }
    }
    
    return result;
  } catch (error) {
    // Handle network errors
    if (
      error.message?.includes('Failed to fetch') ||
      error.message?.includes('Network') ||
      error.message?.includes('fetch')
    ) {
      console.error('Supabase backend not accessible:', error);
      return {
        data: null,
        error: {
          message: 'Unable to connect to the server. Please check your internet connection and ensure the backend is running.',
          code: 'NETWORK_ERROR',
        },
      };
    }
    
    // Re-throw other errors
    throw error;
  }
};

/**
 * Check if Supabase is properly configured
 * @returns {boolean}
 */
export { isSupabaseEnvConfigured as isSupabaseConfigured } from './supabaseConfig';

