import React from "react";
import AttendanceEntryPage from "./AttendanceEntryPage";

/** Same editing + search as Attendance; kept as a separate tab for Admin workflows. */
export default function AdminAttendanceViewPage() {
  return (
    <AttendanceEntryPage
      pageTitle="Admin attendance view"
      pageSubtitle="Full-cycle grid with edit and search. Changes save as you go."
    />
  );
}
