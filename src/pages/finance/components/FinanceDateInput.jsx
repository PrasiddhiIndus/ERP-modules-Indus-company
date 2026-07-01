import React, { useEffect, useState } from "react";
import { formatFinanceDate, parseFinanceDateInput } from "../lib/formatters";

/** Text date field — display and entry as dd/mm/yyyy (stores ISO YYYY-MM-DD). */
export function FinanceDateInput({
  value,
  onChange,
  className = "",
  placeholder = "dd/mm/yyyy",
  ...rest
}) {
  const [text, setText] = useState(() => formatFinanceDate(value));

  useEffect(() => {
    setText(formatFinanceDate(value));
  }, [value]);

  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      className={className}
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        const next = e.target.value;
        setText(next);
        if (!next.trim()) {
          onChange?.(null);
          return;
        }
        const iso = parseFinanceDateInput(next);
        if (iso) onChange?.(iso);
      }}
      onBlur={() => {
        const iso = parseFinanceDateInput(text);
        if (iso) {
          onChange?.(iso);
          setText(formatFinanceDate(iso));
        } else if (!text.trim()) {
          onChange?.(null);
          setText("");
        } else {
          setText(formatFinanceDate(value));
        }
      }}
    />
  );
}
