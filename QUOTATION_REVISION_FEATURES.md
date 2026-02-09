# Quotation Revision Features - Implementation Summary

## Overview
This document summarizes the quotation revision tracking features that have been implemented in the ERP system.

## Features Implemented

### 1. Revision Creation in Quotation Tracker
- **Location**: `src/pages/marketing/QuotationTracker.jsx`
- **Feature**: Added "Revision" option in the quotation action dropdown menu
- **Functionality**:
  - Opens a revision form modal with:
    - **Upcoming Date**: Follow-up date for the revision
    - **Remarks/Description**: Details about the revision
    - **Status**: Three options (Pending, Completed, Overdue)
  - Automatically increments revision number
  - Saves revision history

### 2. Auto-Sync with Follow-Up Planner
- **Location**: `src/pages/marketing/QuotationTracker.jsx` & `src/pages/marketing/FollowUpPlanner.jsx`
- **Feature**: When a revision is created, it automatically:
  - Creates a follow-up entry in the Follow-Up Planner
  - Updates the quotation's follow-up date
  - Links the revision to the quotation

### 3. Follow-Up Planner Enhancements
- **Location**: `src/pages/marketing/FollowUpPlanner.jsx`
- **Features**:
  - Shows quotation revisions with "(Revision)" indicator
  - Auto-updates status based on current date:
    - **Pending**: Future dates
    - **Overdue**: Past dates with Pending status
    - **Completed**: Manually marked as completed
  - Filters: Upcoming, All, Past
  - Completed items automatically move to "Past" filter
  - Status badges with color coding

### 4. Marketing Dashboard Notifications
- **Location**: `src/pages/marketing/MarketingDashboard.jsx`
- **Features**:
  - Notification bell icon with badge count
  - Shows revisions due today
  - Real-time updates via Supabase subscriptions
  - Displays:
    - Quotation number
    - Revision number
    - Remarks
    - Client name
  - Dismissible notifications

### 5. Email Notifications
- **Location**: `src/pages/marketing/QuotationTracker.jsx`
- **Feature**: 
  - When revision date arrives (today), automatically:
    - Opens email client with pre-filled message
    - Includes quotation number and remarks
    - Sends to client's email address
  - Falls back to mailto link if email service not configured

### 6. Revision History Log
- **Location**: `src/pages/marketing/QuotationTracker.jsx`
- **Feature**:
  - View all revisions for a quotation
  - Shows:
    - Revision number
    - Revision date
    - Remarks
    - Created by and timestamp
  - Accessible from quotation view modal

### 7. Database Schema
- **Files**: 
  - `marketing_quotation_revisions_schema.sql`
  - `marketing_quotation_revisions_schema_update.sql`
- **Tables Created/Updated**:
  - `marketing_quotation_revisions`: Stores revision history
  - `marketing_notifications`: Stores dashboard notifications
  - `marketing_quotations`: Added `follow_up_date` column
- **Features**:
  - Auto-update triggers for status based on date
  - Indexes for performance
  - Row Level Security (RLS) policies

## Database Setup

### Step 1: Run the Schema Update
Execute the SQL file in your Supabase SQL Editor:
```sql
-- Run: marketing_quotation_revisions_schema_update.sql
```

This will:
- Create the `marketing_quotation_revisions` table
- Add `follow_up_date` column to `marketing_quotations` (if not exists)
- Create `marketing_notifications` table
- Set up indexes and RLS policies
- Create auto-update triggers

### Step 2: Verify Tables
Check that these tables exist:
- `marketing_quotation_revisions`
- `marketing_notifications`
- `marketing_quotations` (with `follow_up_date` column)

## Usage Guide

### Creating a Revision
1. Navigate to **Quotation Tracker**
2. Click the **three-dot menu** (⋮) on any quotation
3. Select **"Revision"**
4. Fill in:
   - **Upcoming Date**: When the revision is due
   - **Remarks**: Description of changes/feedback
   - **Status**: Pending, Completed, or Overdue
5. Click **"Save Revision"**

### Viewing Revision History
1. Open any quotation (click **View**)
2. Click **"View Revision History"** button
3. See all revisions with details

### Managing Revisions in Follow-Up Planner
1. Navigate to **Follow-Up Planner**
2. Revisions appear with "(Revision)" indicator
3. Filter by:
   - **Upcoming**: Future revisions
   - **Past**: Completed or past revisions
   - **All**: All revisions
4. Edit status to mark as Completed

### Dashboard Notifications
- Notification bell appears when revisions are due today
- Click bell to see all due revisions
- Dismiss individual notifications

## Status Logic

### Automatic Status Updates
- **Pending**: Default for future dates
- **Overdue**: Automatically set when:
  - Date is in the past
  - Status was "Pending"
- **Completed**: Manually set by user
  - Completed items appear in "Past" filter

### Date-Based Filtering
- **Upcoming**: `follow_up_date >= today`
- **Past**: `follow_up_date < today` OR `status = 'Completed'`
- **All**: Shows everything

## Email Integration

Currently uses `mailto:` links. To integrate with an email service:

1. **Option 1**: Use Supabase Edge Functions
   ```javascript
   await supabase.functions.invoke('send-email', {
     body: { to: clientEmail, subject, body }
   });
   ```

2. **Option 2**: Integrate with your email service provider
   - Update `sendRevisionEmail()` function in `QuotationTracker.jsx`
   - Add API keys to environment variables

## Future Enhancements

Potential improvements:
1. Email service integration (SMTP/SendGrid/etc.)
2. SMS notifications for urgent revisions
3. Revision templates
4. Bulk revision operations
5. Revision approval workflow
6. Export revision reports

## Troubleshooting

### Revisions Not Appearing
- Check database schema is updated
- Verify RLS policies allow access
- Check browser console for errors

### Follow-Ups Not Syncing
- Ensure `marketing_follow_ups` table exists
- Check user permissions
- Verify quotation_id is valid

### Notifications Not Showing
- Check `marketing_notifications` table exists
- Verify real-time subscriptions are enabled
- Check browser console for subscription errors

## Files Modified

1. `src/pages/marketing/QuotationTracker.jsx` - Main revision functionality
2. `src/pages/marketing/FollowUpPlanner.jsx` - Revision display and filtering
3. `src/pages/marketing/MarketingDashboard.jsx` - Notification system
4. `marketing_quotation_revisions_schema.sql` - Base schema
5. `marketing_quotation_revisions_schema_update.sql` - Complete schema with triggers

## Support

For issues or questions:
1. Check browser console for errors
2. Verify database schema is correctly applied
3. Ensure user has proper permissions
4. Review Supabase logs for database errors

