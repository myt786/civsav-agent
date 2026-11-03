"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2Icon,
  FileTextIcon,
  Loader2Icon,
  MessageSquareIcon,
  PencilIcon,
  SendIcon,
  SparklesIcon,
  UndoIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import {
  addLeadReportRemark,
  decideLeadReport,
  editLeadReportSummary,
  sendLeadReportToClient,
} from "@/app/settings/lead-report-actions";
import { TONE_INFO } from "@/lib/lead-report/tone";
import { STATUS_INFO } from "@/lib/lead-report/status";
import type { LeadReportEvent, LeadReportStatus, LeadTone } from "@/lib/lead-report/types";
import { cn } from "@/lib/utils";
import { ToneSelect, requestLeadReport } from "./lead-report-controls";

const TEXTAREA =
  "min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

const EVENT_LABEL: Record<LeadReportEvent["kind"], string> = {
  generated: "made the report",
  remark: "added a remark",
  approved: "approved it",
  changes_requested: "asked for changes",
  edited: "edited it",
  sent: "sent it",
};

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function LeadReportReview(props: {
  id: string;
  clientId: string;
  status: LeadReportStatus;
  tone: LeadTone;
  toneNote: string | null;
  headline: string;
  intro: string;
  events: LeadReportEvent[];
  clientEmails: string[];
  sentTo: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [remark, setRemark] = useState("");
  const [editing, setEditing] = useState(false);
  const [headline, setHeadline] = useState(props.headline);
  const [intro, setIntro] = useState(props.intro);
  const [tone, setTone] = useState<LeadTone>(props.tone);
  const [toneNote, setToneNote] = useState(props.toneNote ?? "");
  const [rewriting, setRewriting] = useState(false);
  const [recipients, setRecipients] = useState((props.sentTo.length ? props.sentTo : props.clientEmails).join(", "));
  const [message, setMessage] = useState("");
  const [confirmSend, setConfirmSend] = useState(false);
  const sent = props.status === "sent";
  const canSend = props.status === "approved" || sent;

  function run(action: () => Promise<{ error?: string }>, success: string, after?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        toast({ variant: "error", title: "Not done", description: result.error });
        return;
      }
      toast({ variant: "success", title: success });
      after?.();
      router.refresh();
    });
  }

  async function rewrite() {
    setRewriting(true);
    const result = await requestLeadReport({ clientId: props.clientId, replaceId: props.id, tone, toneNote });
    setRewriting(false);
    if (result.error) {
      toast({ variant: "error", title: "Not rewritten", description: result.error });
      return;
    }
    toast({ variant: "success", title: `Rewritten in a ${TONE_INFO[tone].label.toLowerCase()} tone` });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Status and the main decision */}
      <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_INFO[props.status].className)}>
            {STATUS_INFO[props.status].label}
          </span>
          <a
            href={`/api/lead-reports/${props.id}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary underline-offset-2 hover:underline"
          >
            <FileTextIcon className="size-4" /> Preview PDF
          </a>
        </div>
        {!sent && (
          <>
            <textarea
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="Remarks for the team — what to check or change (optional when approving)"
              className={TEXTAREA}
              maxLength={2000}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={pending || props.status === "approved"}
                onClick={() => run(() => decideLeadReport(props.id, "approve", remark), "Approved", () => setRemark(""))}
              >
                <CheckCircle2Icon /> Approve
              </Button>
              <Button
                variant="outline"
                disabled={pending || !remark.trim()}
                onClick={() => run(() => addLeadReportRemark(props.id, remark), "Remark added", () => setRemark(""))}
              >
                <MessageSquareIcon /> Add remark
              </Button>
              <Button
                variant="destructive"
                disabled={pending}
                onClick={() => run(() => decideLeadReport(props.id, "changes", remark), "Changes requested", () => setRemark(""))}
              >
                <UndoIcon /> Request changes
              </Button>
            </div>
          </>
        )}
      </section>

      {/* Send to client */}
      <section className={cn("flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm", canSend ? "border-success/40" : "border-border")}>
        <div className="flex items-center gap-2">
          <SendIcon className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium text-foreground">{sent ? "Sent to client" : "Send to client as PDF"}</h3>
        </div>
        {!canSend ? (
          <p className="text-xs text-muted-foreground">Unlocks once a reviewer approves the report.</p>
        ) : (
          <>
            {sent && <p className="text-xs text-muted-foreground">Sent to {props.sentTo.join(", ")}. You can send it again below.</p>}
            <Input value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="client@example.com, sales@example.com" aria-label="Client emails" />
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Optional note at the top of the email"
              className={TEXTAREA}
              maxLength={2000}
            />
            {confirmSend ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-foreground">Send the PDF to {recipients.split(/[\s,;]+/).filter(Boolean).length} address(es)?</span>
                <Button
                  disabled={pending}
                  onClick={() =>
                    run(() => sendLeadReportToClient(props.id, recipients, message), "Sent to the client", () => {
                      setConfirmSend(false);
                      setMessage("");
                    })
                  }
                >
                  {pending ? <Loader2Icon className="animate-spin" /> : <SendIcon />} Yes, send
                </Button>
                <Button variant="ghost" onClick={() => setConfirmSend(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button className="self-start" disabled={!recipients.trim()} onClick={() => setConfirmSend(true)}>
                <SendIcon /> {sent ? "Send again" : "Send to client"}
              </Button>
            )}
          </>
        )}
      </section>

      {/* Tone */}
      {!sent && (
        <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-sm font-medium text-foreground">Tone</h3>
            <p className="text-xs text-muted-foreground">
              Rewrites the summary and every opener; scores and tiers don&apos;t change. The report goes back to review.
            </p>
          </div>
          <ToneSelect value={tone} onChange={setTone} />
          <Input
            value={toneNote}
            onChange={(e) => setToneNote(e.target.value)}
            placeholder="Words to use or avoid, e.g. “opportunity” not “problem”"
            maxLength={400}
          />
          <Button variant="outline" className="self-start" disabled={rewriting} onClick={rewrite}>
            {rewriting ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
            {rewriting ? "Rewriting…" : "Rewrite in this tone"}
          </Button>
        </section>
      )}

      {/* Edit summary */}
      {!sent && (
        <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">Summary wording</h3>
            {!editing && (
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                <PencilIcon /> Edit
              </Button>
            )}
          </div>
          {editing ? (
            <>
              <Input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={200} aria-label="Headline" />
              <textarea value={intro} onChange={(e) => setIntro(e.target.value)} className={cn(TEXTAREA, "min-h-28")} maxLength={2000} />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => run(() => editLeadReportSummary(props.id, headline, intro), "Summary saved", () => setEditing(false))}
                >
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Change the headline or summary paragraph before it goes out.</p>
          )}
        </section>
      )}

      {/* History */}
      <section className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 shadow-sm">
        <h3 className="text-sm font-medium text-foreground">Remarks and history</h3>
        <ol className="flex flex-col gap-2">
          {[...props.events].reverse().map((event) => (
            <li key={event.id} className="flex flex-col gap-0.5 border-t border-border pt-2 first:border-0 first:pt-0">
              <span className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{event.by}</span> {EVENT_LABEL[event.kind]} · {when(event.at)}
              </span>
              {event.text && <span className="whitespace-pre-line text-sm text-foreground">{event.text}</span>}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
