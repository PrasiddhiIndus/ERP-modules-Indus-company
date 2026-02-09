# Fire Tender/Vehicle Management System

A comprehensive fleet management system built for INDUS ERP CORE, designed to manage vehicles, drivers, maintenance, documents, and operational tracking.

## 🚗 Features

### 📊 Dashboard
- **Real-time Overview**: Live operational view of fleet status
- **Summary Cards**: Total vehicles, available, on duty, under maintenance, expired documents
- **Recent Activity**: Active trips and upcoming document expiries
- **Quick Actions**: Easy access to common operations

### 🚙 Vehicle Master Database
- **Complete Vehicle Records**: Type, registration, chassis, engine numbers
- **Assignment Management**: Location, site, department, driver assignment
- **Status Tracking**: Available, On Duty, Under Maintenance, Out for Repair, Rented, Decommissioned
- **Odometer Management**: Current reading, service tracking
- **CRUD Operations**: Full create, read, update, delete functionality

### 🗺️ Vehicle Trips Management
- **Trip Tracking**: Purpose, issued to, start/end times, route details
- **Odometer Tracking**: Start and end readings for each trip
- **Fuel Management**: Fuel added and cost tracking
- **Status Management**: Active, Completed, Cancelled trips
- **Approval Workflow**: Digital approval and signature support

### 📄 Document Management
- **Document Types**: RC, Insurance, Pollution Certificate, Fitness Certificate, Permit, AMC
- **Expiry Alerts**: Automatic color-coded alerts (Active, Warning, Expired)
- **Provider Tracking**: Insurance providers, issuing authorities
- **File Management**: URL-based document storage
- **Premium Tracking**: Insurance premium amounts

### 🔧 Maintenance Tracking
- **Service Records**: Date, vendor, cost, odometer reading
- **Service Types**: Regular Service, Repair, AMC Service, Emergency Repair
- **Parts Management**: Parts replaced tracking
- **Next Service Scheduling**: Automatic due date calculation
- **Receipt Management**: Service receipt/invoice storage

### 👥 Driver Management
- **Driver Profiles**: Personal information, contact details
- **License Management**: License number, type, expiry tracking
- **Department Assignment**: Department and designation tracking
- **Status Management**: Active/Inactive driver status
- **Vehicle Assignment**: Driver-vehicle relationship management

## 🗄️ Database Schema

### Core Tables

1. **vehicles_master**: Master vehicle database
2. **vehicle_documents**: Document tracking with expiry alerts
3. **vehicle_maintenance**: Maintenance history and service records
4. **vehicle_trips**: Trip and usage tracking
5. **drivers**: Driver/employee information

### Key Features
- **Row Level Security (RLS)**: User-specific data isolation
- **Foreign Key Relationships**: Proper data integrity
- **Indexes**: Optimized for performance
- **Alert Functions**: Automatic expiry status updates

## 🚀 Getting Started

### Prerequisites
- Node.js and npm
- Supabase account and project
- PostgreSQL database access

### Installation

1. **Database Setup**
   ```sql
   -- Run the schema creation script
   \i vehicle_management_schema.sql
   
   -- Optional: Load sample data for testing
   \i vehicle_management_sample_data.sql
   ```

2. **Environment Configuration**
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

3. **Component Integration**
   ```jsx
   import FireTenderVehicleManagement from './pages/fireTenderVehicle/FireTenderVehicleManagement';
   
   // Add to your routing
   <Route path="/fire-tender-vehicle" element={<FireTenderVehicleManagement />} />
   ```

## 📱 User Interface

### Navigation Structure
- **Dashboard**: Overview and quick actions
- **Vehicle Master**: Vehicle database management
- **Vehicle Trips**: Trip tracking and management
- **Documents**: Document management with alerts
- **Maintenance**: Service and maintenance tracking
- **Driver Management**: Driver information management

### Design Features
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Color-coded Status**: Visual indicators for different states
- **Search and Filter**: Advanced filtering capabilities
- **Modal Forms**: Clean, user-friendly data entry
- **Export Functionality**: Data export capabilities

## 🔧 Technical Specifications

### Frontend
- **React.js**: Modern component-based architecture
- **Tailwind CSS**: Utility-first styling framework
- **Lucide React**: Consistent icon library
- **Responsive Design**: Mobile-first approach

### Backend
- **Supabase**: Backend-as-a-Service platform
- **PostgreSQL**: Robust relational database
- **Row Level Security**: Data isolation and security
- **Real-time Updates**: Live data synchronization

### Key Functions
- **Alert Management**: Automatic document expiry tracking
- **Status Updates**: Real-time vehicle status changes
- **Data Validation**: Form validation and error handling
- **Export Capabilities**: Excel/PDF export functionality

## 📊 Dashboard Features

### Summary Cards
- **Total Vehicles**: Complete fleet count
- **Available**: Ready for assignment
- **On Duty**: Currently in use
- **Under Maintenance**: Service/repair status
- **Active Trips**: Currently active trips
- **Active Drivers**: Available drivers
- **Expired Documents**: Documents requiring attention
- **Upcoming Expiries**: Documents expiring soon

### Live Views
- **Recent Active Trips**: Current trip status
- **Upcoming Document Expiries**: Alert management
- **Quick Actions**: Common operations

## 🚨 Alert System

### Document Expiry Alerts
- **Active**: More than 30 days until expiry
- **Warning**: 30 days or less until expiry
- **Expired**: Past expiry date

### Maintenance Alerts
- **Service Due**: Upcoming service dates
- **Overdue**: Past due service dates
- **Emergency**: Critical maintenance required

## 🔐 Security Features

### Row Level Security (RLS)
- User-specific data isolation
- Secure data access controls
- Multi-tenant architecture support

### Data Validation
- Form validation on frontend
- Database constraints on backend
- Error handling and user feedback

## 📈 Future Enhancements

### Planned Features
- **GPS Tracking**: Real-time vehicle location
- **IoT Integration**: Sensor data collection
- **Predictive Maintenance**: AI-powered maintenance scheduling
- **Mobile App**: Native mobile application
- **Advanced Analytics**: Detailed reporting and insights
- **Integration**: HR, Finance, and other ERP modules

### API Endpoints
- RESTful API for external integrations
- Webhook support for real-time updates
- Bulk data import/export capabilities

## 🛠️ Development

### Code Structure
```
src/pages/fireTenderVehicle/
├── FireTenderVehicleManagement.jsx    # Main component
├── VehicleManagementDashboard.jsx     # Dashboard
├── VehicleMaster.jsx                  # Vehicle CRUD
├── VehicleTrips.jsx                   # Trip management
├── VehicleDocuments.jsx               # Document management
├── VehicleMaintenance.jsx             # Maintenance tracking
└── DriverManagement.jsx               # Driver management
```

### Database Files
```
sql/
├── vehicle_management_schema.sql       # Database schema
└── vehicle_management_sample_data.sql # Sample data
```

## 📞 Support

For technical support or feature requests, please contact the development team or create an issue in the project repository.

## 📄 License

This project is part of INDUS ERP CORE and is proprietary software. All rights reserved.

---

**Built with ❤️ for INDUS ERP CORE**
