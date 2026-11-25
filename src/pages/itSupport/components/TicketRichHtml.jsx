import React, { useCallback, useMemo, useState } from "react";
import { Modal } from "../../../components/erpUi";

/** Strip fixed width/height so CSS can keep screenshots inside the card. */
function normalizeDescriptionHtml(raw) {
  if (!raw || typeof raw !== "string") return "";
  return raw.replace(/<img\b[^>]*>/gi, (tag) =>
    tag
      .replace(/\s(width|height)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/\sstyle\s*=\s*("[^"]*"|'[^']*')/gi, (m, quoted) => {
        const inner = String(quoted).slice(1, -1);
        const cleaned = inner
          .split(";")
          .map((p) => p.trim())
          .filter((p) => p && !/^(width|height|max-width|min-width)\s*:/i.test(p))
          .join("; ");
        return cleaned ? ` style="${cleaned}"` : "";
      })
  );
}

/**
 * Renders ticket description / rich HTML with constrained images.
 * Wide or tall screenshots stay inside the card; click opens a lightbox.
 */
export default function TicketRichHtml({ html, empty = "<p>—</p>", className = "" }) {
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const safeHtml = useMemo(() => normalizeDescriptionHtml(html) || empty, [html, empty]);

  const onClick = useCallback((e) => {
    const img = e.target?.closest?.("img");
    if (!img?.src) return;
    e.preventDefault();
    e.stopPropagation();
    setLightboxSrc(img.src);
  }, []);

  return (
    <>
      <div
        role="presentation"
        onClick={onClick}
        className={[
          "ticket-rich-html min-w-0 max-w-full overflow-hidden",
          "prose prose-sm max-w-none text-ink-strong dark:prose-invert",
          "[&_img]:my-2 [&_img]:mx-auto [&_img]:block",
          "[&_img]:!max-w-full [&_img]:!h-auto [&_img]:!max-h-56 sm:[&_img]:!max-h-72",
          "[&_img]:!w-auto [&_img]:object-contain [&_img]:rounded-md [&_img]:border [&_img]:border-border",
          "[&_img]:bg-surface-sunken [&_img]:cursor-zoom-in [&_img]:shadow-sm",
          "[&_table]:block [&_table]:w-full [&_table]:max-w-full [&_table]:overflow-x-auto",
          "[&_pre]:max-w-full [&_pre]:overflow-x-auto",
          "[&_p]:break-words [&_li]:break-words",
          className,
        ].join(" ")}
        dangerouslySetInnerHTML={{ __html: safeHtml }}
      />

      <Modal
        open={Boolean(lightboxSrc)}
        title="Image"
        onClose={() => setLightboxSrc(null)}
        widthClass="max-w-5xl"
      >
        {lightboxSrc ? (
          <div className="flex min-h-0 items-center justify-center bg-surface-sunken/40 p-1 sm:p-2">
            <img
              src={lightboxSrc}
              alt="Full size"
              className="max-h-[min(80vh,720px)] w-auto max-w-full object-contain rounded-md"
            />
          </div>
        ) : null}
      </Modal>
    </>
  );
}
