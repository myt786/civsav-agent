"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmSubmitButton } from "@/components/settings/confirm-submit-button";
import { cn } from "@/lib/utils";

interface ClientListItem {
  id: string;
  name: string;
  timezone: string;
  active: boolean;
}

export function ClientsList({
  clients,
  deactivateClient,
}: {
  clients: ClientListItem[];
  deactivateClient: (clientId: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => c.name.toLowerCase().includes(q));
  }, [clients, query]);

  return (
    <div className="flex flex-col gap-3">
      {clients.length > 0 && (
        <div className="relative max-w-xs">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter clients…"
            className="pl-8"
            aria-label="Filter clients"
          />
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Name</TableHead>
              <TableHead>Timezone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-1" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((client) => (
              <TableRow key={client.id}>
                <TableCell>
                  <Link
                    href={`/settings/clients/${client.id}`}
                    className="flex items-center gap-2 font-medium text-foreground hover:underline"
                  >
                    <span
                      className={cn("size-1.5 shrink-0 rounded-full", client.active ? "bg-emerald-500" : "bg-muted-foreground/40")}
                      aria-hidden
                    />
                    {client.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{client.timezone}</TableCell>
                <TableCell>
                  {client.active ? (
                    <Badge variant="outline" className="border-emerald-600/30 text-emerald-700 dark:text-emerald-500">
                      active
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground">
                      inactive
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {client.active && (
                    <form action={deactivateClient.bind(null, client.id)}>
                      <ConfirmSubmitButton
                        type="submit"
                        size="sm"
                        variant="ghost"
                        confirmMessage={`Deactivate ${client.name}? This excludes it from future syncs but keeps its history.`}
                      >
                        Deactivate
                      </ConfirmSubmitButton>
                    </form>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {clients.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  No clients yet.
                </TableCell>
              </TableRow>
            )}
            {clients.length > 0 && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  No clients match &ldquo;{query}&rdquo;.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
