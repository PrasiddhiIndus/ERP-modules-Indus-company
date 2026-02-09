// src/pages/ExcelUploadPage.jsx
import React, { useState } from "react";
import * as XLSX from "xlsx";

const ExcelUploadPage = ({ onDataLoaded }) => {
  const [fileName, setFileName] = useState("");

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: "array" });

      // assuming your sheet is the first one
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      // convert to JSON
      const rows = XLSX.utils.sheet_to_json(sheet);

      /**
       * Expected Sheet Format:
       * MainComponent | SubCategory1 | SubCategory2 | SubCategory3 | SubCategory4 | SubCategory5
       */

      const parsedData = {
        mainComponents: [],
        subCategory1: [],
        subCategory2: [],
        subCategory3: [],
        subCategory4: [],
        subCategory5: [],
      };

      rows.forEach((row) => {
        const mainComp = row["MainComponent"];
        if (mainComp && !parsedData.mainComponents.includes(mainComp)) {
          parsedData.mainComponents.push(mainComp);
        }

        if (row["SubCategory1"]) {
          parsedData.subCategory1.push({
            name: row["SubCategory1"],
            mainComponent: mainComp,
          });
        }
        if (row["SubCategory2"]) {
          parsedData.subCategory2.push({
            name: row["SubCategory2"],
            mainComponent: mainComp,
            subCategory1: row["SubCategory1"],
          });
        }
        if (row["SubCategory3"]) {
          parsedData.subCategory3.push({
            name: row["SubCategory3"],
            mainComponent: mainComp,
            subCategory1: row["SubCategory1"],
            subCategory2: row["SubCategory2"],
          });
        }
        if (row["SubCategory4"]) {
          parsedData.subCategory4.push({
            name: row["SubCategory4"],
            mainComponent: mainComp,
            subCategory1: row["SubCategory1"],
            subCategory2: row["SubCategory2"],
            subCategory3: row["SubCategory3"],
          });
        }
        if (row["SubCategory5"]) {
          parsedData.subCategory5.push({
            name: row["SubCategory5"],
            mainComponent: mainComp,
            subCategory1: row["SubCategory1"],
            subCategory2: row["SubCategory2"],
            subCategory3: row["SubCategory3"],
            subCategory4: row["SubCategory4"],
          });
        }
      });

      onDataLoaded(parsedData);
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h2 className="text-lg font-semibold mb-2">Upload Excel/ODS File</h2>
      <input type="file" accept=".xlsx,.xls,.ods" onChange={handleFileUpload} />
      {fileName && <p className="mt-2 text-green-600">Uploaded: {fileName}</p>}
    </div>
  );
};

export default ExcelUploadPage;
