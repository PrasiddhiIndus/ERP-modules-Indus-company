/**
 * Company logo served from `/public/indus-logo.png`.
 * Use for <img src>, PDF helpers, and fetch(); respects Vite `base` for subpath deploys.
 */
export const INDUS_LOGO_SRC = (() => {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.endsWith('/') ? base : `${base}/`}indus-logo.png`;
})();
