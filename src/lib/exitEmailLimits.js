/**
 * Production nginx often keeps the default 1mb request body limit.
 * One PDF per email request must stay under that after base64 (~4/3) + JSON wrapper.
 */
export const EXIT_EMAIL_NGINX_SAFE_PDF_BYTES = 520 * 1024;
