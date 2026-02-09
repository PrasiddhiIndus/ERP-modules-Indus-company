-- ==============================================
-- Table: marketing_mail_templates
-- Purpose: Store marketing mail templates with subject and terms & conditions
-- ==============================================
CREATE TABLE IF NOT EXISTS marketing_mail_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    template_type TEXT NOT NULL DEFAULT 'Subject', -- 'Subject' or 'Terms & Condition'
    subject_title TEXT, -- For Subject templates: title/header
    subject_content TEXT, -- For Subject templates: body/description
    terms_and_conditions TEXT, -- For Terms & Condition templates: terms content
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id)
);

-- Enable Row Level Security
ALTER TABLE marketing_mail_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for marketing_mail_templates
-- Allow all authenticated users to view templates
CREATE POLICY "Authenticated users can view marketing mail templates"
    ON marketing_mail_templates FOR SELECT
    TO authenticated
    USING (true);

-- Allow all authenticated users to insert templates
CREATE POLICY "Authenticated users can insert marketing mail templates"
    ON marketing_mail_templates FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Allow all authenticated users to update templates
CREATE POLICY "Authenticated users can update marketing mail templates"
    ON marketing_mail_templates FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Allow all authenticated users to delete templates
CREATE POLICY "Authenticated users can delete marketing mail templates"
    ON marketing_mail_templates FOR DELETE
    TO authenticated
    USING (true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_marketing_mail_templates_type ON marketing_mail_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_marketing_mail_templates_created_at ON marketing_mail_templates(created_at);

-- Add comment to table
COMMENT ON TABLE marketing_mail_templates IS 'Stores marketing mail templates for quotations - Subject templates and Terms & Conditions templates';

