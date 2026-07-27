import { formatDateDdMmYyyy } from '../../utils/dateDisplay';
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { withFleetVehicleCategoryFilter, withFleetMasterCategoryFilter } from './fleetLoadUtils';
import { uploadFleetFileToR2, buildFleetUploadSegment, presignFleetR2Get } from '../../lib/fleetR2';
import FleetAttachmentUploader from './FleetAttachmentUploader';
import FormDateInput from "../../components/FormDateInput";
import {
  fetchEmployeeMasterDepartments,
  mergeEmployeeMasterDepartments,
} from '../../lib/employeeMasterDepartments';

import { 
  MapPin, 
  Plus, 
  Edit, 
  Trash2, 
  Search, 
  Filter,
  Download,
  Clock,
  CheckCircle,
  XCircle,
  User,
  Car,
  Calendar,
  Fuel,
  FileText,
  Eye
} from 'lucide-react';

const parseTripR2Keys = (row) => {
  const raw = row?.expense_attachments;
  if (!Array.isArray(raw)) return [];
  return raw.filter((k) => String(k).trim().startsWith('fleet/'));
};

const extractTimeFromDateTime = (value) => {
  if (!value) return '';
  const match = String(value).match(/T(\d{2}:\d{2})/);
  if (match) return match[1];
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const formatDurationFromTimes = (outTime, inTime) => {
  if (!outTime || !inTime) return '';
  const [oh, om] = outTime.split(':').map(Number);
  const [ih, im] = inTime.split(':').map(Number);
  if ([oh, om, ih, im].some((n) => Number.isNaN(n))) return '';
  let mins = (ih * 60 + im) - (oh * 60 + om);
  if (mins < 0) mins += 24 * 60;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
};

const formatOdometerDifference = (kmOut, kmIn) => {
  if (kmOut === '' || kmOut == null || kmIn === '' || kmIn == null) return '';
  const out = parseFloat(kmOut);
  const inn = parseFloat(kmIn);
  if (Number.isNaN(out) || Number.isNaN(inn)) return '';
  const diff = inn - out;
  return Number.isInteger(diff) ? String(diff) : String(Math.round(diff * 10) / 10);
};

const getTripKmOut = (trip) => trip?.km_at_mobilisation_out ?? trip?.odometer_start ?? null;
const getTripKmIn = (trip) => trip?.km_at_demobilisation_in ?? trip?.odometer_end ?? null;

const getTripOutTime = (trip) => extractTimeFromDateTime(trip?.start_date_time);
const getTripInTime = (trip) => extractTimeFromDateTime(trip?.end_date_time);

const getTripTimeDifference = (trip) => {
  const out = getTripOutTime(trip);
  const inn = getTripInTime(trip);
  if (!out || !inn) return '';
  return formatDurationFromTimes(out, inn);
};

const getTripOdometerDifference = (trip) => formatOdometerDifference(getTripKmOut(trip), getTripKmIn(trip));

const formatKmDisplay = (value) => {
  if (value === '' || value == null) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
};

const attachmentFileLabel = (key, index) => {
  const parts = String(key || '').split('/');
  const name = parts[parts.length - 1] || `File ${index + 1}`;
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
};

const toIsoDateOrNull = (value) => {
  const s = String(value || '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

const toNumberOrNull = (value) => {
  if (value === '' || value == null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

const formatTripSaveError = (error) => {
  if (!error) return 'Unknown error';
  const parts = [error.message, error.details, error.hint, error.code ? `(${error.code})` : '']
    .map((p) => String(p || '').trim())
    .filter(Boolean);
  return parts.join(' — ') || 'Failed to save trip';
};

const combineVisitDateAndTime = (visitDate, time) => {
  const dateIso = toIsoDateOrNull(visitDate);
  if (!dateIso) return null;
  const normalizedTime = time && /^\d{2}:\d{2}$/.test(String(time).trim()) ? String(time).trim() : '00:00';
  return `${dateIso}T${normalizedTime}:00`;
};

const addOneCalendarDay = (dateIso) => {
  const [y, m, d] = String(dateIso).split('-').map(Number);
  if (![y, m, d].every((n) => Number.isFinite(n))) return dateIso;
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

const combineInHouseEndDateTime = (visitDate, outTime, inTime) => {
  const dateIso = toIsoDateOrNull(visitDate);
  const time = String(inTime || '').trim();
  if (!dateIso || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [oh, om] = String(outTime || '').split(':').map(Number);
  const [ih, im] = time.split(':').map(Number);
  const overnight =
    Number.isFinite(oh) &&
    Number.isFinite(om) &&
    Number.isFinite(ih) &&
    Number.isFinite(im) &&
    ih * 60 + im < oh * 60 + om;
  const datePart = overnight ? addOneCalendarDay(dateIso) : dateIso;
  return `${datePart}T${time}:00`;
};

const VehicleTrips = ({ vehicleCategory = 'in-house' }) => {
  const [trips, setTrips] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTrip, setEditingTrip] = useState(null);
  const [pendingAttachmentFiles, setPendingAttachmentFiles] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [purposeFilter, setPurposeFilter] = useState('All');
  const [departmentOptions, setDepartmentOptions] = useState(() => mergeEmployeeMasterDepartments([]));
  const [departmentSearch, setDepartmentSearch] = useState('');
  const [filesModalTrip, setFilesModalTrip] = useState(null);

  const [formData, setFormData] = useState({
    assignment_type: 'in-house',
    driver_name: '',
    vehicle_id: '',
    deployment_location: '',
    site_name: '',
    date_of_mobilisation: '',
    km_out: '',
    km_in: '',
    contract_start_date: '',
    contract_end_date: '',
    notes: '',
    responsible_person: '',
    site_visit_location: '',
    number_of_passengers: '',
    visit_date: '',
    visit_duration_days: '',
    out_time: '',
    in_time: '',
    departments_allotted: [],
    expense_attachments: [],
    remarks: '',
    trip_purpose: '',
    issued_to_name: '',
    issued_to_department: '',
    start_date_time: '',
    end_date_time: '',
    origin_location: '',
    destination_location: '',
    odometer_start: '',
    odometer_end: '',
    trip_status: 'Active',
    approved_by: ''
  });

  const tripPurposes = [
    'Fire Tender Vehicle Assignment',
    'In-House Vehicle Assignment'
  ];
  const fireTenderVehicleTypes = [
    'Multipurpose',
    'Foam Tender',
    'DCP Tender',
    'Water Bowser',
    'Quick Response Vehicle',
    'Water Mist'
  ];

  const tripStatuses = ['Active', 'Completed', 'Cancelled'];

  const filteredDepartmentOptions = useMemo(() => {
    const needle = departmentSearch.trim().toLowerCase();
    if (!needle) return departmentOptions;
    return departmentOptions.filter((dept) => dept.toLowerCase().includes(needle));
  }, [departmentOptions, departmentSearch]);

  const timeDifferenceLabel = formatDurationFromTimes(formData.out_time, formData.in_time);
  const odometerDifferenceLabel = formatOdometerDifference(formData.km_out, formData.km_in);

  useEffect(() => {
    fetchTrips();
    fetchVehicles();
    fetchDrivers();
  }, [vehicleCategory]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fromDb = await fetchEmployeeMasterDepartments(supabase);
        if (!cancelled) setDepartmentOptions(fromDb);
      } catch (error) {
        console.error('Error fetching departments:', error);
        if (!cancelled) setDepartmentOptions(mergeEmployeeMasterDepartments([]));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const setVehicleStatus = async (vehicleId, status) => {
    if (!vehicleId) return;
    const { error } = await supabase
      .from('operations_fire_tender_vehicle_master')
      .update({ vehicle_status: status })
      .eq('id', vehicleId);
    if (error) throw error;
  };

  const fetchTrips = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await withFleetMasterCategoryFilter(
        supabase
          .from('operations_fire_tender_vehicle_trips')
          .select(`
          *,
          operations_fire_tender_vehicle_master!inner(registration_number, vehicle_type)
        `)
          .order('start_date_time', { ascending: false }),
        vehicleCategory
      );

      if (error) throw error;
      setTrips(data || []);
    } catch (error) {
      console.error('Error fetching trips:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchVehicles = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await withFleetVehicleCategoryFilter(
        supabase
          .from('operations_fire_tender_vehicle_master')
          .select('id, registration_number, vehicle_type, make, model, vehicle_status')
          .in('vehicle_status', ['Available', 'On Duty'])
          .order('registration_number'),
        vehicleCategory
      );

      if (error) throw error;
      setVehicles(data || []);
    } catch (error) {
      console.error('Error fetching vehicles:', error);
    }
  };

  const fetchDrivers = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('operations_fire_tender_vehicle_drivers')
        .select('id, full_name')
        .eq('is_active', true)
        .order('full_name');

      if (error) throw error;
      setDrivers(data || []);
    } catch (error) {
      console.error('Error fetching drivers:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const maxFiles = 10;
    if ((formData.expense_attachments || []).length + pendingAttachmentFiles.length > maxFiles) {
      alert(`Too many attachments (max ${maxFiles}).`);
      return;
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('Please sign in again to assign a vehicle.');
        return;
      }

      const selectedVehicleId = toNumberOrNull(formData.vehicle_id);
      if (!selectedVehicleId) {
        alert('Please select a vehicle.');
        return;
      }

      const isFireTender = formData.assignment_type === 'fire-tender';
      const visitDate = toIsoDateOrNull(formData.visit_date);
      const mobilisationDate = toIsoDateOrNull(formData.date_of_mobilisation);
      const issuedToName = isFireTender
        ? String(formData.driver_name || '').trim()
        : String(formData.responsible_person || '').trim();

      if (!issuedToName) {
        alert(isFireTender ? 'Please select a driver.' : 'Please enter the driver / responsible person.');
        return;
      }
      if (isFireTender && !mobilisationDate) {
        alert('Please enter a valid Date of Mobilisation (dd/mm/yyyy).');
        return;
      }
      if (!isFireTender && !visitDate) {
        alert('Please enter a valid Visit Date (dd/mm/yyyy).');
        return;
      }

      const startDateTime = isFireTender
        ? `${mobilisationDate}T00:00:00`
        : combineVisitDateAndTime(visitDate, formData.out_time);
      const endDateTime = isFireTender
        ? (toIsoDateOrNull(formData.contract_end_date) ? `${toIsoDateOrNull(formData.contract_end_date)}T00:00:00` : null)
        : combineInHouseEndDateTime(visitDate, formData.out_time, formData.in_time);

      if (!startDateTime) {
        alert('Start date/time is required.');
        return;
      }

      let r2Keys = [...(formData.expense_attachments || [])];
      const kmOut = toNumberOrNull(formData.km_out);
      const kmIn = toNumberOrNull(formData.km_in);

      const tripDataBase = {
        assignment_type: formData.assignment_type || null,
        vehicle_id: selectedVehicleId,
        trip_purpose: isFireTender ? 'Fire Tender Vehicle Assignment' : 'In-House Vehicle Assignment',
        issued_to_name: issuedToName,
        issued_to_department: !isFireTender
          ? (formData.departments_allotted.length ? formData.departments_allotted.join(', ') : null)
          : null,
        issued_to_contact: null,
        start_date_time: startDateTime,
        end_date_time: endDateTime,
        origin_location: isFireTender
          ? (formData.deployment_location || null)
          : (formData.site_visit_location || null),
        destination_location: formData.site_name || null,
        odometer_start: kmOut,
        odometer_end: kmIn,
        fuel_added: 0,
        fuel_cost: 0,
        trip_status: formData.trip_status || 'Active',
        approved_by: null,
        approval_date: null,
        remarks: isFireTender ? (formData.notes || null) : (formData.remarks || null),
        driver_name: formData.driver_name || null,
        deployment_location: formData.deployment_location || null,
        site_name: formData.site_name || null,
        date_of_mobilisation: mobilisationDate,
        km_at_mobilisation_out: kmOut,
        km_at_demobilisation_in: kmIn,
        contract_start_date: toIsoDateOrNull(formData.contract_start_date),
        contract_end_date: toIsoDateOrNull(formData.contract_end_date),
        notes: formData.notes || null,
        responsible_person: formData.responsible_person || null,
        site_visit_location: formData.site_visit_location || null,
        number_of_passengers: toNumberOrNull(formData.number_of_passengers) != null
          ? Math.trunc(toNumberOrNull(formData.number_of_passengers))
          : null,
        visit_date: visitDate,
        visit_duration_days: toNumberOrNull(formData.visit_duration_days) != null
          ? Math.trunc(toNumberOrNull(formData.visit_duration_days))
          : null,
        departments_allotted: formData.departments_allotted.length ? formData.departments_allotted : null,
        user_id: user.id
      };

      if (editingTrip) {
        const segment = buildFleetUploadSegment(`trip-${editingTrip.id}`);
        for (const file of pendingAttachmentFiles) {
          r2Keys.push(await uploadFleetFileToR2({ file, scope: 'documents', segment }));
        }
        const tripData = { ...tripDataBase, expense_attachments: r2Keys.length ? r2Keys : null };
        const { error } = await supabase
          .from('operations_fire_tender_vehicle_trips')
          .update(tripData)
          .eq('id', editingTrip.id);

        if (error) throw error;

        if (editingTrip.vehicle_id && editingTrip.vehicle_id !== selectedVehicleId) {
          await setVehicleStatus(editingTrip.vehicle_id, 'Available');
        }
        if (selectedVehicleId) {
          try {
            await setVehicleStatus(selectedVehicleId, tripData.trip_status === 'Active' ? 'On Duty' : 'Available');
          } catch (statusErr) {
            console.error('Trip saved but vehicle status update failed:', statusErr);
            alert(`Trip updated, but vehicle status could not be updated. ${formatTripSaveError(statusErr)}`);
            resetForm();
            fetchTrips();
            fetchVehicles();
            return;
          }
        }
        alert('Trip updated successfully!');
      } else {
        const { data: row, error: insertError } = await supabase
          .from('operations_fire_tender_vehicle_trips')
          .insert([{ ...tripDataBase, expense_attachments: null }])
          .select('id')
          .single();

        if (insertError) throw insertError;
        const segment = buildFleetUploadSegment(`trip-${row.id}`);
        for (const file of pendingAttachmentFiles) {
          r2Keys.push(await uploadFleetFileToR2({ file, scope: 'documents', segment }));
        }
        if (r2Keys.length) {
          const { error: upErr } = await supabase
            .from('operations_fire_tender_vehicle_trips')
            .update({ expense_attachments: r2Keys })
            .eq('id', row.id);
          if (upErr) throw upErr;
        }
        if (selectedVehicleId) {
          try {
            await setVehicleStatus(selectedVehicleId, tripDataBase.trip_status === 'Active' ? 'On Duty' : 'Available');
          } catch (statusErr) {
            console.error('Trip saved but vehicle status update failed:', statusErr);
            alert(`Trip created, but vehicle status could not be updated. ${formatTripSaveError(statusErr)}`);
            resetForm();
            fetchTrips();
            fetchVehicles();
            return;
          }
        }
        alert('Trip created successfully!');
      }

      resetForm();
      fetchTrips();
      fetchVehicles();
    } catch (error) {
      console.error('Error saving trip:', error);
      alert(`Failed to save trip. ${formatTripSaveError(error)}`);
    }
  };

  const handleEdit = (trip) => {
    setEditingTrip(trip);
    setPendingAttachmentFiles([]);
    const assignmentType = trip.trip_purpose === 'Fire Tender Vehicle Assignment' ? 'fire-tender' : 'in-house';
    setFormData({
      assignment_type: trip.assignment_type || assignmentType,
      driver_name: trip.driver_name || (assignmentType === 'fire-tender' ? (trip.issued_to_name || '') : ''),
      vehicle_id: trip.vehicle_id || '',
      deployment_location: trip.deployment_location || (assignmentType === 'fire-tender' ? (trip.origin_location || '') : ''),
      site_name: trip.site_name || trip.destination_location || '',
      date_of_mobilisation: trip.date_of_mobilisation || (assignmentType === 'fire-tender' && trip.start_date_time ? new Date(trip.start_date_time).toISOString().slice(0, 10) : ''),
      km_out: trip.km_at_mobilisation_out ?? trip.odometer_start ?? '',
      km_in: trip.km_at_demobilisation_in ?? trip.odometer_end ?? '',
      contract_start_date: trip.contract_start_date || (assignmentType === 'fire-tender' && trip.start_date_time ? new Date(trip.start_date_time).toISOString().slice(0, 10) : ''),
      contract_end_date: trip.contract_end_date || (assignmentType === 'fire-tender' && trip.end_date_time ? new Date(trip.end_date_time).toISOString().slice(0, 10) : ''),
      notes: trip.notes || (assignmentType === 'fire-tender' ? (trip.remarks || '') : ''),
      responsible_person: trip.responsible_person || (assignmentType === 'in-house' ? (trip.issued_to_name || '') : ''),
      site_visit_location: trip.site_visit_location || (assignmentType === 'in-house' ? (trip.origin_location || '') : ''),
      number_of_passengers: trip.number_of_passengers ?? '',
      visit_date: trip.visit_date || (assignmentType === 'in-house' && trip.start_date_time ? new Date(trip.start_date_time).toISOString().slice(0, 10) : ''),
      visit_duration_days: trip.visit_duration_days ?? '',
      out_time: assignmentType === 'in-house' ? extractTimeFromDateTime(trip.start_date_time) : '',
      in_time: assignmentType === 'in-house' ? extractTimeFromDateTime(trip.end_date_time) : '',
      departments_allotted: Array.isArray(trip.departments_allotted)
        ? trip.departments_allotted
        : (trip.issued_to_department ? trip.issued_to_department.split(',').map((d) => d.trim()).filter(Boolean) : []),
      expense_attachments: parseTripR2Keys(trip),
      remarks: assignmentType === 'in-house' ? (trip.remarks || '') : '',
      trip_purpose: trip.trip_purpose || '',
      issued_to_name: trip.issued_to_name || '',
      issued_to_department: trip.issued_to_department || '',
      start_date_time: trip.start_date_time ? new Date(trip.start_date_time).toISOString().slice(0, 16) : '',
      end_date_time: trip.end_date_time ? new Date(trip.end_date_time).toISOString().slice(0, 16) : '',
      origin_location: trip.origin_location || '',
      destination_location: trip.destination_location || '',
      odometer_start: trip.odometer_start || '',
      odometer_end: trip.odometer_end || '',
      trip_status: trip.trip_status || 'Active',
      approved_by: trip.approved_by || '',
      issued_to_contact: '',
      fuel_added: '',
      fuel_cost: ''
    });
    setDepartmentSearch('');
    setShowForm(true);
  };

  const handleCompleteTrip = async (tripId) => {
    if (window.confirm('Are you sure you want to complete this trip?')) {
      try {
        const trip = trips.find((item) => item.id === tripId);
        const { error } = await supabase
          .from('operations_fire_tender_vehicle_trips')
          .update({ 
            trip_status: 'Completed',
            end_date_time: new Date().toISOString()
          })
          .eq('id', tripId);

        if (error) throw error;
        if (trip?.vehicle_id) {
          await setVehicleStatus(trip.vehicle_id, 'Available');
        }
        alert('Trip completed successfully!');
        fetchTrips();
        fetchVehicles();
      } catch (error) {
        console.error('Error completing trip:', error);
        alert('Failed to complete trip. Please try again.');
      }
    }
  };

  const handleCancelTrip = async (tripId) => {
    if (window.confirm('Are you sure you want to cancel this trip?')) {
      try {
        const trip = trips.find((item) => item.id === tripId);
        const { error } = await supabase
          .from('operations_fire_tender_vehicle_trips')
          .update({ trip_status: 'Cancelled' })
          .eq('id', tripId);

        if (error) throw error;
        if (trip?.vehicle_id) {
          await setVehicleStatus(trip.vehicle_id, 'Available');
        }
        alert('Trip cancelled successfully!');
        fetchTrips();
        fetchVehicles();
      } catch (error) {
        console.error('Error cancelling trip:', error);
        alert('Failed to cancel trip. Please try again.');
      }
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this trip?')) {
      try {
        const trip = trips.find((item) => item.id === id);
        const { error } = await supabase
          .from('operations_fire_tender_vehicle_trips')
          .delete()
          .eq('id', id);

        if (error) throw error;
        if (trip?.vehicle_id) {
          await setVehicleStatus(trip.vehicle_id, 'Available');
        }
        alert('Trip deleted successfully!');
        fetchTrips();
        fetchVehicles();
      } catch (error) {
        console.error('Error deleting trip:', error);
        alert('Failed to delete trip. Please try again.');
      }
    }
  };

  const resetForm = () => {
    setPendingAttachmentFiles([]);
    setDepartmentSearch('');
    setFormData({
      assignment_type: 'in-house',
      driver_name: '',
      vehicle_id: '',
      deployment_location: '',
      site_name: '',
      date_of_mobilisation: '',
      km_out: '',
      km_in: '',
      contract_start_date: '',
      contract_end_date: '',
      notes: '',
      responsible_person: '',
      site_visit_location: '',
      number_of_passengers: '',
      visit_date: '',
      visit_duration_days: '',
      out_time: '',
      in_time: '',
      departments_allotted: [],
      expense_attachments: [],
      remarks: '',
      trip_purpose: '',
      issued_to_name: '',
      issued_to_department: '',
      start_date_time: '',
      end_date_time: '',
      origin_location: '',
      destination_location: '',
      odometer_start: '',
      odometer_end: '',
      trip_status: 'Active',
      approved_by: '',
      issued_to_contact: '',
      fuel_added: '',
      fuel_cost: ''
    });
    setEditingTrip(null);
    setShowForm(false);
  };

  const openTripAttachment = async (objectKey) => {
    try {
      const url = await presignFleetR2Get(objectKey);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      alert(err?.message || 'Could not open file.');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Active': return 'bg-blue-100 text-blue-800';
      case 'Completed': return 'bg-green-100 text-green-800';
      case 'Cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'Active': return <Clock className="h-4 w-4" />;
      case 'Completed': return <CheckCircle className="h-4 w-4" />;
      case 'Cancelled': return <XCircle className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  const selectedVehicle = vehicles.find((vehicle) => String(vehicle.id) === String(formData.vehicle_id));
  const autoVehicleName = selectedVehicle ? [selectedVehicle.make, selectedVehicle.model].filter(Boolean).join(' ') : '';
  const filteredAssignmentVehicles = vehicles.filter((vehicle) => {
    const isFireTenderVehicle = fireTenderVehicleTypes.includes(vehicle.vehicle_type);
    return formData.assignment_type === 'fire-tender' ? isFireTenderVehicle : !isFireTenderVehicle;
  });

  const filteredTrips = trips.filter(trip => {
    const vm = trip.operations_fire_tender_vehicle_master;
    const matchesSearch = 
      vm?.registration_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      trip.issued_to_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      trip.trip_purpose?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      trip.origin_location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      trip.destination_location?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'All' || trip.trip_status === statusFilter;
    const matchesPurpose = purposeFilter === 'All' || trip.trip_purpose === purposeFilter;
    
    return matchesSearch && matchesStatus && matchesPurpose;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Vehicle Trips</h1>
          <p className="text-gray-600 mt-2">Track and manage vehicle usage</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-2"
        >
          <Plus className="h-5 w-5" />
          <span>Assign Vehicle</span>
        </button>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <input
              type="text"
              placeholder="Search trips..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="All">All Status</option>
            {tripStatuses.map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
          <select
            value={purposeFilter}
            onChange={(e) => setPurposeFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="All">All Purposes</option>
            {tripPurposes.map(purpose => (
              <option key={purpose} value={purpose}>{purpose}</option>
            ))}
          </select>
          <button className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 flex items-center justify-center space-x-2">
            <Download className="h-5 w-5" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Trip Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex w-full max-w-4xl max-h-[90vh] flex-col overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  {editingTrip ? 'Edit Trip' : 'Assign Vehicle'}
                </h2>
                <p className="mt-0.5 text-sm text-gray-500">
                  {formData.assignment_type === 'fire-tender'
                    ? 'Fire tender deployment details'
                    : 'In-house visit and vehicle details'}
                </p>
              </div>
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
                <section className="rounded-lg border border-gray-200 bg-gray-50/60 p-4">
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Assignment type</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="min-w-0">
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">Vehicle Type *</label>
                      <select
                        value={formData.assignment_type}
                        onChange={(e) => setFormData({ ...formData, assignment_type: e.target.value, vehicle_id: '' })}
                        className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      >
                        <option value="in-house">In-House Vehicle</option>
                        <option value="fire-tender">Fire Tender Vehicle</option>
                      </select>
                    </div>
                  </div>
                </section>

                {formData.assignment_type === 'fire-tender' && (
                  <div className="space-y-5">
                    <section className="rounded-lg border border-gray-200 p-4">
                      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Driver & vehicle</h3>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="min-w-0">
                          <label className="mb-1.5 block text-sm font-medium text-gray-700">Driver Name *</label>
                          <select
                            value={formData.driver_name}
                            onChange={(e) => setFormData({ ...formData, driver_name: e.target.value })}
                            className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                          >
                            <option value="">Select Driver</option>
                            {drivers.map((driver) => (
                              <option key={driver.id} value={driver.full_name}>{driver.full_name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="min-w-0">
                          <label className="mb-1.5 block text-sm font-medium text-gray-700">Vehicle *</label>
                          <select
                            value={formData.vehicle_id}
                            onChange={(e) => setFormData({ ...formData, vehicle_id: e.target.value })}
                            className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                          >
                            <option value="">Select Vehicle</option>
                            {filteredAssignmentVehicles.map((vehicle) => (
                              <option key={vehicle.id} value={vehicle.id}>
                                {vehicle.registration_number} - {vehicle.vehicle_type}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="min-w-0">
                          <label className="mb-1.5 block text-sm font-medium text-gray-700">Vehicle Number</label>
                          <input type="text" value={selectedVehicle?.registration_number || ''} className="h-10 w-full rounded-lg border border-gray-300 bg-gray-50 px-3 text-sm text-gray-700" readOnly />
                        </div>
                        <div className="min-w-0">
                          <label className="mb-1.5 block text-sm font-medium text-gray-700">Vehicle Name</label>
                          <input type="text" value={autoVehicleName} className="h-10 w-full rounded-lg border border-gray-300 bg-gray-50 px-3 text-sm text-gray-700" readOnly />
                        </div>
                      </div>
                    </section>

                    <section className="rounded-lg border border-gray-200 p-4">
                      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Deployment</h3>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="min-w-0">
                          <label className="mb-1.5 block text-sm font-medium text-gray-700">Deployment Location *</label>
                          <input type="text" value={formData.deployment_location} onChange={(e) => setFormData({ ...formData, deployment_location: e.target.value })} className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                        </div>
                        <div className="min-w-0">
                          <label className="mb-1.5 block text-sm font-medium text-gray-700">Site Name *</label>
                          <input type="text" value={formData.site_name} onChange={(e) => setFormData({ ...formData, site_name: e.target.value })} className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                        </div>
                        <div className="min-w-0">
                          <label className="mb-1.5 block text-sm font-medium text-gray-700">Date of Mobilisation *</label>
                          <FormDateInput value={formData.date_of_mobilisation} onChange={(e) => setFormData({ ...formData, date_of_mobilisation: e.target.value })} className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                        </div>
                      </div>
                    </section>

                    <section className="rounded-lg border border-gray-200 p-4">
                      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Kilometres</h3>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="min-w-0">
                          <label className="mb-1.5 block text-sm font-medium text-gray-700">Km at Mobilisation (Out)</label>
                          <input type="number" min="0" value={formData.km_out} onChange={(e) => setFormData({ ...formData, km_out: e.target.value })} className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div className="min-w-0">
                          <label className="mb-1.5 block text-sm font-medium text-gray-700">Km at De-mobilisation (In)</label>
                          <input type="number" min="0" value={formData.km_in} onChange={(e) => setFormData({ ...formData, km_in: e.target.value })} className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                      </div>
                    </section>

                    <section className="rounded-lg border border-gray-200 p-4">
                      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Contract period</h3>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="min-w-0">
                          <label className="mb-1.5 block text-sm font-medium text-gray-700">Contract Period (Start)</label>
                          <FormDateInput value={formData.contract_start_date} onChange={(e) => setFormData({ ...formData, contract_start_date: e.target.value })} className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div className="min-w-0">
                          <label className="mb-1.5 block text-sm font-medium text-gray-700">Contract Period (End)</label>
                          <FormDateInput value={formData.contract_end_date} onChange={(e) => setFormData({ ...formData, contract_end_date: e.target.value })} className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div className="min-w-0 sm:col-span-2">
                          <label className="mb-1.5 block text-sm font-medium text-gray-700">Notes</label>
                          <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={3} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                      </div>
                    </section>
                  </div>
                )}

                {formData.assignment_type === 'in-house' && (
                  <div className="space-y-5">
                    <section className="rounded-lg border border-gray-200 p-4">
                      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Driver & vehicle</h3>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="min-w-0">
                          <label className="mb-1.5 block text-sm font-medium text-gray-700">Driver / Responsible Person *</label>
                          <input
                            type="text"
                            list="driver-master-list"
                            value={formData.responsible_person}
                            onChange={(e) => setFormData({ ...formData, responsible_person: e.target.value })}
                            className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                          />
                          <datalist id="driver-master-list">
                            {drivers.map((driver) => (
                              <option key={driver.id} value={driver.full_name} />
                            ))}
                          </datalist>
                        </div>
                        <div className="min-w-0">
                          <label className="mb-1.5 block text-sm font-medium text-gray-700">Vehicle *</label>
                          <select
                            value={formData.vehicle_id}
                            onChange={(e) => setFormData({ ...formData, vehicle_id: e.target.value })}
                            className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                          >
                            <option value="">Select Vehicle</option>
                            {filteredAssignmentVehicles.map((vehicle) => (
                              <option key={vehicle.id} value={vehicle.id}>
                                {vehicle.registration_number} - {vehicle.vehicle_type}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </section>

                    <section className="rounded-lg border border-gray-200 p-4">
                      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Visit details</h3>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="min-w-0 sm:col-span-2 lg:col-span-1">
                          <label className="mb-1.5 block text-sm font-medium text-gray-700">Site Visit Location *</label>
                          <input type="text" value={formData.site_visit_location} onChange={(e) => setFormData({ ...formData, site_visit_location: e.target.value })} className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                        </div>
                        <div className="min-w-0 sm:col-span-2 lg:col-span-1">
                          <label className="mb-1.5 block text-sm font-medium text-gray-700">Site Name *</label>
                          <input type="text" value={formData.site_name} onChange={(e) => setFormData({ ...formData, site_name: e.target.value })} className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                        </div>
                        <div className="min-w-0">
                          <label className="mb-1.5 block text-sm font-medium text-gray-700">Number of Passengers</label>
                          <input type="number" min="0" value={formData.number_of_passengers} onChange={(e) => setFormData({ ...formData, number_of_passengers: e.target.value })} className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div className="min-w-0">
                          <label className="mb-1.5 block text-sm font-medium text-gray-700">Visit Date *</label>
                          <FormDateInput value={formData.visit_date} onChange={(e) => setFormData({ ...formData, visit_date: e.target.value })} className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                        </div>
                        <div className="min-w-0">
                          <label className="mb-1.5 block text-sm font-medium text-gray-700">Visit Duration (Days)</label>
                          <input type="number" min="0" value={formData.visit_duration_days} onChange={(e) => setFormData({ ...formData, visit_duration_days: e.target.value })} className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                      </div>
                    </section>

                    <section className="rounded-lg border border-gray-200 p-4">
                      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Time</h3>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <div className="min-w-0">
                          <label className="mb-1.5 block text-sm font-medium text-gray-700">Out Time</label>
                          <input
                            type="time"
                            value={formData.out_time}
                            onChange={(e) => setFormData({ ...formData, out_time: e.target.value })}
                            className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div className="min-w-0">
                          <label className="mb-1.5 block text-sm font-medium text-gray-700">In Time</label>
                          <input
                            type="time"
                            value={formData.in_time}
                            onChange={(e) => setFormData({ ...formData, in_time: e.target.value })}
                            className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div className="min-w-0">
                          <label className="mb-1.5 block text-sm font-medium text-gray-700">Time Difference</label>
                          <input
                            type="text"
                            value={timeDifferenceLabel}
                            readOnly
                            placeholder="—"
                            className="h-10 w-full rounded-lg border border-gray-300 bg-gray-50 px-3 text-sm text-gray-700"
                          />
                        </div>
                      </div>
                    </section>

                    <section className="rounded-lg border border-gray-200 p-4">
                      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Department(s) allotted</h3>
                      <div className="overflow-hidden rounded-lg border border-gray-300 bg-white">
                        <div className="relative border-b border-gray-200">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                          <input
                            type="search"
                            value={departmentSearch}
                            onChange={(e) => setDepartmentSearch(e.target.value)}
                            placeholder="Search departments…"
                            className="h-10 w-full border-0 bg-transparent pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
                          />
                        </div>
                        <div className="grid max-h-44 grid-cols-1 gap-0.5 overflow-y-auto p-2 sm:grid-cols-2">
                          {filteredDepartmentOptions.length === 0 ? (
                            <p className="col-span-full px-2 py-3 text-sm text-gray-500">No departments match your search.</p>
                          ) : (
                            filteredDepartmentOptions.map((dept) => {
                              const checked = formData.departments_allotted.includes(dept);
                              return (
                                <label
                                  key={dept}
                                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-800 hover:bg-gray-50"
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      setFormData((prev) => ({
                                        ...prev,
                                        departments_allotted: checked
                                          ? prev.departments_allotted.filter((d) => d !== dept)
                                          : [...prev.departments_allotted, dept],
                                      }));
                                    }}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                  />
                                  <span className="truncate">{dept}</span>
                                </label>
                              );
                            })
                          )}
                        </div>
                        {formData.departments_allotted.length > 0 && (
                          <div className="border-t border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                            Selected: {formData.departments_allotted.join(', ')}
                          </div>
                        )}
                      </div>
                    </section>

                    <section className="rounded-lg border border-gray-200 p-4">
                      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Odometer</h3>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <div className="min-w-0">
                          <label className="mb-1.5 block text-sm font-medium text-gray-700">Odometer Out (Km)</label>
                          <input type="number" min="0" value={formData.km_out} onChange={(e) => setFormData({ ...formData, km_out: e.target.value })} className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div className="min-w-0">
                          <label className="mb-1.5 block text-sm font-medium text-gray-700">Odometer In (Km)</label>
                          <input type="number" min="0" value={formData.km_in} onChange={(e) => setFormData({ ...formData, km_in: e.target.value })} className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div className="min-w-0">
                          <label className="mb-1.5 block text-sm font-medium text-gray-700">Odometer Difference (Km)</label>
                          <input
                            type="text"
                            value={odometerDifferenceLabel}
                            readOnly
                            placeholder="—"
                            className="h-10 w-full rounded-lg border border-gray-300 bg-gray-50 px-3 text-sm text-gray-700"
                          />
                        </div>
                      </div>
                    </section>

                    <section className="rounded-lg border border-gray-200 p-4">
                      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Remarks</h3>
                      <textarea value={formData.remarks} onChange={(e) => setFormData({ ...formData, remarks: e.target.value })} rows={3} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </section>
                  </div>
                )}

                <section className="rounded-lg border border-gray-200 p-4">
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Supporting documents</h3>
                  <FleetAttachmentUploader
                    label=""
                    savedKeys={formData.expense_attachments || []}
                    onRemoveSavedKey={(key) =>
                      setFormData((prev) => ({
                        ...prev,
                        expense_attachments: (prev.expense_attachments || []).filter((k) => k !== key),
                      }))
                    }
                    pendingFiles={pendingAttachmentFiles}
                    onPendingAdd={(files) => setPendingAttachmentFiles((prev) => [...prev, ...files])}
                    onRemovePending={(idx) =>
                      setPendingAttachmentFiles((prev) => prev.filter((_, i) => i !== idx))
                    }
                    multiple
                    maxTotal={10}
                  />
                </section>
              </div>

              <div className="flex shrink-0 items-center justify-end gap-3 border-t border-gray-200 bg-white px-6 py-4">
                <button
                  type="button"
                  onClick={resetForm}
                  className="h-10 rounded-lg bg-gray-100 px-4 text-sm font-medium text-gray-700 hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
                >
                  {editingTrip ? 'Update Trip' : 'Assign Vehicle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Trips Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Vehicle Trips ({filteredTrips.length})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full table-fixed divide-y divide-gray-200 text-sm">
            <colgroup>
              <col className="w-12" />
              <col className="w-[7.5rem]" />
              <col className="w-[8.5rem]" />
              <col className="w-[9.5rem]" />
              <col className="w-[8rem]" />
              <col className="w-[5.5rem]" />
              <col className="w-[5.5rem]" />
              <col className="w-[6.5rem]" />
              <col className="w-[7rem]" />
              <col className="w-[6.5rem]" />
              <col className="w-[6.5rem]" />
              <col className="w-[5.5rem]" />
            </colgroup>
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2.5 text-center align-middle text-xs font-medium uppercase tracking-wider text-gray-500">
                  S.No
                </th>
                <th className="px-3 py-2.5 text-left align-middle text-xs font-medium uppercase tracking-wider text-gray-500">
                  Vehicle
                </th>
                <th className="px-3 py-2.5 text-left align-middle text-xs font-medium uppercase tracking-wider text-gray-500">
                  Purpose
                </th>
                <th className="px-3 py-2.5 text-left align-middle text-xs font-medium uppercase tracking-wider text-gray-500">
                  Assigned To
                </th>
                <th className="px-3 py-2.5 text-left align-middle text-xs font-medium uppercase tracking-wider text-gray-500">
                  Route
                </th>
                <th className="px-3 py-2.5 text-left align-middle text-xs font-medium uppercase tracking-wider text-gray-500">
                  Date
                </th>
                <th className="px-3 py-2.5 text-left align-middle text-xs font-medium uppercase tracking-wider text-gray-500">
                  Time
                </th>
                <th className="px-3 py-2.5 text-left align-middle text-xs font-medium uppercase tracking-wider text-gray-500">
                  <span className="block leading-tight">Time</span>
                  <span className="block leading-tight">Difference</span>
                </th>
                <th className="px-3 py-2.5 text-left align-middle text-xs font-medium uppercase tracking-wider text-gray-500">
                  Odometer (Km)
                </th>
                <th className="px-3 py-2.5 text-left align-middle text-xs font-medium uppercase tracking-wider text-gray-500">
                  Files
                </th>
                <th className="px-3 py-2.5 text-left align-middle text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="px-3 py-2.5 text-center align-middle text-xs font-medium uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filteredTrips.map((trip, idx) => {
                const attachmentKeys = parseTripR2Keys(trip);
                const outTime = getTripOutTime(trip);
                const inTime = getTripInTime(trip);
                const timeDiff = getTripTimeDifference(trip);
                const kmOut = getTripKmOut(trip);
                const kmIn = getTripKmIn(trip);
                const kmDiff = getTripOdometerDifference(trip);
                const tripDate = trip.visit_date || trip.date_of_mobilisation || trip.start_date_time;

                return (
                <tr key={trip.id} className="hover:bg-gray-50">
                  <td className="px-3 py-3 align-middle text-center tabular-nums text-gray-700">{idx + 1}</td>
                  <td className="px-3 py-3 align-middle">
                    <div className="flex flex-col gap-0.5 leading-tight">
                      <div className="truncate font-medium text-gray-900">
                        {trip.operations_fire_tender_vehicle_master?.registration_number}
                      </div>
                      <div className="truncate text-xs text-gray-500">
                        {trip.operations_fire_tender_vehicle_master?.vehicle_type}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <div className="line-clamp-2 text-xs leading-snug text-gray-900">{trip.trip_purpose}</div>
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <div className="flex flex-col gap-0.5 leading-tight">
                      <div className="truncate font-medium text-gray-900">
                        {trip.issued_to_name}
                      </div>
                      <div className="line-clamp-2 text-xs text-gray-500">
                        {trip.issued_to_department || '—'}
                      </div>
                      {trip.issued_to_contact && (
                        <div className="truncate text-xs text-gray-400">
                          {trip.issued_to_contact}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <div className="flex flex-col gap-0.5 leading-tight">
                      <div className="truncate text-gray-900">
                        {trip.origin_location || '—'}
                      </div>
                      <div className="truncate text-xs text-gray-500">
                        → {trip.destination_location || '—'}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 align-middle whitespace-nowrap text-gray-900">
                    {tripDate ? formatDateDdMmYyyy(tripDate) : '—'}
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <div className="grid grid-cols-[1.75rem_1fr] gap-x-1 gap-y-0.5 text-xs leading-tight">
                      <span className="text-gray-500">Out</span>
                      <span className="tabular-nums text-gray-900">{outTime || '—'}</span>
                      <span className="text-gray-500">In</span>
                      <span className="tabular-nums text-gray-900">{inTime || '—'}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <div className="text-xs font-medium leading-snug text-gray-900">
                      {timeDiff || '—'}
                    </div>
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <div className="grid grid-cols-[1.75rem_1fr] gap-x-1 gap-y-0.5 text-xs leading-tight">
                      <span className="text-gray-500">Out</span>
                      <span className="tabular-nums text-gray-900">{formatKmDisplay(kmOut)}</span>
                      <span className="text-gray-500">In</span>
                      <span className="tabular-nums text-gray-900">{formatKmDisplay(kmIn)}</span>
                      <span className="text-gray-500">Diff</span>
                      <span className="font-medium tabular-nums text-blue-700">{kmDiff ? `${kmDiff} km` : '—'}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 align-middle">
                    {attachmentKeys.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setFilesModalTrip(trip)}
                        className="inline-flex max-w-full items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5 text-[11px] font-medium leading-tight text-blue-700 hover:bg-blue-100"
                      >
                        <FileText className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">View ({attachmentKeys.length})</span>
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">No files</span>
                    )}
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColor(trip.trip_status)}`}>
                      {getStatusIcon(trip.trip_status)}
                      <span className="ml-1">{trip.trip_status}</span>
                    </span>
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <div className="flex items-center justify-center gap-1.5">
                      {trip.trip_status === 'Active' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleCompleteTrip(trip.id)}
                            className="rounded-md p-1.5 text-green-600 hover:bg-gray-100 hover:text-green-900"
                            title="Complete Trip"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCancelTrip(trip.id)}
                            className="rounded-md p-1.5 text-red-600 hover:bg-gray-100 hover:text-red-900"
                            title="Cancel Trip"
                          >
                            <XCircle className="h-4 w-4" />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => handleEdit(trip)}
                        className="rounded-md p-1.5 text-blue-600 hover:bg-gray-100 hover:text-blue-900"
                        title="Edit Trip"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(trip.id)}
                        className="rounded-md p-1.5 text-red-600 hover:bg-gray-100 hover:text-red-900"
                        title="Delete Trip"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
        {filteredTrips.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <MapPin className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>No trips found</p>
          </div>
        )}
      </div>

      {filesModalTrip && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Uploaded files</h3>
                <p className="mt-0.5 text-xs text-gray-500">
                  {filesModalTrip.operations_fire_tender_vehicle_master?.registration_number || 'Trip'} · {filesModalTrip.issued_to_name || 'Assignment'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFilesModalTrip(null)}
                className="rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100"
              >
                Close
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto p-4 space-y-2">
              {parseTripR2Keys(filesModalTrip).length === 0 ? (
                <p className="text-sm text-gray-500">No files attached to this trip.</p>
              ) : (
                parseTripR2Keys(filesModalTrip).map((key, index) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => openTripAttachment(key)}
                    className="flex w-full items-center gap-3 rounded-lg border border-gray-200 px-3 py-2.5 text-left hover:bg-gray-50"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-blue-600" />
                    <span className="min-w-0 flex-1 truncate text-sm text-gray-800">
                      {attachmentFileLabel(key, index)}
                    </span>
                    <Eye className="h-4 w-4 shrink-0 text-gray-400" />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VehicleTrips;
