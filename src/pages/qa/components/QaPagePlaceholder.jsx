import React from "react";
import { LoadingBlock, PageTaskHeader } from "../../../components/erpUi";

export default function QaPagePlaceholder({ title, subtitle = "This screen is loading…" }) {
  return (
    <>
      <PageTaskHeader title={title} subtitle={subtitle} />
      <LoadingBlock label="Preparing…" />
    </>
  );
}
