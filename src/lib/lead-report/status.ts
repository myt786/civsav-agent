import type { LeadReportStatus } from "./types";

// Shared by the server-rendered list and the client review panel, so it
// lives outside both ("use client" modules can only hand components to
// server components).
export const STATUS_INFO: Record<LeadReportStatus, { label: string; className: string }> = {
  in_review: { label: "Waiting for review", className: "bg-warning/15 text-warning" },
  changes_requested: { label: "Changes requested", className: "bg-destructive/10 text-destructive" },
  approved: { label: "Approved — ready to send", className: "bg-success/15 text-success" },
  sent: { label: "Sent to client", className: "bg-primary/10 text-primary" },
};
