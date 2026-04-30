import React from "react";
import { useParams } from "react-router-dom";
import InternalQuotationListRm from "./internal-quotation/InternalQuotationListRm";
import InternalQuotationFormRm from "./internal-quotation/InternalQuotationFormRm";

const InternalQuotation = () => {
  const { id } = useParams();
  return id ? <InternalQuotationFormRm /> : <InternalQuotationListRm />;
};

export default InternalQuotation;
