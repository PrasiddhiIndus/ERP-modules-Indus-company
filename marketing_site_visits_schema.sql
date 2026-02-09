-- Marketing Site Visits Database Schema
-- Run this SQL in your Supabase SQL Editor

-- ============================================
-- SITE VISITS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS marketing_site_visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    executive_names TEXT NOT NULL, -- Comma-separated list of executive names
    client_name TEXT NOT NULL,
    site_location TEXT NOT NULL, -- City and State
    visit_date DATE NOT NULL,
    purpose_of_visit TEXT,
    travel_expenses DECIMAL(12, 2) DEFAULT 0,
    food_expenses DECIMAL(12, 2) DEFAULT 0,
    accommodation DECIMAL(12, 2) DEFAULT 0,
    other_expenses DECIMAL(12, 2) DEFAULT 0,
    total_expense DECIMAL(12, 2) DEFAULT 0,
    approved_amount DECIMAL(12, 2),
    status TEXT DEFAULT 'Pending Paid', -- Pending Paid, Approved, Rejected, Paid
    remarks TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id)
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_site_visits_date ON marketing_site_visits(visit_date);
CREATE INDEX IF NOT EXISTS idx_site_visits_client ON marketing_site_visits(client_name);
CREATE INDEX IF NOT EXISTS idx_site_visits_status ON marketing_site_visits(status);
CREATE INDEX IF NOT EXISTS idx_site_visits_created_by ON marketing_site_visits(created_by);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS
ALTER TABLE marketing_site_visits ENABLE ROW LEVEL SECURITY;

-- Policies for marketing_site_visits
CREATE POLICY "Users can view all site visits"
    ON marketing_site_visits FOR SELECT
    USING (true);

CREATE POLICY "Users can insert site visits"
    ON marketing_site_visits FOR INSERT
    WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update site visits"
    ON marketing_site_visits FOR UPDATE
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Users can delete site visits"
    ON marketing_site_visits FOR DELETE
    USING (true);

-- ============================================
-- TRIGGER FOR UPDATED_AT
-- ============================================
CREATE OR REPLACE FUNCTION update_marketing_site_visits_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_marketing_site_visits_updated_at
    BEFORE UPDATE ON marketing_site_visits
    FOR EACH ROW
    EXECUTE FUNCTION update_marketing_site_visits_updated_at();

