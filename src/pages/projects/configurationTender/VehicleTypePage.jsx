import React, { useState } from "react";
import FireTenderNavbar from "../FireTenderNavbar";

const VehicleTypePage = () => {
  const [vehicleTypes, setVehicleTypes] = useState(["Truck", "Bus"]);
  const [newType, setNewType] = useState("");

  const handleAdd = () => {
    if (newType.trim() === "") return;
    setVehicleTypes([...vehicleTypes, newType]);
    setNewType("");
  };

  const handleDelete = (index) => {
    const updated = [...vehicleTypes];
    updated.splice(index, 1);
    setVehicleTypes(updated);
  };

  return (
    <div className="p-6">
      <FireTenderNavbar />
      {/* Header with New button */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Vehicle Type</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            placeholder="Enter vehicle type"
            className="border rounded px-3 py-1"
          />
          <button
            onClick={handleAdd}
            className="bg-purple-600 text-white px-4 py-1 rounded"
          >
            New
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white shadow rounded-lg">
        <table className="min-w-full border-collapse">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {vehicleTypes.map((type, index) => (
              <tr key={index} className="border-t">
                <td className="px-4 py-2">{type}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => handleDelete(index)}
                    className="text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}

            {vehicleTypes.length === 0 && (
              <tr>
                <td
                  colSpan="2"
                  className="px-4 py-2 text-center text-gray-500"
                >
                  No vehicle types added yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default VehicleTypePage;
