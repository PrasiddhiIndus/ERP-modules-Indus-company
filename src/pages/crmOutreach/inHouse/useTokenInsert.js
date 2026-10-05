import { useCallback, useRef } from 'react';

/** Insert a merge token at the textarea cursor (same behaviour as the Client composer). */
export default function useTokenInsert(body, setBody) {
  const bodyRef = useRef(null);
  const insertToken = useCallback(
    (token) => {
      const el = bodyRef.current;
      if (!el) {
        setBody((prev) => prev + token);
        return;
      }
      const start = el.selectionStart ?? body.length;
      const end = el.selectionEnd ?? body.length;
      setBody((prev) => prev.slice(0, start) + token + prev.slice(end));
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + token.length, start + token.length);
      });
    },
    [body.length, setBody]
  );
  return { bodyRef, insertToken };
}
