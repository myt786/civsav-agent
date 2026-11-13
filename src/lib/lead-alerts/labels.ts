import type { LeadAlertKind } from "./detect";

// Shared by the Insights panel (client) and server pages.
export const LEAD_ALERT_TITLE: Record<LeadAlertKind, string> = {
  stopped: "Leads stopped",
  drop: "Leads well below normal",
  source_stopped: "Lead source stopped",
  data_missing: "Lead data missing",
};

export const LEAD_ALERT_CHECKS: Record<LeadAlertKind, string> = {
  stopped: "Check the website form and phone line work, ads are running and budgets haven't run out, and tracking is still in place.",
  drop: "Check for paused campaigns, budget caps, a site change or a form failing for some visitors.",
  source_stopped: "Usually a broken form, a disconnected integration or removed tracking — other sources show people are still finding the client.",
  data_missing: "The account isn't syncing, so we can't tell whether leads are coming in. Check its key or access in Settings → Clients.",
};
