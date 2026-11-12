/** Session keys for Projects enquiry reminders (one show per module visit). */

export const PROJECTS_VISIT_KEY = 'projects-module-visit';
export const OVERDUE_SHOWN_VISIT_KEY = 'projects-enquiry-overdue-shown-for-visit';

export function beginProjectsVisit() {
  try {
    if (!sessionStorage.getItem(PROJECTS_VISIT_KEY)) {
      sessionStorage.setItem(PROJECTS_VISIT_KEY, String(Date.now()));
    }
  } catch {
    /* storage unavailable */
  }
}

export function endProjectsVisit() {
  try {
    sessionStorage.removeItem(PROJECTS_VISIT_KEY);
    sessionStorage.removeItem(OVERDUE_SHOWN_VISIT_KEY);
    sessionStorage.removeItem('projects-enquiry-overdue-dismissed');
  } catch {
    /* storage unavailable */
  }
}
