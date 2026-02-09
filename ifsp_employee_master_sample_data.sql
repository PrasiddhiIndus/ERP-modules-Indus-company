-- Sample Data Seeder for IFSPL Employee Master
-- For INDUS ERP CORE - Admin Module

-- ==============================================
-- Sample IFSPL Employees Data
-- ==============================================
INSERT INTO ifsp_employees (
    employee_id, first_name, last_name, email, phone, date_of_birth, date_of_joining,
    department, designation, reporting_manager, employment_type, status, basic_salary,
    address, emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
    qualifications, skills, previous_experience, notes, user_id
) VALUES
('EMP001', 'Rajesh', 'Kumar', 'rajesh.kumar@ifsp.com', '9876543210', '1985-03-15', '2020-01-15',
 'HR', 'Manager', 'CEO', 'Full Time', 'Active', 75000,
 '123 Main Street, Mumbai', 'Sita Kumar', '9876543211', 'Wife',
 'MBA in HR, B.Com', 'Leadership, Communication, HR Management', 8.5,
 'Experienced HR professional with strong leadership skills', auth.uid()),

('EMP002', 'Priya', 'Sharma', 'priya.sharma@ifsp.com', '9876543212', '1990-07-22', '2021-06-01',
 'Finance', 'Senior Executive', 'Rajesh Kumar', 'Full Time', 'Active', 45000,
 '456 Park Avenue, Delhi', 'Ravi Sharma', '9876543213', 'Brother',
 'CA, B.Com', 'Accounting, Financial Analysis, Excel', 5.0,
 'Chartered Accountant with expertise in financial analysis', auth.uid()),

('EMP003', 'Amit', 'Patel', 'amit.patel@ifsp.com', '9876543214', '1988-11-10', '2019-03-10',
 'Operations', 'Senior Manager', 'CEO', 'Full Time', 'Active', 85000,
 '789 Business District, Bangalore', 'Sunita Patel', '9876543215', 'Wife',
 'MBA in Operations, B.Tech', 'Operations Management, Process Improvement, Team Leadership', 10.0,
 'Operations expert with strong process improvement skills', auth.uid()),

('EMP004', 'Sneha', 'Gupta', 'sneha.gupta@ifsp.com', '9876543216', '1992-05-18', '2022-02-01',
 'Sales', 'Executive', 'Amit Patel', 'Full Time', 'Active', 35000,
 '321 Sales Street, Chennai', 'Vikram Gupta', '9876543217', 'Husband',
 'BBA in Marketing', 'Sales, Customer Relations, CRM', 2.5,
 'Young and energetic sales professional', auth.uid()),

('EMP005', 'Ravi', 'Singh', 'ravi.singh@ifsp.com', '9876543218', '1983-12-05', '2018-08-15',
 'IT', 'Senior Developer', 'CTO', 'Full Time', 'Active', 65000,
 '654 Tech Park, Hyderabad', 'Meera Singh', '9876543219', 'Wife',
 'M.Tech in Computer Science, B.Tech', 'Full Stack Development, React, Node.js, Python', 12.0,
 'Senior developer with expertise in modern web technologies', auth.uid()),

('EMP006', 'Anita', 'Joshi', 'anita.joshi@ifsp.com', '9876543220', '1995-09-12', '2023-01-10',
 'Marketing', 'Trainee', 'Priya Sharma', 'Full Time', 'Active', 25000,
 '987 Marketing Lane, Pune', 'Raj Joshi', '9876543221', 'Father',
 'MBA in Marketing, B.Com', 'Digital Marketing, Social Media, Content Creation', 0.5,
 'Fresh MBA graduate with strong digital marketing skills', auth.uid()),

('EMP007', 'Vikram', 'Reddy', 'vikram.reddy@ifsp.com', '9876543222', '1987-04-25', '2020-11-01',
 'Production', 'Supervisor', 'Amit Patel', 'Full Time', 'Active', 40000,
 '147 Industrial Area, Ahmedabad', 'Lakshmi Reddy', '9876543223', 'Wife',
 'B.Tech in Mechanical Engineering', 'Production Management, Quality Control, Safety', 6.0,
 'Production supervisor with strong technical background', auth.uid()),

('EMP008', 'Sunita', 'Mehta', 'sunita.mehta@ifsp.com', '9876543224', '1980-08-30', '2017-05-20',
 'Quality Control', 'Manager', 'Amit Patel', 'Full Time', 'Active', 70000,
 '258 Quality Street, Jaipur', 'Arun Mehta', '9876543225', 'Husband',
 'M.Tech in Quality Management, B.Tech', 'Quality Assurance, ISO Standards, Process Control', 15.0,
 'Quality management expert with extensive experience', auth.uid()),

('EMP009', 'Kiran', 'Agarwal', 'kiran.agarwal@ifsp.com', '9876543226', '1993-01-14', '2022-07-01',
 'Logistics', 'Coordinator', 'Vikram Reddy', 'Full Time', 'Active', 30000,
 '369 Logistics Hub, Indore', 'Suresh Agarwal', '9876543227', 'Father',
 'B.Com in Logistics', 'Supply Chain, Inventory Management, Transportation', 1.5,
 'Logistics coordinator with good organizational skills', auth.uid()),

('EMP010', 'Deepak', 'Verma', 'deepak.verma@ifsp.com', '9876543228', '1986-06-08', '2019-09-15',
 'Administration', 'Executive', 'Rajesh Kumar', 'Full Time', 'Inactive', 32000,
 '741 Admin Block, Lucknow', 'Rekha Verma', '9876543229', 'Wife',
 'B.A in Administration', 'Administrative Support, Office Management, Communication', 4.0,
 'Administrative executive currently on leave', auth.uid()),

('EMP011', 'Pooja', 'Nair', 'pooja.nair@ifsp.com', '9876543230', '1991-10-03', '2021-12-01',
 'HR', 'Executive', 'Rajesh Kumar', 'Contract', 'Active', 28000,
 '852 HR Building, Kochi', 'Suresh Nair', '9876543231', 'Father',
 'MBA in HR, B.Com', 'Recruitment, Employee Relations, Training', 3.0,
 'Contract HR executive specializing in recruitment', auth.uid()),

('EMP012', 'Arjun', 'Malhotra', 'arjun.malhotra@ifsp.com', '9876543232', '1989-02-20', '2020-04-01',
 'Finance', 'Manager', 'CEO', 'Full Time', 'Active', 80000,
 '963 Finance Tower, Chandigarh', 'Kavita Malhotra', '9876543233', 'Wife',
 'CA, MBA in Finance', 'Financial Planning, Budgeting, Risk Management', 7.0,
 'Finance manager with strong analytical skills', auth.uid()),

('EMP013', 'Meera', 'Iyer', 'meera.iyer@ifsp.com', '9876543234', '1994-12-15', '2023-03-01',
 'IT', 'Intern', 'Ravi Singh', 'Intern', 'Active', 15000,
 '159 Intern Quarters, Coimbatore', 'Lakshmi Iyer', '9876543235', 'Mother',
 'B.Tech in Computer Science', 'Web Development, Database Management, Learning', 0.0,
 'Recent graduate doing internship in IT department', auth.uid()),

('EMP014', 'Suresh', 'Yadav', 'suresh.yadav@ifsp.com', '9876543236', '1982-07-28', '2018-01-10',
 'Production', 'Manager', 'Amit Patel', 'Full Time', 'Active', 90000,
 '357 Production Unit, Kanpur', 'Geeta Yadav', '9876543237', 'Wife',
 'B.Tech in Production Engineering', 'Production Planning, Team Management, Efficiency', 14.0,
 'Production manager with extensive manufacturing experience', auth.uid()),

('EMP015', 'Rekha', 'Chopra', 'rekha.chopra@ifsp.com', '9876543238', '1984-11-05', '2019-06-15',
 'Sales', 'Senior Manager', 'CEO', 'Full Time', 'On Leave', 75000,
 '468 Sales Center, Gurgaon', 'Raj Chopra', '9876543239', 'Husband',
 'MBA in Sales, B.Com', 'Sales Strategy, Team Leadership, Client Relations', 11.0,
 'Senior sales manager currently on maternity leave', auth.uid());

-- ==============================================
-- Comments for Documentation
-- ==============================================

-- This seeder creates sample data for testing the IFSPL Employee Master system
-- It includes:
-- 1. 15 sample employees across different departments
-- 2. Various employment types (Full Time, Contract, Intern)
-- 3. Different statuses (Active, Inactive, On Leave)
-- 4. Complete personal and professional information
-- 5. Emergency contact details
-- 6. Qualifications and skills
-- 7. Salary information
-- 8. Reporting relationships
--
-- The data is designed to test:
-- - Employee CRUD operations
-- - Department-wise filtering
-- - Status-based filtering
-- - Search functionality
-- - Reporting relationships
-- - Salary management
-- - Emergency contact management
--
-- Note: Replace auth.uid() with actual user ID when running this seeder
-- or ensure you're logged in as the user who will own this data

