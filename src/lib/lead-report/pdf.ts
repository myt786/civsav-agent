import { format, parseISO } from "date-fns";
import { PdfDocument, hex, wrapText, type Font, type Rgb } from "../pdf/writer";
import { TIER_1_MIN, TIER_2_MIN } from "./score";
import type { LeadChannel, LeadReport, ScoredLead } from "./types";

// The client-facing PDF: a cover with the tier counts and where leads came
// from, a "how to use this list" page, then one ranked table per tier and
// the already-booked list. Landscape Letter.

const W = 792;
const H = 612;
const M = 36;
const INK = hex("#111827");
const MUTED = hex("#6b7280");
const FAINT = hex("#e5e7eb");
const ZEBRA = hex("#f9fafb");
const BRAND = hex("#0f766e");

const TIERS: { key: 1 | 2 | 3 | "booked"; label: string; short: string; color: Rgb }[] = [
  { key: 1, label: "Tier 1", short: "Call today", color: hex("#0f766e") },
  { key: 2, label: "Tier 2", short: "Call this week", color: hex("#2563eb") },
  { key: 3, label: "Tier 3", short: "Nurture", color: hex("#64748b") },
  { key: "booked", label: "Already booked", short: "Confirm, don't re-prospect", color: hex("#7c3aed") },
];

const CHANNEL_SHORT: Record<LeadChannel, string> = { website: "Website", crm: "CRM", phone: "Phone" };

function shortDate(iso: string): string {
  return format(parseISO(iso), "MMM d");
}

function prettyDate(day: string): string {
  return format(parseISO(day), "MMM d, yyyy");
}

interface Column {
  title: string;
  width: number;
  lines: (lead: ScoredLead) => { text: string; font?: Font; color?: Rgb; size?: number }[];
}

const COLUMNS_OPEN: Column[] = [
  { title: "#", width: 28, lines: (l) => [{ text: String(l.rank), font: "bold" }, { text: String(l.score), color: MUTED, size: 7 }] },
  {
    title: "LEAD",
    width: 128,
    lines: (l) => [
      { text: l.name ?? "Unknown caller", font: "bold" },
      { text: `${l.channels.map((c) => CHANNEL_SHORT[c]).join(" + ")} · ${shortDate(l.firstAt)}`, color: MUTED, size: 7.5 },
    ],
  },
  {
    title: "CONTACT",
    width: 150,
    lines: (l) => [
      ...(l.phone ? [{ text: l.phone }] : []),
      ...(l.email ? [{ text: l.email, color: MUTED, size: 7.5 }] : []),
    ],
  },
  { title: "BUSINESS", width: 86, lines: (l) => (l.company ? [{ text: l.company }] : []) },
  { title: "CONTEXT", width: 160, lines: (l) => [{ text: l.assessment.context }] },
  { title: "WHAT TO SAY", width: 168, lines: (l) => [{ text: l.assessment.opener }] },
];

const COLUMNS_BOOKED: Column[] = [
  COLUMNS_OPEN[0],
  COLUMNS_OPEN[1],
  COLUMNS_OPEN[2],
  { ...COLUMNS_OPEN[3], width: 120 },
  { ...COLUMNS_OPEN[4], width: 294 },
];

const BODY = 8;
const LEAD = 10;

function cellLines(col: Column, lead: ScoredLead) {
  const out: { text: string; font: Font; color: Rgb; size: number }[] = [];
  for (const part of col.lines(lead)) {
    const size = part.size ?? BODY;
    const font = part.font ?? "regular";
    for (const line of wrapText(part.text, font, size, col.width - 8)) out.push({ text: line, font, color: part.color ?? INK, size });
  }
  return out.slice(0, 6);
}

export function renderLeadReportPdf(report: LeadReport, preparedOn: Date): Buffer {
  const doc = new PdfDocument(W, H);
  const footer = `${report.clientName} · Sales Call Priority List · ${report.period.label}`;

  // Cover
  const cover = doc.addPage();
  doc.rect(cover, 0, 0, W, 6, BRAND);
  doc.text(cover, M, 44, `${report.clientName.toUpperCase()} · SALES TEAM PLAYBOOK`, { size: 9, font: "bold", color: BRAND });
  doc.text(cover, M, 92, "Sales Call Priority List", { size: 34, font: "bold", color: INK });
  let y = doc.paragraph(
    cover,
    M,
    118,
    W - 2 * M,
    `Every lead from ${report.period.label} — scored, de-duplicated and ranked by who to call first. Work it top to bottom.`,
    { size: 12, color: MUTED },
  );

  // Tier boxes
  y += 16;
  const boxW = (W - 2 * M - 3 * 12) / 4;
  const counts = { 1: report.counts.tier1, 2: report.counts.tier2, 3: report.counts.tier3, booked: report.counts.booked };
  TIERS.forEach((tier, i) => {
    const x = M + i * (boxW + 12);
    doc.rect(cover, x, y, boxW, 72, ZEBRA);
    doc.rect(cover, x, y, 4, 72, tier.color);
    doc.text(cover, x + 16, y + 36, String(counts[tier.key]), { size: 28, font: "bold", color: tier.color });
    doc.text(cover, x + 16, y + 56, tier.key === "booked" ? "Already booked · confirm" : `${tier.label} · ${tier.short}`, { size: 9, color: INK });
  });
  y += 100;

  // Where leads came from
  doc.text(cover, M, y, `WHERE THE ${report.counts.open} OPEN LEADS CAME FROM`, { size: 8, font: "bold", color: MUTED });
  const barMax = Math.max(1, ...report.byChannel.map((c) => c.count));
  const half = (W - 2 * M - 30) / 2;
  report.byChannel.slice(0, 6).forEach((c, i) => {
    const rowY = y + 14 + i * 18;
    doc.text(cover, M, rowY + 9, c.label, { size: 9, color: INK });
    doc.rect(cover, M + 120, rowY + 1, Math.max(2, ((half - 160) * c.count) / barMax), 10, BRAND);
    doc.text(cover, M + half, rowY + 9, String(c.count), { size: 9, font: "bold", color: INK, align: "right" });
  });

  // Summary
  const sx = M + half + 30;
  doc.text(cover, sx, y, "SUMMARY", { size: 8, font: "bold", color: MUTED });
  let sy = doc.paragraph(cover, sx, y + 16, half, report.summary.headline, { size: 11, font: "bold", color: INK, maxLines: 2 });
  sy = doc.paragraph(cover, sx, sy + 4, half, report.summary.intro, { size: 9, color: INK, maxLines: 8 });

  doc.text(cover, M, H - 40, `Prepared ${format(preparedOn, "MMM d, yyyy")} · Civilized Savage for ${report.clientName}`, { size: 8, color: MUTED });

  // How to use this list
  const how = doc.addPage();
  doc.text(how, M, 52, "How to use this list", { size: 20, font: "bold", color: INK });
  y = 78;
  for (const tier of TIERS) {
    const note = report.summary.tierNotes[tier.key === "booked" ? "booked" : (`tier${tier.key}` as "tier1")];
    doc.rect(how, M, y - 8, 3, 26, tier.color);
    doc.text(how, M + 12, y + 1, `${tier.label} — ${tier.short}.`, { size: 10, font: "bold", color: INK });
    y = doc.paragraph(how, M + 12, y + 14, W - 2 * M - 12, note || "—", { size: 9, color: INK, maxLines: 3 }) + 10;
  }
  if (report.summary.takeaways.length > 0) {
    doc.text(how, M, y + 6, "Key takeaways", { size: 12, font: "bold", color: INK });
    y += 22;
    for (const point of report.summary.takeaways) {
      doc.text(how, M + 4, y, "•", { size: 9, color: BRAND });
      y = doc.paragraph(how, M + 14, y, W - 2 * M - 14, point, { size: 9, color: INK, maxLines: 3 }) + 4;
    }
  }
  doc.text(how, M, y + 14, "Scoring method", { size: 12, font: "bold", color: INK });
  y = doc.paragraph(
    how,
    M,
    y + 30,
    W - 2 * M,
    `Each lead is scored 0–100: timing (up to 40 — immediately 40, within 7 days 38, 2–4 weeks 30, 1–3 months 18, 3+ months 8, not stated 12), size (up to 25 — business buyer 25, large 22, medium 15, small 6, unknown 8), how specific the ask was (quote request 25, named product or quantity 18, general enquiry 6), persistence (+10 per extra form, +14 per extra call, capped) and recency (up to +15, one point less per 10 days). Leads found in two channels get +8. Tier 1 ${TIER_1_MIN}+, Tier 2 ${TIER_2_MIN}–${TIER_1_MIN - 1}, Tier 3 below ${TIER_2_MIN}; anyone already booked is listed separately at the end so nobody gets a cold call twice.`,
    { size: 8.5, color: INK },
  );
  doc.text(how, M, y + 14, "Sources", { size: 12, font: "bold", color: INK });
  y = doc.paragraph(
    how,
    M,
    y + 30,
    W - 2 * M,
    `${report.counts.total} people from website forms, the CRM and the phone line, ${prettyDate(report.period.start)} – ${prettyDate(report.period.end)}. Duplicates across channels were matched on phone, then email (${report.counts.duplicatesMerged} merged); ${report.counts.junk} spam or solicitation entries were left out.`,
    { size: 8.5, color: INK },
  );

  // Tier tables
  const TOP = 40;
  const BOTTOM = H - 44;
  let page = how;
  y = BOTTOM; // forces a new page
  for (const tier of TIERS) {
    const leads = report.leads.filter((l) => l.tier === tier.key);
    if (leads.length === 0) continue;
    const columns = tier.key === "booked" ? COLUMNS_BOOKED : COLUMNS_OPEN;
    const header = () => {
      let x = M;
      doc.rect(page, M, y, W - 2 * M, 16, ZEBRA);
      for (const col of columns) {
        doc.text(page, x + 4, y + 11, col.title, { size: 7, font: "bold", color: MUTED });
        x += col.width;
      }
      y += 20;
    };
    page = doc.addPage();
    y = TOP;
    doc.rect(page, M, y, 70, 18, tier.color);
    doc.text(page, M + 35, y + 12.5, tier.label.toUpperCase(), { size: 8, font: "bold", color: [255, 255, 255], align: "center" });
    doc.text(page, M + 80, y + 13, `${tier.short} · ${leads.length} lead${leads.length === 1 ? "" : "s"} · #${leads[0].rank}–${leads[leads.length - 1].rank}`, {
      size: 12,
      font: "bold",
      color: INK,
    });
    y += 30;
    const note = report.summary.tierNotes[tier.key === "booked" ? "booked" : (`tier${tier.key}` as "tier1")];
    if (note) y = doc.paragraph(page, M, y, W - 2 * M, note, { size: 8.5, color: MUTED, maxLines: 3 }) + 4;
    header();
    leads.forEach((lead, index) => {
      const cells = columns.map((col) => cellLines(col, lead));
      const rowH = Math.max(...cells.map((c) => c.length), 1) * LEAD + 8;
      if (y + rowH > BOTTOM) {
        page = doc.addPage();
        y = TOP;
        header();
      }
      if (index % 2 === 1) doc.rect(page, M, y - 2, W - 2 * M, rowH, ZEBRA);
      let x = M;
      columns.forEach((col, ci) => {
        cells[ci].forEach((line, li) => doc.text(page, x + 4, y + 8 + li * LEAD, line.text, { size: line.size, font: line.font, color: line.color }));
        x += col.width;
      });
      y += rowH;
      doc.line(page, M, y - 2, W - M, y - 2, FAINT);
    });
  }

  // Footers
  for (let p = 0; p < doc.pageCount; p++) {
    doc.line(p, M, H - 28, W - M, H - 28, FAINT);
    doc.text(p, M, H - 16, footer, { size: 7, color: MUTED });
    doc.text(p, W - M, H - 16, `Page ${p + 1} of ${doc.pageCount}`, { size: 7, color: MUTED, align: "right" });
  }

  return doc.toBuffer({ title: `${report.clientName} — Sales Call Priority List` });
}
