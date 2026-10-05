import React, { useDeferredValue, useMemo } from 'react';
import { buildEmailPreviewDocument } from '../../../../shared/emailHtml.mjs';

/**
 * Renders an email body exactly as the mail server sends it.
 * Sandboxed iframe (no scripts, no same-origin access) + sanitized HTML + restrictive CSP.
 */
export default function EmailPreviewFrame({ body, device = 'desktop', className = '', title = 'Email preview' }) {
  const deferredBody = useDeferredValue(body);
  const srcDoc = useMemo(() => buildEmailPreviewDocument(deferredBody), [deferredBody]);

  return (
    <div className={`h-full w-full overflow-auto bg-slate-100 ${className}`.trim()}>
      <div
        className={`mx-auto h-full bg-white transition-[width] duration-200 ${
          device === 'mobile' ? 'w-[375px] border-x border-slate-200 shadow-sm' : 'w-full'
        }`}
      >
        <iframe
          title={title}
          sandbox=""
          referrerPolicy="no-referrer"
          srcDoc={srcDoc}
          className="block w-full h-full min-h-[320px] border-0 bg-white"
        />
      </div>
    </div>
  );
}
