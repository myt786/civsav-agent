import { EmptyState } from "@/components/workspace-ui";
export default function NotFound() {
  return (
    <div className="panel">
      <EmptyState
        title="Client not found"
        description="This client does not exist or the link is incorrect."
        href="/settings/clients"
        action="Back to directory"
      />
    </div>
  );
}
