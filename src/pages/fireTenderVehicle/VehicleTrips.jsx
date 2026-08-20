import {
  combineIsoDateAndTimeForStorage,
  extractIsoDateFromDateTime,
  extractTimeHHmmFromDateTime,
  formatDateDdMmYyyy,
  formatDateTimeAmPmDdMmYyyy,
} from '../../utils/dateDisplay';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';
import { withFleetVehicleCategoryFilter, withFleetMasterCategoryFilter } from './fleetLoadUtils';
import { uploadFleetFileToR2, buildFleetUploadSegment, presignFleetR2Get } from '../../lib/fleetR2';
import FleetAttachmentUploader from './FleetAttachmentUploader';
import FormDateInput from "../../components/FormDateInput";
import {
  fetchEmployeeMasterDepartments,
  mergeEmployeeMasterDepartments,
} from '../../lib/employeeMasterDepartments';
import { EMPLOYEE_MASTER_TABLE } from '../../lib/userManagementHierarchy';

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
  Eye,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
} from 'lucide-react';
import { toast } from '../../lib/toast';

const TRIPS_PAGE_SIZE = 20;
const REPORT_PAGE_SIZE = 20;

const parseTripR2Keys = (row) => {
  const raw = row?.expense_attachments;
  if (!Array.isArray(raw)) return [];
  return raw.filter((k) => String(k).trim().startsWith('fleet/'));
};

const formatDurationMinutes = (totalMinutes) => {
  if (totalMinutes == null || totalMinutes < 0) return '';
  const mins = Math.round(totalMinutes);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
};

const formatDurationFromDateTimes = (startValue, endValue) => {
  const mins = getDurationMinutesFromDateTimes(startValue, endValue);
  return formatDurationMinutes(mins);
};

const getDurationMinutesFromDateTimes = (startValue, endValue) => {
  if (!startValue || !endValue) return null;
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const mins = Math.round((end.getTime() - start.getTime()) / 60000);
  return mins >= 0 ? mins : null;
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

const getTripTimeDifference = (trip) => formatDurationFromDateTimes(trip?.start_date_time, trip?.end_date_time);

const getTripDurationMinutes = (trip) =>
  getDurationMinutesFromDateTimes(trip?.start_date_time, trip?.end_date_time);

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

const addOneCalendarDay = (dateIso) => {
  const [y, m, d] = String(dateIso).split('-').map(Number);
  if (![y, m, d].every((n) => Number.isFinite(n))) return dateIso;
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

/** When in_date is omitted, keep overnight wrap so same-day out/in still works. */
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
  return combineIsoDateAndTimeForStorage(datePart, time);
};

const formatDurationFromOutIn = (outDate, outTime, inDate, inTime) => {
  if (!outTime || !inTime) return '';
  const startDate = toIsoDateOrNull(outDate);
  if (!startDate) return '';
  const start = combineIsoDateAndTimeForStorage(startDate, outTime);
  const end = toIsoDateOrNull(inDate)
    ? combineIsoDateAndTimeForStorage(inDate, inTime)
    : combineInHouseEndDateTime(startDate, outTime, inTime);
  return formatDurationFromDateTimes(start, end);
};

const createPassengerEntry = (name = '') => ({
  id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  name: String(name ?? ''),
});

/** Load saved names; do not expand a count into empty textboxes (keeps large groups scalable). */
const passengerEntriesFromTrip = (trip) => {
  if (Array.isArray(trip?.passenger_names)) {
    return trip.passenger_names.map((n) => createPassengerEntry(n));
  }
  return [];
};

const formatTripPassengersDisplay = (trip) => {
  if (Array.isArray(trip?.passenger_names) && trip.passenger_names.length) {
    return trip.passenger_names.map((n) => String(n || '').trim()).filter(Boolean).join(', ');
  }
  const count = trip?.number_of_passengers;
  if (count != null && Number(count) > 0) return String(count);
  return '';
};

/** Free-text passenger name with People Master suggestions (full name + department). */
const PassengerNameSuggestInput = ({ value, onChange, people, placeholder, className }) => {
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = String(value || '').trim().toLowerCase();
    if (!q) return [];
    return (people || [])
      .filter((person) => {
        const hay = `${person.full_name} ${person.department}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 40);
  }, [people, value]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute left-0 right-0 z-[70] mt-1 max-h-44 overflow-y-auto rounded-lg border border-gray-200 bg-white text-sm shadow-lg">
          {filtered.map((person) => (
            <li key={person.id}>
              <button
                type="button"
                className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-blue-50"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(person.full_name);
                  setOpen(false);
                }}
              >
                <span className="font-medium text-gray-900">{person.full_name}</span>
                {person.department ? (
                  <span className="text-xs text-gray-500">{person.department}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/** Keep Out/In time as HH:mm only — never invent a clock value (e.g. browser "now"). */
const normalizeTimeHHmmInput = (raw) => {
  const s = String(raw || '').trim();
  if (!s) return '';
  const match = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return '';
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour > 23 || minute > 59) return '';
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const currentYearMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const tripMonthKey = (trip) => {
  const iso =
    extractIsoDateFromDateTime(trip?.start_date_time) ||
    toIsoDateOrNull(trip?.visit_date) ||
    toIsoDateOrNull(trip?.date_of_mobilisation) ||
    '';
  return iso ? iso.slice(0, 7) : '';
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
  const [vehicleFilter, setVehicleFilter] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [purposeFilter, setPurposeFilter] = useState('All');
  const [departmentOptions, setDepartmentOptions] = useState(() => mergeEmployeeMasterDepartments([]));
  const [departmentSearch, setDepartmentSearch] = useState('');
  const [peopleMasterOptions, setPeopleMasterOptions] = useState([]);
  const [filesModalTrip, setFilesModalTrip] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'start_date_time', direction: 'desc' });
  const [tripsView, setTripsView] = useState('list');
  const [reportMonth, setReportMonth] = useState(currentYearMonth);
  const [reportVehicleId, setReportVehicleId] = useState(null);
  const [tripsPage, setTripsPage] = useState(1);
  const [reportPage, setReportPage] = useState(1);
  const [reportDetailPage, setReportDetailPage] = useState(1);

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
    number_of_passengers: 0,
    passenger_entries: [],
    visit_date: '',
    out_date: '',
    in_date: '',
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

  const timeDifferenceLabel = formatDurationFromOutIn(
    formData.out_date || formData.visit_date,
    formData.out_time,
    formData.in_date,
    formData.in_time
  );
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
        const [fromDb, peopleResult] = await Promise.all([
          fetchEmployeeMasterDepartments(supabase),
          supabase
            .from(EMPLOYEE_MASTER_TABLE)
            .select('id, full_name, department')
            .eq('status', 'Active')
            .order('full_name', { ascending: true }),
        ]);
        if (cancelled) return;
        setDepartmentOptions(fromDb);
        if (peopleResult.error) throw peopleResult.error;
        setPeopleMasterOptions(
          (peopleResult.data || [])
            .map((row) => ({
              id: row.id,
              full_name: String(row.full_name || '').trim(),
              department: String(row.department || '').trim(),
            }))
            .filter((row) => row.full_name)
        );
      } catch (error) {
        console.error('Error fetching people master / departments:', error);
        if (!cancelled) {
          setDepartmentOptions(mergeEmployeeMasterDepartments([]));
          setPeopleMasterOptions([]);
        }
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
      toast.warning("Validation", `Too many attachments (max ${maxFiles}).`);
      return;
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.warning("Validation", "Please sign in again to assign a vehicle.");
        return;
      }

      const selectedVehicleId = toNumberOrNull(formData.vehicle_id);
      if (!selectedVehicleId) {
        toast.warning("Validation", "Please select a vehicle.");
        return;
      }

      const isFireTender = formData.assignment_type === 'fire-tender';
      const visitDate = toIsoDateOrNull(formData.visit_date);
      const mobilisationDate = toIsoDateOrNull(formData.date_of_mobilisation);
      const issuedToName = isFireTender
        ? String(formData.driver_name || '').trim()
        : String(formData.responsible_person || '').trim();

      if (!issuedToName) {
        toast.warning("Validation", isFireTender ? 'Please select a driver.' : 'Please enter the driver / responsible person.');
        return;
      }
      if (isFireTender && !mobilisationDate) {
        toast.warning("Validation", "Please enter a valid Date of Mobilisation (dd/mm/yyyy).");
        return;
      }
      if (!isFireTender && !visitDate) {
        toast.warning("Validation", "Please enter a valid Visit Date (dd/mm/yyyy).");
        return;
      }

      const outDate = toIsoDateOrNull(formData.out_date);
      const inDate = toIsoDateOrNull(formData.in_date);
      const outTime = normalizeTimeHHmmInput(formData.out_time);
      const inTime = normalizeTimeHHmmInput(formData.in_time);

      if (!isFireTender) {
        if (!outDate) {
          toast.warning("Validation", "Please enter a valid Out Date (dd/mm/yyyy).");
          return;
        }
        if (!/^\d{2}:\d{2}$/.test(outTime)) {
          toast.warning("Validation", "Please enter Out Time.");
          return;
        }
        if (formData.passenger_entries.some((entry) => !String(entry.name || '').trim())) {
          toast.warning("Validation", "Please enter a name for each passenger, or remove empty passenger rows.");
          return;
        }
        if (!formData.departments_allotted.length) {
          toast.warning("Validation", "Please select at least one Department allotted.");
          return;
        }
        if (toNumberOrNull(formData.km_out) == null) {
          toast.warning("Validation", "Please enter Odometer Out (Km).");
          return;
        }
      }

      const startDateTime = isFireTender
        ? combineIsoDateAndTimeForStorage(mobilisationDate, '00:00')
        : combineIsoDateAndTimeForStorage(outDate, outTime);
      const endDateTime = isFireTender
        ? (toIsoDateOrNull(formData.contract_end_date)
          ? combineIsoDateAndTimeForStorage(toIsoDateOrNull(formData.contract_end_date), '00:00')
          : null)
        : inDate && /^\d{2}:\d{2}$/.test(inTime)
          ? combineIsoDateAndTimeForStorage(inDate, inTime)
          : combineInHouseEndDateTime(outDate, outTime, inTime);

      if (!startDateTime) {
        toast.warning("Validation", "Start date/time is required.");
        return;
      }

      let r2Keys = [...(formData.expense_attachments || [])];
      const kmOut = toNumberOrNull(formData.km_out);
      const kmIn = toNumberOrNull(formData.km_in);

      const passengerNames = formData.passenger_entries.map((entry) => String(entry.name || '').trim());
      const passengerCount = formData.passenger_entries.length > 0
        ? formData.passenger_entries.length
        : (toNumberOrNull(formData.number_of_passengers) ?? 0);

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
        number_of_passengers: isFireTender ? null : passengerCount,
        passenger_names: !isFireTender && formData.passenger_entries.length
          ? passengerNames
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
            toast.warning("Partial success", `Trip updated, but vehicle status could not be updated. ${formatTripSaveError(statusErr)}`);
            resetForm();
            fetchTrips();
            fetchVehicles();
            return;
          }
        }
        toast.success("Updated", "Trip updated successfully");
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
            toast.warning("Partial success", `Trip created, but vehicle status could not be updated. ${formatTripSaveError(statusErr)}`);
            resetForm();
            fetchTrips();
            fetchVehicles();
            return;
          }
        }
        toast.success("Saved", "Trip created successfully");
      }

      resetForm();
      fetchTrips();
      fetchVehicles();
    } catch (error) {
      console.error('Error saving trip:', error);
      toast.error("Save failed", `Failed to save trip. ${formatTripSaveError(error)}`);
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
      date_of_mobilisation: trip.date_of_mobilisation || (assignmentType === 'fire-tender' && trip.start_date_time ? extractIsoDateFromDateTime(trip.start_date_time) : ''),
      km_out: trip.km_at_mobilisation_out ?? trip.odometer_start ?? '',
      km_in: trip.km_at_demobilisation_in ?? trip.odometer_end ?? '',
      contract_start_date: trip.contract_start_date || (assignmentType === 'fire-tender' && trip.start_date_time ? extractIsoDateFromDateTime(trip.start_date_time) : ''),
      contract_end_date: trip.contract_end_date || (assignmentType === 'fire-tender' && trip.end_date_time ? extractIsoDateFromDateTime(trip.end_date_time) : ''),
      notes: trip.notes || (assignmentType === 'fire-tender' ? (trip.remarks || '') : ''),
      responsible_person: trip.responsible_person || (assignmentType === 'in-house' ? (trip.issued_to_name || '') : ''),
      site_visit_location: trip.site_visit_location || (assignmentType === 'in-house' ? (trip.origin_location || '') : ''),
      passenger_entries: passengerEntriesFromTrip(trip),
      number_of_passengers: Array.isArray(trip.passenger_names)
        ? trip.passenger_names.length
        : (trip.number_of_passengers ?? 0),
      visit_date: trip.visit_date || (assignmentType === 'in-house' && trip.start_date_time ? extractIsoDateFromDateTime(trip.start_date_time) : ''),
      out_date:
        assignmentType === 'in-house' && trip.start_date_time
          ? extractIsoDateFromDateTime(trip.start_date_time)
          : '',
      in_date:
        assignmentType === 'in-house' && trip.end_date_time
          ? extractIsoDateFromDateTime(trip.end_date_time)
          : '',
      visit_duration_days: trip.visit_duration_days ?? '',
      out_time: assignmentType === 'in-house' ? extractTimeHHmmFromDateTime(trip.start_date_time) : '',
      in_time: assignmentType === 'in-house' ? extractTimeHHmmFromDateTime(trip.end_date_time) : '',
      departments_allotted: Array.isArray(trip.departments_allotted)
        ? trip.departments_allotted
        : (trip.issued_to_department ? trip.issued_to_department.split(',').map((d) => d.trim()).filter(Boolean) : []),
      expense_attachments: parseTripR2Keys(trip),
      remarks: assignmentType === 'in-house' ? (trip.remarks || '') : '',
      trip_purpose: trip.trip_purpose || '',
      issued_to_name: trip.issued_to_name || '',
      issued_to_department: trip.issued_to_department || '',
      start_date_time: trip.start_date_time || '',
      end_date_time: trip.end_date_time || '',
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
          .update({ trip_status: 'Completed' })
          .eq('id', tripId);

        if (error) throw error;
        if (trip?.vehicle_id) {
          await setVehicleStatus(trip.vehicle_id, 'Available');
        }
        toast.success("Completed", "Trip completed successfully");
        fetchTrips();
        fetchVehicles();
      } catch (error) {
        console.error('Error completing trip:', error);
        toast.error("Complete failed", "Failed to complete trip. Please try again.");
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
        toast.success("Cancelled", "Trip cancelled successfully");
        fetchTrips();
        fetchVehicles();
      } catch (error) {
        console.error('Error cancelling trip:', error);
        toast.error("Cancel failed", "Failed to cancel trip. Please try again.");
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
        toast.success("Deleted", "Trip deleted successfully");
        fetchTrips();
        fetchVehicles();
      } catch (error) {
        console.error('Error deleting trip:', error);
        toast.error("Delete failed", "Failed to delete trip. Please try again.");
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
      number_of_passengers: 0,
      passenger_entries: [],
      visit_date: '',
      out_date: '',
      in_date: '',
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

  const setPassengerEntries = (updater) => {
    setFormData((prev) => {
      const nextEntries = typeof updater === 'function' ? updater(prev.passenger_entries || []) : updater;
      return {
        ...prev,
        passenger_entries: nextEntries,
        number_of_passengers: nextEntries.length,
      };
    });
  };

  const addPassengerEntry = () => {
    setPassengerEntries((prev) => [...prev, createPassengerEntry()]);
  };

  const updatePassengerEntry = (id, name) => {
    setPassengerEntries((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, name } : entry))
    );
  };

  const removePassengerEntry = (id) => {
    setPassengerEntries((prev) => prev.filter((entry) => entry.id !== id));
  };

  const passengerCountDisplay = formData.passenger_entries.length > 0
    ? formData.passenger_entries.length
    : (toNumberOrNull(formData.number_of_passengers) ?? 0);

  const openTripAttachment = async (objectKey) => {
    try {
      const url = await presignFleetR2Get(objectKey);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast.error("File error", err?.message || "Could not open file.");
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

  const filteredTrips = trips.filter((trip) => {
    const vm = trip.operations_fire_tender_vehicle_master;
    const needle = searchTerm.trim().toLowerCase();
    const matchesSearch =
      !needle ||
      [
        vm?.registration_number,
        vm?.vehicle_type,
        vm?.make,
        vm?.model,
        trip.issued_to_name,
        trip.issued_to_department,
        trip.issued_to_contact,
        trip.trip_purpose,
        trip.origin_location,
        trip.destination_location,
        trip.trip_status,
        trip.driver_name,
        trip.remarks,
        trip.site_name,
        trip.deployment_location,
        trip.site_visit_location,
        formatDateDdMmYyyy(trip.created_at),
        formatDateTimeAmPmDdMmYyyy(trip.start_date_time),
        formatDateTimeAmPmDdMmYyyy(trip.end_date_time),
        getTripTimeDifference(trip),
        getTripOdometerDifference(trip),
        formatKmDisplay(getTripKmOut(trip)),
        formatKmDisplay(getTripKmIn(trip)),
      ].some((value) => String(value || '').toLowerCase().includes(needle));

    const matchesVehicle =
      vehicleFilter === 'All' || String(trip.vehicle_id) === String(vehicleFilter);

    const tripDate =
      extractIsoDateFromDateTime(trip.start_date_time) ||
      extractIsoDateFromDateTime(trip.end_date_time) ||
      toIsoDateOrNull(trip.created_at);
    const fromIso = toIsoDateOrNull(dateFrom);
    const toIso = toIsoDateOrNull(dateTo);
    const matchesDate =
      (!fromIso && !toIso) ||
      (Boolean(tripDate) &&
        (!fromIso || tripDate >= fromIso) &&
        (!toIso || tripDate <= toIso));

    const matchesStatus = statusFilter === 'All' || trip.trip_status === statusFilter;
    const matchesPurpose = purposeFilter === 'All' || trip.trip_purpose === purposeFilter;

    return matchesSearch && matchesVehicle && matchesDate && matchesStatus && matchesPurpose;
  });

  const sortedTrips = useMemo(() => {
    const { key, direction } = sortConfig;
    const mul = direction === 'asc' ? 1 : -1;
    const list = [...filteredTrips];

    const compareText = (a, b) =>
      String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'base' }) * mul;

    list.sort((a, b) => {
      switch (key) {
        case 'vehicle':
          return compareText(
            a.operations_fire_tender_vehicle_master?.registration_number,
            b.operations_fire_tender_vehicle_master?.registration_number
          );
        case 'created_at': {
          const av = a.created_at ? new Date(a.created_at).getTime() : 0;
          const bv = b.created_at ? new Date(b.created_at).getTime() : 0;
          return (av - bv) * mul;
        }
        case 'purpose':
          return compareText(a.trip_purpose, b.trip_purpose);
        case 'assignedTo':
          return compareText(a.issued_to_name, b.issued_to_name);
        case 'route':
          return compareText(
            `${a.origin_location || ''} ${a.destination_location || ''}`,
            `${b.origin_location || ''} ${b.destination_location || ''}`
          );
        case 'start_date_time': {
          const av = a.start_date_time ? new Date(a.start_date_time).getTime() : 0;
          const bv = b.start_date_time ? new Date(b.start_date_time).getTime() : 0;
          return (av - bv) * mul;
        }
        case 'end_date_time': {
          const av = a.end_date_time ? new Date(a.end_date_time).getTime() : 0;
          const bv = b.end_date_time ? new Date(b.end_date_time).getTime() : 0;
          return (av - bv) * mul;
        }
        case 'timeDifference': {
          const av = getTripDurationMinutes(a) ?? -1;
          const bv = getTripDurationMinutes(b) ?? -1;
          return (av - bv) * mul;
        }
        case 'odometerDiff': {
          const av = parseFloat(getTripOdometerDifference(a)) || -1;
          const bv = parseFloat(getTripOdometerDifference(b)) || -1;
          return (av - bv) * mul;
        }
        case 'status':
          return compareText(a.trip_status, b.trip_status);
        default:
          return 0;
      }
    });

    return list;
  }, [filteredTrips, sortConfig]);

  const monthlyVehicleReport = useMemo(() => {
    const monthTrips = trips.filter((trip) => tripMonthKey(trip) === reportMonth);
    const byVehicle = new Map();

    monthTrips.forEach((trip) => {
      const vehicleId = trip.vehicle_id ?? 'unknown';
      const registration =
        trip.operations_fire_tender_vehicle_master?.registration_number || 'Unknown vehicle';
      const vehicleType = trip.operations_fire_tender_vehicle_master?.vehicle_type || '';
      if (!byVehicle.has(vehicleId)) {
        byVehicle.set(vehicleId, {
          vehicleId,
          registration,
          vehicleType,
          tripCount: 0,
          completedCount: 0,
          activeCount: 0,
          cancelledCount: 0,
          totalDurationMinutes: 0,
          totalKm: 0,
        });
      }
      const row = byVehicle.get(vehicleId);
      row.tripCount += 1;
      if (trip.trip_status === 'Completed') row.completedCount += 1;
      else if (trip.trip_status === 'Active') row.activeCount += 1;
      else if (trip.trip_status === 'Cancelled') row.cancelledCount += 1;
      const mins = getTripDurationMinutes(trip);
      if (mins != null) row.totalDurationMinutes += mins;
      const kmDiff = parseFloat(getTripOdometerDifference(trip));
      if (Number.isFinite(kmDiff) && kmDiff >= 0) row.totalKm += kmDiff;
    });

    return [...byVehicle.values()].sort((a, b) =>
      String(a.registration).localeCompare(String(b.registration), undefined, { sensitivity: 'base' })
    );
  }, [trips, reportMonth]);

  const reportMonthLabel = useMemo(() => {
    const [y, m] = String(reportMonth || '').split('-').map(Number);
    if (!y || !m) return reportMonth;
    return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  }, [reportMonth]);

  const reportSelectedVehicle = useMemo(
    () => monthlyVehicleReport.find((row) => String(row.vehicleId) === String(reportVehicleId)) || null,
    [monthlyVehicleReport, reportVehicleId]
  );

  const reportVehicleTrips = useMemo(() => {
    if (reportVehicleId == null) return [];
    return trips
      .filter(
        (trip) =>
          tripMonthKey(trip) === reportMonth && String(trip.vehicle_id) === String(reportVehicleId)
      )
      .sort((a, b) => {
        const av = a.start_date_time ? new Date(a.start_date_time).getTime() : 0;
        const bv = b.start_date_time ? new Date(b.start_date_time).getTime() : 0;
        return bv - av;
      });
  }, [trips, reportMonth, reportVehicleId]);

  const tripsTotalPages = Math.max(1, Math.ceil(sortedTrips.length / TRIPS_PAGE_SIZE));
  const paginatedTrips = useMemo(() => {
    const start = (tripsPage - 1) * TRIPS_PAGE_SIZE;
    return sortedTrips.slice(start, start + TRIPS_PAGE_SIZE);
  }, [sortedTrips, tripsPage]);

  const reportTotalPages = Math.max(1, Math.ceil(monthlyVehicleReport.length / REPORT_PAGE_SIZE));
  const paginatedReportRows = useMemo(() => {
    const start = (reportPage - 1) * REPORT_PAGE_SIZE;
    return monthlyVehicleReport.slice(start, start + REPORT_PAGE_SIZE);
  }, [monthlyVehicleReport, reportPage]);

  const reportDetailTotalPages = Math.max(1, Math.ceil(reportVehicleTrips.length / REPORT_PAGE_SIZE));
  const paginatedReportVehicleTrips = useMemo(() => {
    const start = (reportDetailPage - 1) * REPORT_PAGE_SIZE;
    return reportVehicleTrips.slice(start, start + REPORT_PAGE_SIZE);
  }, [reportVehicleTrips, reportDetailPage]);

  useEffect(() => {
    setTripsPage(1);
  }, [searchTerm, vehicleFilter, dateFrom, dateTo, statusFilter, purposeFilter, sortConfig, vehicleCategory]);

  useEffect(() => {
    setReportPage(1);
    setReportVehicleId(null);
    setReportDetailPage(1);
  }, [reportMonth, vehicleCategory]);

  useEffect(() => {
    if (tripsPage > tripsTotalPages) setTripsPage(tripsTotalPages);
  }, [tripsPage, tripsTotalPages]);

  useEffect(() => {
    if (reportPage > reportTotalPages) setReportPage(reportTotalPages);
  }, [reportPage, reportTotalPages]);

  useEffect(() => {
    if (reportDetailPage > reportDetailTotalPages) setReportDetailPage(reportDetailTotalPages);
  }, [reportDetailPage, reportDetailTotalPages]);

  const exportReportToExcel = () => {
    if (reportVehicleId != null) {
      const rows = reportVehicleTrips.map((trip, index) => ({
        'S.No': index + 1,
        Vehicle: trip.operations_fire_tender_vehicle_master?.registration_number || '',
        Type: trip.operations_fire_tender_vehicle_master?.vehicle_type || '',
        Purpose: trip.trip_purpose || '',
        'Assigned To': trip.issued_to_name || '',
        Passenger: formatTripPassengersDisplay(trip) || '',
        Department: trip.issued_to_department || '',
        From: trip.origin_location || '',
        To: trip.destination_location || '',
        Out: formatDateTimeAmPmDdMmYyyy(trip.start_date_time) || '',
        In: formatDateTimeAmPmDdMmYyyy(trip.end_date_time) || '',
        Difference: getTripTimeDifference(trip) || '',
        'Km Out': formatKmDisplay(getTripKmOut(trip)),
        'Km In': formatKmDisplay(getTripKmIn(trip)),
        'Km Diff': getTripOdometerDifference(trip) || '',
        Status: trip.trip_status || '',
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Vehicle Trips');
      const reg = reportSelectedVehicle?.registration || 'vehicle';
      XLSX.writeFile(wb, `vehicle-trips-${reg}-${reportMonth}.xlsx`);
      return;
    }

    const rows = monthlyVehicleReport.map((row, index) => ({
      'S.No': index + 1,
      Vehicle: row.registration,
      Type: row.vehicleType || '',
      Trips: row.tripCount,
      Active: row.activeCount,
      Completed: row.completedCount,
      Cancelled: row.cancelledCount,
      'Total Km': formatKmDisplay(row.totalKm),
      'Total Duration': formatDurationMinutes(row.totalDurationMinutes) || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Monthly Report');
    XLSX.writeFile(wb, `vehicle-trips-monthly-${reportMonth}.xlsx`);
  };

  const renderPaginationBar = ({ page, totalPages, totalItems, pageSize, onPageChange }) => {
    if (totalItems === 0) return null;
    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, totalItems);
    return (
      <div className="flex flex-col gap-3 border-t border-gray-200 bg-gray-50 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-gray-600">
          Showing {start}-{end} of {totalItems}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium ${
              page <= 1
                ? 'cursor-not-allowed bg-gray-100 text-gray-400'
                : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </button>
          <span className="px-2 text-sm text-gray-700">
            Page {page} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium ${
              page >= totalPages
                ? 'cursor-not-allowed bg-gray-100 text-gray-400'
                : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  };

  const toggleSort = (key) => {
    setSortConfig((prev) =>
      prev.key === key ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' }
    );
  };

  const renderSortableHeader = (label, key, className = 'text-left') => {
    const isSorted = sortConfig.key === key;
    const SortIcon = isSorted ? (sortConfig.direction === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
    return (
      <button
        type="button"
        onClick={() => toggleSort(key)}
        className={`inline-flex max-w-full items-center gap-1 hover:text-gray-700 ${className === 'text-center' ? 'justify-center w-full' : ''}`}
        title={`Sort by ${label}`}
      >
        <span className="truncate">{label}</span>
        <SortIcon className={`h-3.5 w-3.5 shrink-0 ${isSorted ? 'text-blue-600' : 'text-gray-400'}`} />
      </button>
    );
  };

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
        {tripsView === 'list' && (
          <button
            onClick={() => setShowForm(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-2"
          >
            <Plus className="h-5 w-5" />
            <span>Assign Vehicle</span>
          </button>
        )}
      </div>

      <div className="border-b border-gray-200">
        <nav className="flex space-x-6">
          <button
            type="button"
            onClick={() => setTripsView('list')}
            className={`flex items-center space-x-2 border-b-2 py-3 text-sm font-medium transition-colors ${
              tripsView === 'list'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            <MapPin className="h-4 w-4" />
            <span>Trips</span>
          </button>
          <button
            type="button"
            onClick={() => setTripsView('reports')}
            className={`flex items-center space-x-2 border-b-2 py-3 text-sm font-medium transition-colors ${
              tripsView === 'reports'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            <FileText className="h-4 w-4" />
            <span>Reports</span>
          </button>
        </nav>
      </div>

      {tripsView === 'reports' ? (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                {reportVehicleId != null ? (
                  <button
                    type="button"
                    onClick={() => {
                      setReportVehicleId(null);
                      setReportDetailPage(1);
                    }}
                    className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to monthly summary
                  </button>
                ) : null}
                <h2 className="text-lg font-semibold text-gray-900">
                  {reportVehicleId != null
                    ? `Trips — ${reportSelectedVehicle?.registration || 'Vehicle'}`
                    : 'Monthly trips by vehicle'}
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  {reportVehicleId != null
                    ? `${reportMonthLabel} · ${reportVehicleTrips.length} trip${reportVehicleTrips.length === 1 ? '' : 's'}`
                    : `Summary for ${reportMonthLabel} — click a vehicle to view its trips`}
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="min-w-[11rem]">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Month</label>
                  <input
                    type="month"
                    value={reportMonth}
                    onChange={(e) => setReportMonth(e.target.value || currentYearMonth())}
                    className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={exportReportToExcel}
                  disabled={
                    reportVehicleId != null
                      ? reportVehicleTrips.length === 0
                      : monthlyVehicleReport.length === 0
                  }
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-gray-700 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  <Download className="h-4 w-4" />
                  Export Excel
                </button>
              </div>
            </div>
          </div>

          {reportVehicleId != null ? (
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  Vehicle Trips ({reportVehicleTrips.length})
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">S.No</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Purpose</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Assigned To</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Passenger</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Route</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Out</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">In</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Difference</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Km Diff</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {paginatedReportVehicleTrips.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-4 py-10 text-center text-gray-500">
                          No trips for this vehicle in the selected month.
                        </td>
                      </tr>
                    ) : (
                      paginatedReportVehicleTrips.map((trip, index) => (
                        <tr key={trip.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-500">
                            {(reportDetailPage - 1) * REPORT_PAGE_SIZE + index + 1}
                          </td>
                          <td className="px-4 py-3 text-gray-900">{trip.trip_purpose || '—'}</td>
                          <td className="px-4 py-3 text-gray-900">{trip.issued_to_name || '—'}</td>
                          <td className="px-4 py-3 text-gray-700">{formatTripPassengersDisplay(trip) || '—'}</td>
                          <td className="px-4 py-3 text-gray-700">
                            {trip.origin_location || '—'} → {trip.destination_location || '—'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-900">
                            {formatDateTimeAmPmDdMmYyyy(trip.start_date_time) || '—'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-900">
                            {formatDateTimeAmPmDdMmYyyy(trip.end_date_time) || '—'}
                          </td>
                          <td className="px-4 py-3 text-gray-900">{getTripTimeDifference(trip) || '—'}</td>
                          <td className="px-4 py-3 text-gray-900">
                            {getTripOdometerDifference(trip) ? `${getTripOdometerDifference(trip)} km` : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColor(trip.trip_status)}`}>
                              {trip.trip_status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {renderPaginationBar({
                page: reportDetailPage,
                totalPages: reportDetailTotalPages,
                totalItems: reportVehicleTrips.length,
                pageSize: REPORT_PAGE_SIZE,
                onPageChange: setReportDetailPage,
              })}
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  Vehicles ({monthlyVehicleReport.length})
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">S.No</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Vehicle</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Type</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Trips</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Active</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Completed</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Cancelled</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Total Km</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Total Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {paginatedReportRows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-10 text-center text-gray-500">
                          No trips found for this month.
                        </td>
                      </tr>
                    ) : (
                      paginatedReportRows.map((row, index) => (
                        <tr
                          key={row.vehicleId}
                          className="cursor-pointer hover:bg-blue-50"
                          onClick={() => {
                            setReportVehicleId(row.vehicleId);
                            setReportDetailPage(1);
                          }}
                        >
                          <td className="px-4 py-3 text-gray-500">
                            {(reportPage - 1) * REPORT_PAGE_SIZE + index + 1}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                setReportVehicleId(row.vehicleId);
                                setReportDetailPage(1);
                              }}
                            >
                              {row.registration}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{row.vehicleType || '—'}</td>
                          <td className="px-4 py-3 text-right text-gray-900">{row.tripCount}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{row.activeCount}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{row.completedCount}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{row.cancelledCount}</td>
                          <td className="px-4 py-3 text-right text-gray-900">{formatKmDisplay(row.totalKm)}</td>
                          <td className="px-4 py-3 text-right text-gray-900">
                            {formatDurationMinutes(row.totalDurationMinutes) || '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {renderPaginationBar({
                page: reportPage,
                totalPages: reportTotalPages,
                totalItems: monthlyVehicleReport.length,
                pageSize: REPORT_PAGE_SIZE,
                onPageChange: setReportPage,
              })}
            </div>
          )}
        </div>
      ) : (
      <>
      {/* Filters and Search */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="min-w-0 sm:col-span-2">
            <label className="mb-1.5 block text-xs font-medium text-gray-600">Search</label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center pl-3">
                <Search className="h-4 w-4 text-gray-400" aria-hidden />
              </span>
              <input
                type="text"
                placeholder="Search vehicle, person, route, purpose, status…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-10 w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="min-w-0">
            <label className="mb-1.5 block text-xs font-medium text-gray-600">Vehicle</label>
            <select
              value={vehicleFilter}
              onChange={(e) => setVehicleFilter(e.target.value)}
              className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="All">All Vehicles</option>
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.registration_number}
                  {vehicle.vehicle_type ? ` — ${vehicle.vehicle_type}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label className="mb-1.5 block text-xs font-medium text-gray-600">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="All">All Status</option>
              {tripStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label className="mb-1.5 block text-xs font-medium text-gray-600">From date</label>
            <FormDateInput
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="min-w-0">
            <label className="mb-1.5 block text-xs font-medium text-gray-600">To date</label>
            <FormDateInput
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="min-w-0">
            <label className="mb-1.5 block text-xs font-medium text-gray-600">Purpose</label>
            <select
              value={purposeFilter}
              onChange={(e) => setPurposeFilter(e.target.value)}
              className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="All">All Purposes</option>
              {tripPurposes.map((purpose) => (
                <option key={purpose} value={purpose}>
                  {purpose}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label className="mb-1.5 block text-xs font-medium text-transparent select-none" aria-hidden>
              Export
            </label>
            <button
              type="button"
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-gray-600 px-4 text-sm font-medium text-white hover:bg-gray-700"
            >
              <Download className="h-4 w-4" />
              <span>Export</span>
            </button>
          </div>
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
                    <div className="min-w-0">
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">Trip Status *</label>
                      <select
                        value={formData.trip_status}
                        onChange={(e) => setFormData({ ...formData, trip_status: e.target.value })}
                        className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      >
                        {tripStatuses.map((status) => (
                          <option key={status} value={status}>{status}</option>
                        ))}
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
                          <label className="mb-1.5 block text-sm font-medium text-gray-700">Number of Passengers *</label>
                          <input
                            type="text"
                            value={passengerCountDisplay}
                            readOnly
                            className="h-10 w-full rounded-lg border border-gray-300 bg-gray-50 px-3 text-sm text-gray-700"
                            aria-describedby="passenger-count-hint"
                          />
                          <p id="passenger-count-hint" className="mt-1 text-xs text-gray-500">
                            Updates automatically as passengers are added or removed.
                          </p>
                        </div>
                        <div className="min-w-0">
                          <label className="mb-1.5 block text-sm font-medium text-gray-700">Visit Date *</label>
                          <FormDateInput
                            value={formData.visit_date}
                            onChange={(e) => {
                              const visit_date = e.target.value;
                              setFormData((prev) => ({
                                ...prev,
                                visit_date,
                                out_date: prev.out_date || visit_date,
                                in_date: prev.in_date || prev.out_date || visit_date,
                              }));
                            }}
                            className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                          />
                        </div>
                        <div className="min-w-0">
                          <label className="mb-1.5 block text-sm font-medium text-gray-700">Visit Duration (Days)</label>
                          <input type="number" min="0" value={formData.visit_duration_days} onChange={(e) => setFormData({ ...formData, visit_duration_days: e.target.value })} className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                      </div>
                    </section>

                    <section className="rounded-lg border border-gray-200 p-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Passengers</h3>
                        <button
                          type="button"
                          onClick={addPassengerEntry}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-50 px-3 text-sm font-medium text-blue-700 hover:bg-blue-100"
                        >
                          <Plus className="h-4 w-4" />
                          Add passenger
                        </button>
                      </div>
                      {formData.passenger_entries.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-4 text-sm text-gray-500">
                          No passengers added yet. Use Add passenger to enter names — the count updates automatically.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {formData.passenger_entries.map((entry, index) => (
                            <div key={entry.id} className="flex items-center gap-2">
                              <span className="w-7 shrink-0 text-center text-xs font-medium text-gray-400">
                                {index + 1}
                              </span>
                              <PassengerNameSuggestInput
                                value={entry.name}
                                onChange={(name) => updatePassengerEntry(entry.id, name)}
                                people={peopleMasterOptions}
                                placeholder={`Passenger ${index + 1} name`}
                                className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                              <button
                                type="button"
                                onClick={() => removePassengerEntry(entry.id)}
                                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                                aria-label={`Remove passenger ${index + 1}`}
                                title="Remove"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>

                    <section className="rounded-lg border border-gray-200 p-4">
                      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Time</h3>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                        <div className="min-w-0">
                          <label className="mb-1.5 block text-sm font-medium text-gray-700">Out Date *</label>
                          <FormDateInput
                            value={formData.out_date}
                            onChange={(e) => {
                              const out_date = e.target.value;
                              setFormData((prev) => ({
                                ...prev,
                                out_date,
                                in_date: prev.in_date || out_date,
                              }));
                            }}
                            className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                          />
                        </div>
                        <div className="min-w-0">
                          <label className="mb-1.5 block text-sm font-medium text-gray-700">Out Time *</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="HH:mm"
                            value={formData.out_time || ''}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^\d:]/g, '').slice(0, 5);
                              setFormData({ ...formData, out_time: raw });
                            }}
                            onBlur={() =>
                              setFormData((prev) => ({
                                ...prev,
                                out_time: normalizeTimeHHmmInput(prev.out_time),
                              }))
                            }
                            autoComplete="off"
                            className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div className="min-w-0">
                          <label className="mb-1.5 block text-sm font-medium text-gray-700">In Date</label>
                          <FormDateInput
                            value={formData.in_date}
                            onChange={(e) => setFormData({ ...formData, in_date: e.target.value })}
                            className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div className="min-w-0">
                          <label className="mb-1.5 block text-sm font-medium text-gray-700">In Time</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="HH:mm"
                            value={formData.in_time || ''}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^\d:]/g, '').slice(0, 5);
                              setFormData({ ...formData, in_time: raw });
                            }}
                            onBlur={() =>
                              setFormData((prev) => ({
                                ...prev,
                                in_time: normalizeTimeHHmmInput(prev.in_time),
                              }))
                            }
                            autoComplete="off"
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
                      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Department(s) allotted *</h3>
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
                          <label className="mb-1.5 block text-sm font-medium text-gray-700">Odometer Out (Km) *</label>
                          <input type="number" min="0" value={formData.km_out} onChange={(e) => setFormData({ ...formData, km_out: e.target.value })} className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500" required />
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
            Vehicle Trips ({sortedTrips.length})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1280px] w-full table-fixed divide-y divide-gray-200 text-sm">
            <colgroup>
              <col className="w-12" />
              <col className="w-[6.5rem]" />
              <col className="w-[7.5rem]" />
              <col className="w-[8.5rem]" />
              <col className="w-[9.5rem]" />
              <col className="w-[8.5rem]" />
              <col className="w-[8rem]" />
              <col className="w-[10rem]" />
              <col className="w-[10rem]" />
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
                  {renderSortableHeader('Created', 'created_at')}
                </th>
                <th className="px-3 py-2.5 text-left align-middle text-xs font-medium uppercase tracking-wider text-gray-500">
                  {renderSortableHeader('Vehicle', 'vehicle')}
                </th>
                <th className="px-3 py-2.5 text-left align-middle text-xs font-medium uppercase tracking-wider text-gray-500">
                  {renderSortableHeader('Purpose', 'purpose')}
                </th>
                <th className="px-3 py-2.5 text-left align-middle text-xs font-medium uppercase tracking-wider text-gray-500">
                  {renderSortableHeader('Assigned To', 'assignedTo')}
                </th>
                <th className="px-3 py-2.5 text-left align-middle text-xs font-medium uppercase tracking-wider text-gray-500">
                  Passenger
                </th>
                <th className="px-3 py-2.5 text-left align-middle text-xs font-medium uppercase tracking-wider text-gray-500">
                  {renderSortableHeader('Route', 'route')}
                </th>
                <th className="px-3 py-2.5 text-left align-middle text-xs font-medium uppercase tracking-wider text-gray-500">
                  {renderSortableHeader('Out', 'start_date_time')}
                </th>
                <th className="px-3 py-2.5 text-left align-middle text-xs font-medium uppercase tracking-wider text-gray-500">
                  {renderSortableHeader('In', 'end_date_time')}
                </th>
                <th className="px-3 py-2.5 text-left align-middle text-xs font-medium uppercase tracking-wider text-gray-500">
                  {renderSortableHeader('Difference', 'timeDifference')}
                </th>
                <th className="px-3 py-2.5 text-left align-middle text-xs font-medium uppercase tracking-wider text-gray-500">
                  {renderSortableHeader('Odometer (Km)', 'odometerDiff')}
                </th>
                <th className="px-3 py-2.5 text-left align-middle text-xs font-medium uppercase tracking-wider text-gray-500">
                  Files
                </th>
                <th className="px-3 py-2.5 text-left align-middle text-xs font-medium uppercase tracking-wider text-gray-500">
                  {renderSortableHeader('Status', 'status')}
                </th>
                <th className="px-3 py-2.5 text-center align-middle text-xs font-medium uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {paginatedTrips.map((trip, idx) => {
                const attachmentKeys = parseTripR2Keys(trip);
                const outDateTime = formatDateTimeAmPmDdMmYyyy(trip.start_date_time);
                const inDateTime = formatDateTimeAmPmDdMmYyyy(trip.end_date_time);
                const timeDiff = getTripTimeDifference(trip);
                const kmOut = getTripKmOut(trip);
                const kmIn = getTripKmIn(trip);
                const kmDiff = getTripOdometerDifference(trip);

                return (
                <tr key={trip.id} className="hover:bg-gray-50">
                  <td className="px-3 py-3 align-middle text-center tabular-nums text-gray-700">
                    {(tripsPage - 1) * TRIPS_PAGE_SIZE + idx + 1}
                  </td>
                  <td className="px-3 py-3 align-middle whitespace-nowrap text-xs tabular-nums text-gray-900">
                    {formatDateDdMmYyyy(trip.created_at) || '—'}
                  </td>
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
                    <div className="line-clamp-3 text-xs leading-snug text-gray-900">
                      {formatTripPassengersDisplay(trip) || '—'}
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
                  <td className="px-3 py-3 align-middle whitespace-nowrap text-xs tabular-nums text-gray-900">
                    {outDateTime || '—'}
                  </td>
                  <td className="px-3 py-3 align-middle whitespace-nowrap text-xs tabular-nums text-gray-900">
                    {inDateTime || '—'}
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
        {renderPaginationBar({
          page: tripsPage,
          totalPages: tripsTotalPages,
          totalItems: sortedTrips.length,
          pageSize: TRIPS_PAGE_SIZE,
          onPageChange: setTripsPage,
        })}
        {sortedTrips.length === 0 && (
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
      </>
      )}
    </div>
  );
};

export default VehicleTrips;
