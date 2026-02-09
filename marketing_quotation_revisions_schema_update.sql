-- Marketing Quotation Revisions Database Schema Update
-- Run this SQL in your Supabase SQL Editor to add revision functionality

-- ============================================
-- 1. QUOTATION REVISIONS HISTORY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS marketing_quotation_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quotation_id UUID REFERENCES marketing_quotations(id) ON DELETE CASCADE,
    revision_number INTEGER NOT NULL,
    revision_date DATE NOT NULL DEFAULT CURRENT_DATE,
    remarks TEXT,
    changes_summary TEXT, -- Summary of what changed in this revision
    status TEXT DEFAULT 'Pending', -- Pending, Completed, Overdue
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id)
);

-- ============================================
-- 2. ADD FOLLOW_UP_DATE TO MARKETING_QUOTATIONS (if not exists)
-- ============================================
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'marketing_quotations' 
        AND column_name = 'follow_up_date'
    ) THEN
        ALTER TABLE marketing_quotations 
        ADD COLUMN follow_up_date DATE;
    END IF;
END $$;

-- ============================================
-- 3. NOTIFICATIONS TABLE (for dashboard notifications)
-- ============================================
CREATE TABLE IF NOT EXISTS marketing_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL, -- 'quotation_revision', 'follow_up', etc.
    title TEXT NOT NULL,
    message TEXT,
    quotation_id UUID REFERENCES marketing_quotations(id) ON DELETE CASCADE,
    enquiry_id UUID REFERENCES marketing_enquiries(id) ON DELETE CASCADE,
    follow_up_id UUID REFERENCES marketing_follow_ups(id) ON DELETE CASCADE,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- ============================================
-- 4. INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_quotation_revisions_quotation_id ON marketing_quotation_revisions(quotation_id);
CREATE INDEX IF NOT EXISTS idx_quotation_revisions_date ON marketing_quotation_revisions(revision_date);
CREATE INDEX IF NOT EXISTS idx_quotation_revisions_number ON marketing_quotation_revisions(quotation_id, revision_number);
CREATE INDEX IF NOT EXISTS idx_quotation_revisions_status ON marketing_quotation_revisions(status);
CREATE INDEX IF NOT EXISTS idx_quotations_follow_up_date ON marketing_quotations(follow_up_date);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON marketing_notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON marketing_notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON marketing_notifications(created_at);

-- ============================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS for quotation revisions
ALTER TABLE marketing_quotation_revisions ENABLE ROW LEVEL SECURITY;

-- Policies for marketing_quotation_revisions
DROP POLICY IF EXISTS "Users can view all quotation revisions" ON marketing_quotation_revisions;
CREATE POLICY "Users can view all quotation revisions"
    ON marketing_quotation_revisions FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Users can insert quotation revisions" ON marketing_quotation_revisions;
CREATE POLICY "Users can insert quotation revisions"
    ON marketing_quotation_revisions FOR INSERT
    WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Users can update quotation revisions" ON marketing_quotation_revisions;
CREATE POLICY "Users can update quotation revisions"
    ON marketing_quotation_revisions FOR UPDATE
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Users can delete quotation revisions" ON marketing_quotation_revisions;
CREATE POLICY "Users can delete quotation revisions"
    ON marketing_quotation_revisions FOR DELETE
    USING (true);

-- Enable RLS for notifications
ALTER TABLE marketing_notifications ENABLE ROW LEVEL SECURITY;

-- Policies for marketing_notifications
DROP POLICY IF EXISTS "Users can view their notifications" ON marketing_notifications;
CREATE POLICY "Users can view their notifications"
    ON marketing_notifications FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Users can insert notifications" ON marketing_notifications;
CREATE POLICY "Users can insert notifications"
    ON marketing_notifications FOR INSERT
    WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Users can update notifications" ON marketing_notifications;
CREATE POLICY "Users can update notifications"
    ON marketing_notifications FOR UPDATE
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Users can delete notifications" ON marketing_notifications;
CREATE POLICY "Users can delete notifications"
    ON marketing_notifications FOR DELETE
    USING (true);

-- ============================================
-- 6. FUNCTION TO AUTO-UPDATE STATUS BASED ON DATE
-- ============================================
CREATE OR REPLACE FUNCTION update_follow_up_status()
RETURNS TRIGGER AS $$
BEGIN
    -- If follow-up date is in the past and status is Pending, mark as Overdue
    IF NEW.follow_up_date < CURRENT_DATE AND NEW.status = 'Pending' THEN
        NEW.status := 'Overdue';
    END IF;
    
    -- If status is Completed and date is in the past, ensure it stays completed
    IF NEW.status = 'Completed' AND NEW.follow_up_date < CURRENT_DATE THEN
        -- Keep as completed
        RETURN NEW;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for follow-ups
DROP TRIGGER IF EXISTS trigger_update_follow_up_status ON marketing_follow_ups;
CREATE TRIGGER trigger_update_follow_up_status
    BEFORE INSERT OR UPDATE ON marketing_follow_ups
    FOR EACH ROW
    EXECUTE FUNCTION update_follow_up_status();

-- ============================================
-- 7. FUNCTION TO AUTO-UPDATE REVISION STATUS
-- ============================================
CREATE OR REPLACE FUNCTION update_revision_status()
RETURNS TRIGGER AS $$
BEGIN
    -- If revision date is in the past and status is Pending, mark as Overdue
    IF NEW.revision_date < CURRENT_DATE AND NEW.status = 'Pending' THEN
        NEW.status := 'Overdue';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for revisions
DROP TRIGGER IF EXISTS trigger_update_revision_status ON marketing_quotation_revisions;
CREATE TRIGGER trigger_update_revision_status
    BEFORE INSERT OR UPDATE ON marketing_quotation_revisions
    FOR EACH ROW
    EXECUTE FUNCTION update_revision_status();

-- ============================================
-- 8. VIEW FOR REVISION SUMMARY
-- ============================================
CREATE OR REPLACE VIEW marketing_revision_summary AS
SELECT 
    qr.id,
    qr.quotation_id,
    q.quotation_number,
    qr.revision_number,
    qr.revision_date,
    qr.remarks,
    qr.status,
    qr.created_at,
    c.client_name,
    c.contact_email,
    CASE 
        WHEN qr.revision_date = CURRENT_DATE THEN 'Due Today'
        WHEN qr.revision_date < CURRENT_DATE AND qr.status = 'Pending' THEN 'Overdue'
        WHEN qr.status = 'Completed' THEN 'Completed'
        ELSE 'Upcoming'
    END AS computed_status
FROM marketing_quotation_revisions qr
JOIN marketing_quotations q ON qr.quotation_id = q.id
LEFT JOIN marketing_clients c ON q.client_id = c.id;

