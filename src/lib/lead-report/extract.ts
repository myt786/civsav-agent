import type { LeadTouch } from "./types";

// Turns the raw API responses the daily sync already stores (raw_responses)
// into one LeadTouch per lead. The connectors only validate the few fields
// they count, but the stored payload is the platform's full reply — names,
// emails, phone numbers and form answers included — so every field is read
// defensively here: a missing or oddly named field is skipped, never an
// error.

export interface RawPayload {
  platform: string;
  payload: unknown;
  fetchedAt: Date;
}

type Obj = Record<string, unknown>;

function isObj(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

// First non-empty string among these keys (case-insensitive, also inside
// the nested form-answer objects).
function pick(record: Obj, keys: string[]): string | null {
  const lower = new Map<string, unknown>();
  for (const [k, v] of Object.entries(record)) lower.set(k.toLowerCase(), v);
  for (const key of keys) {
    const value = str(lower.get(key.toLowerCase()));
    if (value) return value;
  }
  return null;
}

const NESTED_KEYS = ["fields", "data", "form_data", "formdata", "answers", "payload", "values", "submission", "custom_fields", "customfields", "meta"];

function nestedObjects(record: Obj): Obj[] {
  const out: Obj[] = [];
  for (const [k, v] of Object.entries(record)) {
    if (!NESTED_KEYS.includes(k.toLowerCase())) continue;
    if (isObj(v)) out.push(v);
    // [{ name/label/key, value }, ...]
    if (Array.isArray(v)) {
      const flat: Obj = {};
      for (const item of v) {
        if (!isObj(item)) continue;
        const label = str(item.label) ?? str(item.name) ?? str(item.key) ?? str(item.id);
        const value = str(item.value) ?? str(item.answer) ?? (Array.isArray(item.value) ? item.value.map(str).filter(Boolean).join(", ") : null);
        if (label && value) flat[label] = value;
      }
      if (Object.keys(flat).length > 0) out.push(flat);
    }
  }
  return out;
}

function pickDeep(record: Obj, keys: string[]): string | null {
  const direct = pick(record, keys);
  if (direct) return direct;
  for (const nested of nestedObjects(record)) {
    const value = pick(nested, keys);
    if (value) return value;
  }
  return null;
}

const NAME_KEYS = ["name", "full_name", "fullname", "contact_name", "contactName", "your_name", "your-name"];
const FIRST_KEYS = ["first_name", "firstname", "firstName", "fname"];
const LAST_KEYS = ["last_name", "lastname", "lastName", "lname"];
const EMAIL_KEYS = ["email", "email_address", "emailAddress", "your_email", "your-email", "e-mail"];
const PHONE_KEYS = ["phone", "phone_number", "phoneNumber", "mobile", "telephone", "tel", "your_phone", "your-phone", "cell"];
const COMPANY_KEYS = ["company", "company_name", "companyName", "business", "business_name", "businessName", "organization", "farm", "farm_name"];
const SOURCE_KEYS = ["form_name", "formName", "form", "form_title", "page_title", "page_url", "pageUrl", "page", "url", "source", "referrer", "utm_source"];

// Contact fields and bookkeeping are shown elsewhere; everything else a
// person typed or picked goes into the details text the AI reads.
const NOT_DETAILS = new Set(
  [
    ...NAME_KEYS, ...FIRST_KEYS, ...LAST_KEYS, ...EMAIL_KEYS, ...PHONE_KEYS,
    "id", "uuid", "site_id", "siteId", "status", "is_spam", "isSpam", "spam_score", "created_at", "createdAt", "updated_at", "updatedAt",
    "deleted_at", "ip", "ip_address", "user_agent", "userAgent", "token", "hash", "locationId", "location_id", "contactId", "contact_id",
    "pipelineId", "pipelineStageId", "assignedTo", "followers", "lastStatusChangeAt", "lastStageChangeAt", "monetaryValue",
  ].map((k) => k.toLowerCase()),
);

function detailsText(record: Obj): string | null {
  const parts: string[] = [];
  const add = (key: string, value: unknown) => {
    if (NOT_DETAILS.has(key.toLowerCase()) || NESTED_KEYS.includes(key.toLowerCase())) return;
    const text = str(value) ?? (Array.isArray(value) ? value.map(str).filter(Boolean).join(", ") || null : null);
    if (!text || text.length > 1200) return;
    // Skip bare ids and timestamps.
    if (/^[0-9a-f-]{20,}$/i.test(text) || /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(text)) return;
    parts.push(`${key.replace(/[_-]+/g, " ")}: ${text}`);
  };
  for (const [k, v] of Object.entries(record)) add(k, v);
  for (const nested of nestedObjects(record)) for (const [k, v] of Object.entries(nested)) add(k, v);
  const text = parts.join("; ");
  return text ? text.slice(0, 1500) : null;
}

function nameOf(record: Obj): string | null {
  const full = pickDeep(record, NAME_KEYS);
  if (full) return full;
  const first = pickDeep(record, FIRST_KEYS);
  const last = pickDeep(record, LAST_KEYS);
  return [first, last].filter(Boolean).join(" ") || null;
}

function isoOf(value: unknown, fallback: Date): string {
  const text = str(value);
  if (text) {
    // "2026-08-19 14:22:00" (Laravel) parses as local time in some engines;
    // read it as UTC so the result doesn't depend on the server.
    const normalised = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(text) ? `${text.replace(" ", "T")}Z` : text;
    const ms = /^\d{12,}$/.test(text) ? Number(text) : Date.parse(normalised);
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  }
  return fallback.toISOString();
}

// Lead Dashboard: GET /api/sites/{site}/leads → { data: [lead, ...] }.
export function leadDashboardTouches(payload: unknown, fetchedAt: Date): LeadTouch[] {
  if (!isObj(payload) || !Array.isArray(payload.data)) return [];
  const out: LeadTouch[] = [];
  for (const record of payload.data) {
    if (!isObj(record)) continue;
    if (record.is_spam === true) continue;
    const id = str(record.id);
    if (!id) continue;
    out.push({
      channel: "website",
      externalId: `ld:${id}`,
      name: nameOf(record),
      email: pickDeep(record, EMAIL_KEYS),
      phone: pickDeep(record, PHONE_KEYS),
      company: pickDeep(record, COMPANY_KEYS),
      source: pickDeep(record, SOURCE_KEYS),
      details: detailsText(record),
      createdAt: isoOf(record.created_at, fetchedAt),
      tags: [],
      booked: false,
      value: null,
      partial: record.status === "abandoned",
    });
  }
  return out;
}

const BOOKED = /book|appointment|scheduled|meeting set|call set/i;

// GoHighLevel: /opportunities/search → { opportunities: [opp, ...] }, each
// with its contact embedded.
export function ghlTouches(payload: unknown, fetchedAt: Date): LeadTouch[] {
  if (!isObj(payload) || !Array.isArray(payload.opportunities)) return [];
  const out: LeadTouch[] = [];
  for (const opp of payload.opportunities) {
    if (!isObj(opp)) continue;
    const id = str(opp.id);
    if (!id) continue;
    const contact = isObj(opp.contact) ? opp.contact : {};
    const tags = [
      ...(Array.isArray(contact.tags) ? contact.tags : []),
      ...(Array.isArray(opp.tags) ? opp.tags : []),
    ]
      .map(str)
      .filter((t): t is string => t !== null);
    const status = str(opp.status);
    const value = typeof opp.monetaryValue === "number" && opp.monetaryValue > 0 ? opp.monetaryValue : null;
    const oppName = str(opp.name);
    const contactName = nameOf(contact);
    const details = [
      oppName && oppName !== contactName ? `opportunity: ${oppName}` : null,
      status ? `status: ${status}` : null,
      tags.length ? `tags: ${tags.join(", ")}` : null,
      detailsText(contact),
    ]
      .filter(Boolean)
      .join("; ");
    out.push({
      channel: "crm",
      externalId: `ghl:${id}`,
      name: contactName ?? oppName,
      email: pick(contact, EMAIL_KEYS),
      phone: pick(contact, PHONE_KEYS),
      company: pick(contact, COMPANY_KEYS),
      source: str(opp.source) ?? str(contact.source),
      details: details || null,
      createdAt: isoOf(opp.createdAt ?? opp.dateAdded, fetchedAt),
      tags,
      booked: status === "won" || tags.some((t) => BOOKED.test(t)),
      value,
      partial: false,
    });
  }
  return out;
}

// OpenPhone: { calls: [call, ...] } — one touch per caller, with their
// calls counted. Outgoing calls only tell us the client called them back.
export function phoneTouches(payload: unknown, fetchedAt: Date): LeadTouch[] {
  if (!isObj(payload) || !Array.isArray(payload.calls)) return [];
  const byCaller = new Map<string, LeadTouch & { calls: { total: number; missed: number; seconds: number } }>();
  for (const call of payload.calls) {
    if (!isObj(call)) continue;
    const direction = str(call.direction);
    if (direction && direction !== "incoming" && direction !== "inbound") continue;
    const caller =
      str(call.from) ??
      (Array.isArray(call.participants) ? call.participants.map(str).find((p) => p !== null) ?? null : null);
    if (!caller) continue;
    const at = isoOf(call.createdAt, fetchedAt);
    const missed = ["missed", "no-answer", "abandoned", "canceled", "busy"].includes(str(call.status) ?? "");
    const seconds = typeof call.duration === "number" ? call.duration : 0;
    const existing = byCaller.get(caller);
    if (existing) {
      existing.calls.total += 1;
      existing.calls.missed += missed ? 1 : 0;
      existing.calls.seconds += seconds;
      if (at < existing.createdAt) existing.createdAt = at;
      existing.externalId += `,${str(call.id) ?? at}`;
      continue;
    }
    byCaller.set(caller, {
      channel: "phone",
      externalId: `call:${str(call.id) ?? `${caller}@${at}`}`,
      name: null,
      email: null,
      phone: caller,
      company: null,
      source: "Phone call",
      details: null,
      createdAt: at,
      tags: [],
      booked: false,
      value: null,
      partial: false,
      calls: { total: 1, missed: missed ? 1 : 0, seconds },
    });
  }
  return [...byCaller.values()];
}

// Every stored payload, one touch per lead; the same lead stored by two
// sync runs (a re-run, a backfill) is kept once.
export function touchesFromPayloads(payloads: RawPayload[]): LeadTouch[] {
  const seen = new Set<string>();
  const out: LeadTouch[] = [];
  for (const { platform, payload, fetchedAt } of payloads) {
    if (isObj(payload) && "error" in payload) continue;
    const touches =
      platform === "lead_dashboard"
        ? leadDashboardTouches(payload, fetchedAt)
        : platform === "ghl"
          ? ghlTouches(payload, fetchedAt)
          : platform === "openphone"
            ? phoneTouches(payload, fetchedAt)
            : [];
    for (const touch of touches) {
      // Phone touches carry every call id; key on the first one per day.
      const key = touch.channel === "phone" ? touch.externalId.split(",")[0] : touch.externalId;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(touch);
    }
  }
  return out;
}
