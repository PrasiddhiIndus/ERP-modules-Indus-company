/**
 * html2canvas clones the live document before capturing. PDF / image exports
 * must always be rendered with the light palette (white paper, dark ink), even
 * when the user is working in dark mode — so strip the dark-theme markers from
 * the cloned document. The on-screen page is not affected.
 */
export function forceLightThemeOnClone(clonedDocument) {
  const root = clonedDocument?.documentElement;
  if (!root) return;
  root.removeAttribute("data-theme");
  root.classList.remove("theme-dark");
}
