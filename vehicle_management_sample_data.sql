-- Sample Data Seeder for Vehicle Management System
-- For INDUS ERP CORE - Fire Tender/Vehicle Management Module

-- ==============================================
-- Sample Drivers Data
-- ==============================================
INSERT INTO drivers (employee_id, full_name, contact_number, email, license_number, license_type, license_expiry_date, department, designation, is_active, user_id) VALUES
('EMP001', 'Rajesh Kumar', '9876543210', 'rajesh.kumar@indus.com', 'DL123456789', 'LMV (Light Motor Vehicle)', '2025-12-31', 'Transport', 'Senior Driver', true, auth.uid()),
('EMP002', 'Suresh Singh', '9876543211', 'suresh.singh@indus.com', 'DL123456790', 'HMV (Heavy Motor Vehicle)', '2025-11-15', 'Transport', 'Driver', true, auth.uid()),
('EMP003', 'Amit Sharma', '9876543212', 'amit.sharma@indus.com', 'DL123456791', 'LMV (Light Motor Vehicle)', '2025-10-20', 'Transport', 'Driver', true, auth.uid()),
('EMP004', 'Vikram Patel', '9876543213', 'vikram.patel@indus.com', 'DL123456792', 'HMV (Heavy Motor Vehicle)', '2025-09-30', 'Transport', 'Senior Driver', true, auth.uid()),
('EMP005', 'Manoj Gupta', '9876543214', 'manoj.gupta@indus.com', 'DL123456793', 'Motorcycle', '2025-08-25', 'Transport', 'Driver', false, auth.uid());

-- ==============================================
-- Sample Vehicles Data
-- ==============================================
INSERT INTO vehicles_master (vehicle_type, registration_number, chassis_number, engine_number, make, model, year_of_manufacture, date_of_purchase, date_of_commissioning, assigned_location, assigned_site, assigned_department, assigned_driver_id, vehicle_status, current_odometer_reading, last_service_date, next_service_due, remarks, user_id) VALUES
('Fire Tender', 'MH01AB1234', 'CH123456789', 'ENG123456789', 'Tata', 'Fire Tender Model X', 2020, '2020-03-15', '2020-04-01', 'Mumbai', 'Main Office', 'Fire Safety', (SELECT id FROM drivers WHERE employee_id = 'EMP001' LIMIT 1), 'Available', 45000, '2024-01-15', '2024-07-15', 'Primary fire tender for main office', auth.uid()),

('SUV', 'MH01CD5678', 'CH123456790', 'ENG123456790', 'Mahindra', 'Scorpio', 2021, '2021-06-20', '2021-07-01', 'Mumbai', 'Main Office', 'Transport', (SELECT id FROM drivers WHERE employee_id = 'EMP002' LIMIT 1), 'On Duty', 32000, '2024-02-10', '2024-08-10', 'Executive vehicle', auth.uid()),

('Car', 'MH01EF9012', 'CH123456791', 'ENG123456791', 'Maruti', 'Swift', 2022, '2022-01-10', '2022-01-15', 'Mumbai', 'Branch Office', 'Transport', (SELECT id FROM drivers WHERE employee_id = 'EMP003' LIMIT 1), 'Available', 18000, '2024-03-05', '2024-09-05', 'Branch office vehicle', auth.uid()),

('Command Post', 'MH01GH3456', 'CH123456792', 'ENG123456792', 'Ashok Leyland', 'Command Post', 2019, '2019-11-25', '2019-12-01', 'Mumbai', 'Main Office', 'Fire Safety', (SELECT id FROM drivers WHERE employee_id = 'EMP004' LIMIT 1), 'Under Maintenance', 55000, '2024-01-20', '2024-07-20', 'Command post vehicle', auth.uid()),

('Water Tanker', 'MH01IJ7890', 'CH123456793', 'ENG123456793', 'Tata', 'Water Tanker', 2020, '2020-08-15', '2020-09-01', 'Mumbai', 'Main Office', 'Fire Safety', null, 'Available', 38000, '2024-02-28', '2024-08-28', 'Water tanker for fire operations', auth.uid());

-- ==============================================
-- Sample Vehicle Documents Data
-- ==============================================
INSERT INTO vehicle_documents (vehicle_id, document_type, document_number, issue_date, expiry_date, provider, premium_amount, alert_status, remarks, user_id) VALUES
((SELECT id FROM vehicles_master WHERE registration_number = 'MH01AB1234' LIMIT 1), 'RC (Registration Certificate)', 'RC123456789', '2020-03-15', '2030-03-15', 'RTO Mumbai', null, 'Active', 'Original RC', auth.uid()),

((SELECT id FROM vehicles_master WHERE registration_number = 'MH01AB1234' LIMIT 1), 'Insurance', 'INS123456789', '2024-01-01', '2025-01-01', 'Bajaj Allianz', 25000, 'Active', 'Comprehensive insurance', auth.uid()),

((SELECT id FROM vehicles_master WHERE registration_number = 'MH01AB1234' LIMIT 1), 'Pollution Certificate', 'PC123456789', '2024-01-15', '2024-07-15', 'Pollution Control Board', 500, 'Warning', 'Pollution certificate', auth.uid()),

((SELECT id FROM vehicles_master WHERE registration_number = 'MH01AB1234' LIMIT 1), 'Fitness Certificate', 'FC123456789', '2024-01-01', '2025-01-01', 'RTO Mumbai', 1000, 'Active', 'Annual fitness certificate', auth.uid()),

((SELECT id FROM vehicles_master WHERE registration_number = 'MH01CD5678' LIMIT 1), 'RC (Registration Certificate)', 'RC123456790', '2021-06-20', '2031-06-20', 'RTO Mumbai', null, 'Active', 'Original RC', auth.uid()),

((SELECT id FROM vehicles_master WHERE registration_number = 'MH01CD5678' LIMIT 1), 'Insurance', 'INS123456790', '2024-02-01', '2025-02-01', 'ICICI Lombard', 18000, 'Active', 'Comprehensive insurance', auth.uid()),

((SELECT id FROM vehicles_master WHERE registration_number = 'MH01CD5678' LIMIT 1), 'Pollution Certificate', 'PC123456790', '2024-02-15', '2024-08-15', 'Pollution Control Board', 500, 'Active', 'Pollution certificate', auth.uid()),

((SELECT id FROM vehicles_master WHERE registration_number = 'MH01EF9012' LIMIT 1), 'RC (Registration Certificate)', 'RC123456791', '2022-01-10', '2032-01-10', 'RTO Mumbai', null, 'Active', 'Original RC', auth.uid()),

((SELECT id FROM vehicles_master WHERE registration_number = 'MH01EF9012' LIMIT 1), 'Insurance', 'INS123456791', '2024-03-01', '2025-03-01', 'HDFC Ergo', 12000, 'Active', 'Comprehensive insurance', auth.uid()),

((SELECT id FROM vehicles_master WHERE registration_number = 'MH01GH3456' LIMIT 1), 'RC (Registration Certificate)', 'RC123456792', '2019-11-25', '2029-11-25', 'RTO Mumbai', null, 'Active', 'Original RC', auth.uid()),

((SELECT id FROM vehicles_master WHERE registration_number = 'MH01GH3456' LIMIT 1), 'Insurance', 'INS123456792', '2023-12-01', '2024-12-01', 'New India Assurance', 35000, 'Warning', 'Comprehensive insurance', auth.uid()),

((SELECT id FROM vehicles_master WHERE registration_number = 'MH01IJ7890' LIMIT 1), 'RC (Registration Certificate)', 'RC123456793', '2020-08-15', '2030-08-15', 'RTO Mumbai', null, 'Active', 'Original RC', auth.uid()),

((SELECT id FROM vehicles_master WHERE registration_number = 'MH01IJ7890' LIMIT 1), 'Insurance', 'INS123456793', '2024-01-15', '2025-01-15', 'Oriental Insurance', 28000, 'Active', 'Comprehensive insurance', auth.uid());

-- ==============================================
-- Sample Vehicle Maintenance Data
-- ==============================================
INSERT INTO vehicle_maintenance (vehicle_id, service_date, vendor, service_type, cost, odometer_reading, nature_of_repair, parts_replaced, next_service_due, remarks, attachment_url, user_id) VALUES
((SELECT id FROM vehicles_master WHERE registration_number = 'MH01AB1234' LIMIT 1), '2024-01-15', 'Tata Service Center', 'Regular Service', 8500, 44000, 'Regular maintenance service', 'Oil filter, Air filter, Brake pads', '2024-07-15', 'Regular service completed', 'https://example.com/service-receipt-1.pdf', auth.uid()),

((SELECT id FROM vehicles_master WHERE registration_number = 'MH01AB1234' LIMIT 1), '2023-12-10', 'Tata Service Center', 'Repair', 15000, 42000, 'Engine overhaul', 'Piston rings, Gasket set, Timing belt', '2024-01-15', 'Major engine repair', 'https://example.com/service-receipt-2.pdf', auth.uid()),

((SELECT id FROM vehicles_master WHERE registration_number = 'MH01CD5678' LIMIT 1), '2024-02-10', 'Mahindra Service Center', 'Regular Service', 6500, 31000, 'Regular maintenance service', 'Oil filter, Air filter', '2024-08-10', 'Regular service completed', 'https://example.com/service-receipt-3.pdf', auth.uid()),

((SELECT id FROM vehicles_master WHERE registration_number = 'MH01CD5678' LIMIT 1), '2023-11-20', 'Mahindra Service Center', 'Repair', 12000, 29000, 'Transmission repair', 'Clutch plate, Pressure plate', '2024-02-10', 'Transmission repair completed', 'https://example.com/service-receipt-4.pdf', auth.uid()),

((SELECT id FROM vehicles_master WHERE registration_number = 'MH01EF9012' LIMIT 1), '2024-03-05', 'Maruti Service Center', 'Regular Service', 4500, 17500, 'Regular maintenance service', 'Oil filter, Air filter, Spark plugs', '2024-09-05', 'Regular service completed', 'https://example.com/service-receipt-5.pdf', auth.uid()),

((SELECT id FROM vehicles_master WHERE registration_number = 'MH01GH3456' LIMIT 1), '2024-01-20', 'Ashok Leyland Service Center', 'Emergency Repair', 25000, 54000, 'Hydraulic system repair', 'Hydraulic pump, Hoses, Seals', '2024-07-20', 'Emergency hydraulic repair', 'https://example.com/service-receipt-6.pdf', auth.uid()),

((SELECT id FROM vehicles_master WHERE registration_number = 'MH01IJ7890' LIMIT 1), '2024-02-28', 'Tata Service Center', 'Regular Service', 12000, 37500, 'Regular maintenance service', 'Oil filter, Air filter, Fuel filter', '2024-08-28', 'Regular service completed', 'https://example.com/service-receipt-7.pdf', auth.uid());

-- ==============================================
-- Sample Vehicle Trips Data
-- ==============================================
INSERT INTO vehicle_trips (vehicle_id, trip_purpose, issued_to_name, issued_to_department, issued_to_contact, start_date_time, end_date_time, origin_location, destination_location, odometer_start, odometer_end, fuel_added, fuel_cost, trip_status, approved_by, approval_date, remarks, user_id) VALUES
((SELECT id FROM vehicles_master WHERE registration_number = 'MH01CD5678' LIMIT 1), 'Official Duty', 'Rajesh Kumar', 'Transport', '9876543210', '2024-03-15 09:00:00', '2024-03-15 17:00:00', 'Mumbai Office', 'Pune Office', 32000, 32250, 25, 2500, 'Completed', 'Transport Manager', '2024-03-15 08:30:00', 'Official visit to Pune office', auth.uid()),

((SELECT id FROM vehicles_master WHERE registration_number = 'MH01AB1234' LIMIT 1), 'Site Visit', 'Suresh Singh', 'Fire Safety', '9876543211', '2024-03-16 10:00:00', null, 'Mumbai Office', 'Construction Site - Bandra', 45000, null, 0, 0, 'Active', 'Fire Safety Manager', '2024-03-16 09:30:00', 'Fire safety inspection at construction site', auth.uid()),

((SELECT id FROM vehicles_master WHERE registration_number = 'MH01EF9012' LIMIT 1), 'Client Delivery', 'Amit Sharma', 'Transport', '9876543212', '2024-03-14 14:00:00', '2024-03-14 18:00:00', 'Branch Office', 'Client Location - Andheri', 18000, 18080, 15, 1500, 'Completed', 'Branch Manager', '2024-03-14 13:30:00', 'Document delivery to client', auth.uid()),

((SELECT id FROM vehicles_master WHERE registration_number = 'MH01IJ7890' LIMIT 1), 'Training', 'Vikram Patel', 'Fire Safety', '9876543213', '2024-03-17 08:00:00', null, 'Mumbai Office', 'Training Center - Thane', 38000, null, 0, 0, 'Active', 'Fire Safety Manager', '2024-03-17 07:30:00', 'Fire safety training session', auth.uid()),

((SELECT id FROM vehicles_master WHERE registration_number = 'MH01CD5678' LIMIT 1), 'Logistics', 'Rajesh Kumar', 'Transport', '9876543210', '2024-03-13 11:00:00', '2024-03-13 15:00:00', 'Mumbai Office', 'Warehouse - Navi Mumbai', 31900, 32000, 20, 2000, 'Completed', 'Transport Manager', '2024-03-13 10:30:00', 'Equipment pickup from warehouse', auth.uid());

-- ==============================================
-- Update Alert Status for Documents
-- ==============================================
UPDATE vehicle_documents 
SET alert_status = CASE 
    WHEN expiry_date < CURRENT_DATE THEN 'Expired'
    WHEN expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'Warning'
    ELSE 'Active'
END
WHERE user_id = auth.uid();

-- ==============================================
-- Comments for Documentation
-- ==============================================

-- This seeder creates sample data for testing the Vehicle Management System
-- It includes:
-- 1. 5 sample drivers with different license types and expiry dates
-- 2. 5 sample vehicles including Fire Tender, SUV, Car, Command Post, and Water Tanker
-- 3. 13 sample documents with different expiry dates and alert statuses
-- 4. 7 sample maintenance records with different service types
-- 5. 5 sample trips with different purposes and statuses
-- 
-- The data is designed to test:
-- - Dashboard summary cards
-- - Document expiry alerts
-- - Maintenance scheduling
-- - Trip management
-- - Driver assignment
-- - Vehicle status tracking
--
-- Note: Replace auth.uid() with actual user ID when running this seeder
-- or ensure you're logged in as the user who will own this data
