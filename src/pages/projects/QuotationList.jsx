import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase"; // ✅ your Supabase client
import FireTenderNavbar from "./FireTenderNavbar";

// Function to generate unique quotation number
const generateQuotationNumber = (index) => {
  const paddedIndex = String(index + 1).padStart(4, "0");
  return `QN/IFSPL/FT/${paddedIndex}`;
};

const QuotationList = () => {
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchApprovedTenders = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get current user
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
          throw new Error("User not authenticated");
        }

        // ✅ 1️⃣ Get all approved quotation items for current user
        const { data: approvedItems, error: approvedError } = await supabase
          .from("approved_quotation_items")
          .select("tender_id")
          .eq("user_id", user.id);

        if (approvedError) throw approvedError;

        const tenderIds = [...new Set(approvedItems.map((i) => i.tender_id))];

        if (tenderIds.length === 0) {
          setQuotations([]);
          setLoading(false);
          return;
        }

        // ✅ 2️⃣ Fetch corresponding tenders
        const { data: tenders, error: tendersError } = await supabase
          .from("tenders")
          .select("id, tender_number, client, status")
          .in("id", tenderIds);

        if (tendersError) throw tendersError;

        // ✅ 3️⃣ Check for existing quotations in DB for current user
        const { data: existingQuotations, error: quotationsError } =
          await supabase
            .from("quotations")
            .select("*")
            .eq("user_id", user.id);

        if (quotationsError) throw quotationsError;

        // ✅ 4️⃣ Map tenders with fixed quotation numbers
        const finalQuotations = [];
        let newQuotationsToInsert = [];

        for (let i = 0; i < tenders.length; i++) {
          const tender = tenders[i];
          const existing = existingQuotations.find(
            (q) => q.tender_id === tender.id
          );

          if (existing) {
            // Already has fixed quotation number
            finalQuotations.push({
              id: tender.id,
              tenderNumber: tender.tender_number,
              quotationNumber: existing.quotation_number,
              client: tender.client,
              status: tender.status || "Approved",
            });
          } else {
            // Generate new unique number and store in DB
            const quotationNumber = generateQuotationNumber(
              existingQuotations.length + newQuotationsToInsert.length
            );

            newQuotationsToInsert.push({
              tender_id: tender.id,
              quotation_number: quotationNumber,
            });

            finalQuotations.push({
              id: tender.id,
              tenderNumber: tender.tender_number,
              quotationNumber,
              client: tender.client,
              status: tender.status || "Approved",
            });
          }
        }

        // ✅ 5️⃣ Insert only new quotation numbers into Supabase
        // QuotationList.tsx  (only the part that inserts the base row)
        if (newQuotationsToInsert.length > 0) {
          const { error: insertError } = await supabase
            .from("quotations")
            .insert(
              newQuotationsToInsert.map((q) => ({
                tender_id: q.tender_id,
                quotation_number: q.quotation_number,
                base_quotation_no: q.quotation_number,
                version: 0,
                user_id: user.id,
              }))
            );
          if (insertError) throw insertError;
        }
        // if (newQuotationsToInsert.length > 0) {
        //   const { error: insertError } = await supabase
        //     .from("quotations")
        //     .insert(newQuotationsToInsert);
        //   if (insertError) throw insertError;
        // }

        setQuotations(finalQuotations);
      } catch (err) {
        console.error("Error fetching quotations:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchApprovedTenders();
  }, []);

  return (
    <div className="p-6">
      <FireTenderNavbar />
      <h2 className="text-2xl font-semibold mb-4">Quotation Sheet</h2>

      {loading && <p className="text-gray-600">Loading quotations...</p>}
      {error && <p className="text-red-600">Error: {error}</p>}

      {!loading && !error && (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <table className="min-w-full border-collapse">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-2 border">Tender No.</th>
                <th className="px-4 py-2 border">Quotation No.</th>
                <th className="px-4 py-2 border">Client</th>
                <th className="px-4 py-2 border">Status</th>
              </tr>
            </thead>
            <tbody>
              {quotations.length === 0 ? (
                <tr>
                  <td
                    colSpan="4"
                    className="px-4 py-2 text-center text-gray-500"
                  >
                    No approved quotations found.
                  </td>
                </tr>
              ) : (
                quotations.map((q) => (
                  <tr key={q.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <Link
                        to={`/fire-tender/quotation/${q.id}`}
                        state={{ quotation: q }}
                        className="text-blue-600 hover:underline"
                      >
                        {q.tenderNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-2 font-medium">
                      {q.quotationNumber}
                    </td>
                    <td className="px-4 py-2">{q.client || "N/A"}</td>
                    <td className="px-4 py-2 text-green-600 font-medium">
                      {q.status}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default QuotationList;
