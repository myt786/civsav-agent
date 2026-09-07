import { EmptyState } from "@/components/workspace-ui";
export default function NotFound() {
  return (
    <div className="workspace">
      <div className="panel">
        <EmptyState
          title="Client not available"
          description="This client may have been deactivated, or the link may be incorrect."
          href="/"
          action="Back to overview"
        />
      </div>
    </div>
  );
}
