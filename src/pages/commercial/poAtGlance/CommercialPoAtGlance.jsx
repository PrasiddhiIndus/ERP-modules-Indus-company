import React from "react";
import CommercialPoAtGlanceShell from "./CommercialPoAtGlanceShell";
import CommercialPoList from "./CommercialPoList";

/** Commercial → PO At Glance: the IEV PO At Glance workflow on its own Commercial records, in the Commercial OC format. */
export default function CommercialPoAtGlance() {
  return (
    <CommercialPoAtGlanceShell>
      <CommercialPoList />
    </CommercialPoAtGlanceShell>
  );
}
