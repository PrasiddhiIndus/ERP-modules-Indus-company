-- Sample Data Seeder for IFSPL Employee Master
-- For INDUS ERP CORE - Admin Module
-- Based on exact column requirements

-- ==============================================
-- Sample IFSPL Employees Data
-- ==============================================
INSERT INTO ifsp_employees (
    employee_id, full_name, gender, date_of_joining, designation, date_of_birth, 
    date_of_anniversary, blood_group, aadhar_no, pan_card_no, religion, 
    father_name, mother_name, spouse_name, son_name, son_dob, daughter_name,
    address, full_address, personal_no, emergency_no, identification_mark,
    years_of_experience, qualification, attachments, birthday_reminder, 
    anniversary_reminder, department, other_experience, ifspl_experience, 
    date_of_leaving, status, status_reason, created_by, updated_by, user_id
) VALUES
('EMP001', 'Rajesh Kumar Sharma', 'Male', '2020-01-15', 'Manager', '1985-03-15', 
 '2020-01-15', 'A+', '123456789012', 'ABCDE1234F', 'Hindu',
 'Ram Kumar Sharma', 'Sita Devi Sharma', 'Priya Sharma', 'Arjun Sharma', '2010-05-20', 'Kavya Sharma',
 '123 Main Street, Sector 15', '123 Main Street, Sector 15, Gurgaon, Haryana - 122001', '9876543210', '9876543211', 'Mole on left cheek',
 8.5, 'MBA in HR, B.Com, Diploma in Computer Applications', ARRAY['resume.pdf', 'certificates.pdf'], true, true, 'HR', 5.0, 3.5,
 NULL, 'Active', NULL, 'admin@ifsp.com', 'admin@ifsp.com', auth.uid()),

('EMP002', 'Priya Singh', 'Female', '2021-06-01', 'Senior Executive', '1990-07-22', 
 '2021-06-01', 'B+', '234567890123', 'BCDEF2345G', 'Hindu',
 'Vikram Singh', 'Sunita Singh', 'Amit Singh', 'Rohan Singh', '2015-08-10', 'Sneha Singh',
 '456 Park Avenue, Block A', '456 Park Avenue, Block A, Delhi - 110001', '9876543212', '9876543213', 'Scar on right hand',
 5.0, 'CA, B.Com, M.Com', ARRAY['ca_certificate.pdf', 'degree.pdf'], true, true, 'Finance', 3.0, 2.0,
 NULL, 'Active', NULL, 'admin@ifsp.com', 'admin@ifsp.com', auth.uid()),

('EMP003', 'Amit Patel', 'Male', '2019-03-10', 'Senior Manager', '1988-11-10', 
 '2019-03-10', 'O+', '345678901234', 'CDEFG3456H', 'Hindu',
 'Ramesh Patel', 'Geeta Patel', 'Sunita Patel', 'Karan Patel', '2012-12-25', 'Anita Patel',
 '789 Business District, Phase 2', '789 Business District, Phase 2, Bangalore - 560001', '9876543214', '9876543215', 'Birthmark on forehead',
 10.0, 'MBA in Operations, B.Tech Mechanical', ARRAY['mba_degree.pdf', 'btech_certificate.pdf'], true, true, 'Operations', 7.0, 3.0,
 NULL, 'Active', NULL, 'admin@ifsp.com', 'admin@ifsp.com', auth.uid()),

('EMP004', 'Sneha Gupta', 'Female', '2022-02-01', 'Executive', '1992-05-18', 
 '2022-02-01', 'AB+', '456789012345', 'DEFGH4567I', 'Hindu',
 'Rajesh Gupta', 'Meera Gupta', 'Vikram Gupta', 'Rahul Gupta', '2018-03-15', 'Pooja Gupta',
 '321 Sales Street, Commercial Area', '321 Sales Street, Commercial Area, Chennai - 600001', '9876543216', '9876543217', 'Tattoo on left arm',
 2.5, 'BBA in Marketing, MBA in Sales', ARRAY['bba_degree.pdf', 'mba_degree.pdf'], true, true, 'Sales', 1.0, 1.5,
 NULL, 'Active', NULL, 'admin@ifsp.com', 'admin@ifsp.com', auth.uid()),

('EMP005', 'Ravi Singh', 'Male', '2018-08-15', 'Senior Developer', '1983-12-05', 
 '2018-08-15', 'A-', '567890123456', 'EFGHI5678J', 'Sikh',
 'Gurpreet Singh', 'Harpreet Kaur', 'Manpreet Kaur', 'Jaspreet Singh', '2010-09-20', 'Simran Kaur',
 '654 Tech Park, IT Hub', '654 Tech Park, IT Hub, Hyderabad - 500001', '9876543218', '9876543219', 'Beard and turban',
 12.0, 'M.Tech in Computer Science, B.Tech IT', ARRAY['mtech_degree.pdf', 'btech_degree.pdf', 'certifications.pdf'], true, true, 'IT', 8.0, 4.0,
 NULL, 'Active', NULL, 'admin@ifsp.com', 'admin@ifsp.com', auth.uid()),

('EMP006', 'Anita Joshi', 'Female', '2023-01-10', 'Trainee', '1995-09-12', 
 '2023-01-10', 'B-', '678901234567', 'FGHIJ6789K', 'Hindu',
 'Suresh Joshi', 'Lakshmi Joshi', NULL, NULL, NULL, NULL,
 '987 Marketing Lane, Startup Hub', '987 Marketing Lane, Startup Hub, Pune - 411001', '9876543220', '9876543221', 'Glasses',
 0.5, 'MBA in Marketing, B.Com', ARRAY['mba_degree.pdf', 'bcom_degree.pdf'], true, true, 'Marketing', 0.0, 0.5,
 NULL, 'Active', NULL, 'admin@ifsp.com', 'admin@ifsp.com', auth.uid()),

('EMP007', 'Vikram Reddy', 'Male', '2020-11-01', 'Supervisor', '1987-04-25', 
 '2020-11-01', 'O-', '789012345678', 'GHIJK7890L', 'Hindu',
 'Ramesh Reddy', 'Lakshmi Reddy', 'Sunita Reddy', 'Kiran Reddy', '2015-07-30', 'Priya Reddy',
 '147 Industrial Area, Manufacturing Zone', '147 Industrial Area, Manufacturing Zone, Ahmedabad - 380001', '9876543222', '9876543223', 'Mustache',
 6.0, 'B.Tech in Mechanical Engineering, Diploma in Production', ARRAY['btech_degree.pdf', 'diploma_certificate.pdf'], true, true, 'Production', 4.0, 2.0,
 NULL, 'Active', NULL, 'admin@ifsp.com', 'admin@ifsp.com', auth.uid()),

('EMP008', 'Sunita Mehta', 'Female', '2017-05-20', 'Manager', '1980-08-30', 
 '2017-05-20', 'AB-', '890123456789', 'HIJKL8901M', 'Jain',
 'Arun Mehta', 'Rekha Mehta', 'Rajesh Mehta', 'Amit Mehta', '2008-11-12', 'Neha Mehta',
 '258 Quality Street, Industrial Estate', '258 Quality Street, Industrial Estate, Jaipur - 302001', '9876543224', '9876543225', 'Small mole near left eye',
 15.0, 'M.Tech in Quality Management, B.Tech Chemical', ARRAY['mtech_degree.pdf', 'btech_degree.pdf', 'iso_certifications.pdf'], true, true, 'Quality Control', 10.0, 5.0,
 NULL, 'Active', NULL, 'admin@ifsp.com', 'admin@ifsp.com', auth.uid()),

('EMP009', 'Kiran Agarwal', 'Male', '2022-07-01', 'Coordinator', '1993-01-14', 
 '2022-07-01', 'A+', '901234567890', 'IJKLM9012N', 'Hindu',
 'Suresh Agarwal', 'Rekha Agarwal', 'Pooja Agarwal', 'Rohit Agarwal', '2020-04-18', NULL,
 '369 Logistics Hub, Transport Center', '369 Logistics Hub, Transport Center, Indore - 452001', '9876543226', '9876543227', 'Tattoo on right wrist',
 1.5, 'B.Com in Logistics, Diploma in Supply Chain', ARRAY['bcom_degree.pdf', 'diploma_certificate.pdf'], true, true, 'Logistics', 0.5, 1.0,
 NULL, 'Active', NULL, 'admin@ifsp.com', 'admin@ifsp.com', auth.uid()),

('EMP010', 'Deepak Verma', 'Male', '2019-09-15', 'Executive', '1986-06-08', 
 '2019-09-15', 'B+', '012345678901', 'JKLMN0123O', 'Hindu',
 'Ram Verma', 'Rekha Verma', 'Sunita Verma', 'Amit Verma', '2013-10-05', 'Priya Verma',
 '741 Admin Block, Corporate Office', '741 Admin Block, Corporate Office, Lucknow - 226001', '9876543228', '9876543229', 'Birthmark on neck',
 4.0, 'B.A in Administration, Diploma in Office Management', ARRAY['ba_degree.pdf', 'diploma_certificate.pdf'], true, true, 'Administration', 2.0, 2.0,
 NULL, 'Inactive', 'Personal reasons', 'admin@ifsp.com', 'admin@ifsp.com', auth.uid()),

('EMP011', 'Pooja Nair', 'Female', '2021-12-01', 'Executive', '1991-10-03', 
 '2021-12-01', 'O+', '123456789012', 'KLMNO1234P', 'Hindu',
 'Suresh Nair', 'Lakshmi Nair', 'Rajesh Nair', 'Arjun Nair', '2017-06-14', 'Anita Nair',
 '852 HR Building, Corporate Campus', '852 HR Building, Corporate Campus, Kochi - 682001', '9876543230', '9876543231', 'Small scar on left hand',
 3.0, 'MBA in HR, B.Com, Diploma in Psychology', ARRAY['mba_degree.pdf', 'bcom_degree.pdf', 'diploma_certificate.pdf'], true, true, 'HR', 1.5, 1.5,
 NULL, 'Active', NULL, 'admin@ifsp.com', 'admin@ifsp.com', auth.uid()),

('EMP012', 'Arjun Malhotra', 'Male', '2020-04-01', 'Manager', '1989-02-20', 
 '2020-04-01', 'A-', '234567890123', 'LMNOP2345Q', 'Hindu',
 'Vikram Malhotra', 'Kavita Malhotra', 'Priya Malhotra', 'Rohan Malhotra', '2016-08-22', 'Sneha Malhotra',
 '963 Finance Tower, Business District', '963 Finance Tower, Business District, Chandigarh - 160001', '9876543232', '9876543233', 'Beard',
 7.0, 'CA, MBA in Finance, B.Com', ARRAY['ca_certificate.pdf', 'mba_degree.pdf', 'bcom_degree.pdf'], true, true, 'Finance', 4.0, 3.0,
 NULL, 'Active', NULL, 'admin@ifsp.com', 'admin@ifsp.com', auth.uid()),

('EMP013', 'Meera Iyer', 'Female', '2023-03-01', 'Intern', '1994-12-15', 
 '2023-03-01', 'B+', '345678901234', 'MNOPQ3456R', 'Hindu',
 'Lakshmi Iyer', 'Rekha Iyer', NULL, NULL, NULL, NULL,
 '159 Intern Quarters, Tech Campus', '159 Intern Quarters, Tech Campus, Coimbatore - 641001', '9876543234', '9876543235', 'Glasses and braces',
 0.0, 'B.Tech in Computer Science, MCA', ARRAY['btech_degree.pdf', 'mca_degree.pdf'], true, true, 'IT', 0.0, 0.0,
 NULL, 'Active', NULL, 'admin@ifsp.com', 'admin@ifsp.com', auth.uid()),

('EMP014', 'Suresh Yadav', 'Male', '2018-01-10', 'Manager', '1982-07-28', 
 '2018-01-10', 'O+', '456789012345', 'NOPQR4567S', 'Hindu',
 'Ram Yadav', 'Geeta Yadav', 'Sunita Yadav', 'Amit Yadav', '2009-03-10', 'Priya Yadav',
 '357 Production Unit, Industrial Zone', '357 Production Unit, Industrial Zone, Kanpur - 208001', '9876543236', '9876543237', 'Mustache and beard',
 14.0, 'B.Tech in Production Engineering, MBA in Operations', ARRAY['btech_degree.pdf', 'mba_degree.pdf'], true, true, 'Production', 9.0, 5.0,
 NULL, 'Active', NULL, 'admin@ifsp.com', 'admin@ifsp.com', auth.uid()),

('EMP015', 'Rekha Chopra', 'Female', '2019-06-15', 'Senior Manager', '1984-11-05', 
 '2019-06-15', 'AB+', '567890123456', 'OPQRS5678T', 'Hindu',
 'Raj Chopra', 'Sunita Chopra', 'Amit Chopra', 'Rohit Chopra', '2011-12-08', 'Neha Chopra',
 '468 Sales Center, Commercial Hub', '468 Sales Center, Commercial Hub, Gurgaon - 122001', '9876543238', '9876543239', 'Small tattoo on ankle',
 11.0, 'MBA in Sales, B.Com, Diploma in Marketing', ARRAY['mba_degree.pdf', 'bcom_degree.pdf', 'diploma_certificate.pdf'], true, true, 'Sales', 6.0, 5.0,
 NULL, 'On Leave', 'Maternity leave', 'admin@ifsp.com', 'admin@ifsp.com', auth.uid());

-- ==============================================
-- Comments for Documentation
-- ==============================================

-- This seeder creates sample data for testing the IFSPL Employee Master system
-- It includes:
-- 1. 15 sample employees across different departments
-- 2. Complete data for all required columns
-- 3. Various employment statuses (Active, Inactive, On Leave)
-- 4. Different genders, blood groups, and religions
-- 5. Family information including spouse and children
-- 6. Complete contact and address information
-- 7. Professional qualifications and experience
-- 8. Document attachments array
-- 9. Reminder settings for birthdays and anniversaries
-- 10. Status change tracking with reasons
--
-- The data is designed to test:
-- - All column display and sorting
-- - Search functionality across multiple fields
-- - Department and status filtering
-- - Excel-like table functionality
-- - Status management and history tracking
-- - Family information management
-- - Document attachment handling
-- - Reminder system
--
-- Note: Replace auth.uid() with actual user ID when running this seeder
-- or ensure you're logged in as the user who will own this data

