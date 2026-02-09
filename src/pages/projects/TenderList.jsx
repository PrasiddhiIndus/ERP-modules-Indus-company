// src/components/FireTender/TenderList.jsx
import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useNavigate, useLocation } from "react-router-dom";
import FireTenderNavbar from "./FireTenderNavbar";

const TenderList = () => {
    const [tenders, setTenders] = useState([]);
    const navigate = useNavigate();
    const location = useLocation(); // re-fetch when location changes

    const generateTenderNumber = (running, numberRunning) => {
        const now = new Date();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const year = String(now.getFullYear()).slice(-2);
        return `IFSPL/Ad-X/${running}/${month}-${year}-${numberRunning}`;
    };

    const fetchTenders = async () => {
        const { data, error } = await supabase
            .from("tenders")
            .select("*, tender_contacts(*)")
            .order("created_at", { ascending: false });

        if (error) {
            console.error(error);
        } else {
            setTenders(data);
        }
    };

    useEffect(() => {
        fetchTenders();
    }, [location]); // re-run whenever navigation happens (ensures fresh list after update)

    const handleApprove = async (id) => {
        const tender = tenders.find((t) => t.id === id);
        let tenderNumber = tender.tender_number;

        if (!tenderNumber) {
            const approvedCount = tenders.filter((t) => t.tender_number).length;
            const running = String(approvedCount + 1).padStart(5, "0");
            const numberRunning = approvedCount + 1;
            tenderNumber = generateTenderNumber(running, numberRunning);
        }

        const { error } = await supabase
            .from("tenders")
            .update({ status: "Approved", tender_number: tenderNumber })
            .eq("id", id);

        if (!error) {
            setTenders((prev) =>
                prev.map((t) => (t.id === id ? { ...t, status: "Approved", tender_number: tenderNumber } : t))
            );
        } else {
            console.error(error);
            alert("Error approving tender!");
        }
    };

    const handleReject = async (id) => {
        const tender = tenders.find((t) => t.id === id);
        let tenderNumber = tender.tender_number;

        if (!tenderNumber) {
            const approvedCount = tenders.filter((t) => t.tender_number).length;
            const running = String(approvedCount + 1).padStart(5, "0");
            const numberRunning = approvedCount + 1;
            tenderNumber = generateTenderNumber(running, numberRunning);
        }

        const { error } = await supabase
            .from("tenders")
            .update({ status: "Rejected", tender_number: tenderNumber })
            .eq("id", id);

        if (!error) {
            setTenders((prev) =>
                prev.map((t) => (t.id === id ? { ...t, status: "Rejected", tender_number: tenderNumber } : t))
            );
        } else {
            console.error(error);
            alert("Error rejecting tender!");
        }
    };

    const handleDelete = async (id) => {
        await supabase.from("tenders").delete().eq("id", id);
        setTenders((prev) => prev.filter((t) => t.id !== id));
    };

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <FireTenderNavbar />

            <h2 className="text-xl font-bold mb-4">TENDER DETAILS</h2>

            {tenders.length === 0 ? (
                <p className="text-gray-500">No tenders available yet.</p>
            ) : (
                <div className="space-y-4">
                    {tenders.map((tender) => (
                        <div
                            key={tender.id}
                            className="p-4 bg-white border rounded-lg shadow flex flex-col md:flex-row md:items-center md:justify-between"
                        >
                            <div>
                                <p className="font-bold text-lg">{tender.client}</p>
                                <p className="text-sm text-gray-600">{tender.email} | {tender.phone}</p>
                                <p className="text-sm text-gray-600">
                                    Due: {tender.due_date ? new Date(tender.due_date).toLocaleDateString() : "N/A"}
                                </p>
                                <p className="text-sm">Enquiry No: <span className="font-semibold text-blue-600">{tender.enquiry_number}</span></p>
                                <p className="text-sm">Tender No: <span className={tender.status === "Rejected" ? "text-red-600 font-semibold" : "text-gray-800 font-semibold"}>{tender.tender_number || "Not Assigned"}</span></p>
                                <p className="text-sm">Status: <span className={tender.status === "Approved" ? "text-green-600 font-semibold" : tender.status === "Rejected" ? "text-red-600 font-semibold" : "text-gray-600"}>{tender.status || "Pending"}</span></p>
                            </div>

                            <div className="flex flex-wrap gap-2 mt-3 md:mt-0">
                                <button onClick={() => navigate(`/fire-tender/${tender.id}`)} className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600">Edit</button>
                                <button onClick={() => handleApprove(tender.id)} className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700">Approve</button>
                                <button onClick={() => handleReject(tender.id)} className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600">Reject</button>
                                <button onClick={() => handleDelete(tender.id)} className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700">Delete</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default TenderList;
