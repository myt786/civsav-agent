"use client";

import Link from "next/link";
import {
  createColumnHelper,
  flexRender,
  useTable,
} from "@tanstack/react-table";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowUpDownIcon,
  ChevronRightIcon,
} from "lucide-react";
import { dashboardTableFeatures } from "./table-config";
import { DataCell, DeltaCellView } from "./data-cell";
import { HealthLabel } from "@/components/workspace-ui";
import {
  formatCurrency,
  formatInteger,
  formatRelativeTime,
} from "@/lib/dashboard/format";
import {
  ISSUE_GUIDES,
  param,
  queryHref,
  type PortfolioSort,
  type SearchParams,
  type selectPortfolio,
} from "@/lib/dashboard/portfolio";

type Entry = ReturnType<typeof selectPortfolio>["items"][number];
const helper = createColumnHelper<typeof dashboardTableFeatures, Entry>();
export function PortfolioTable({
  entries,
  params,
  now,
}: {
  entries: Entry[];
  params: SearchParams;
  now: Date;
}) {
  const back = queryHref("/", params);
  const clientHref = (id: string) =>
    `/clients/${id}?from=${encodeURIComponent(back)}`;
  function sortHeader(label: string, key: PortfolioSort) {
    const active = param(params, "sort", "priority") === key;
    const ascending =
      param(
        params,
        "dir",
        key === "priority" || key === "client" ? "asc" : "desc",
      ) === "asc";
    const Icon = active
      ? ascending
        ? ArrowUpIcon
        : ArrowDownIcon
      : ArrowUpDownIcon;
    return (
      <Link
        scroll={false}
        href={queryHref("/", params, {
          sort: key,
          dir: active && ascending ? "desc" : "asc",
          page: 1,
        })}
        className="inline-flex items-center gap-1.5 hover:text-foreground"
      >
        {label}
        <Icon className="size-3 opacity-60" aria-hidden />
        <span className="sr-only">
          {active
            ? `, sorted ${ascending ? "ascending" : "descending"}`
            : ", sort"}
        </span>
      </Link>
    );
  }
  const columns = helper.columns([
    helper.accessor((e) => e.row.clientName, {
      id: "client",
      header: () => sortHeader("Client", "client"),
      cell: (info) => {
        const e = info.row.original;
        return (
          <Link
            href={clientHref(e.row.clientId)}
            prefetch={false}
            className="group flex min-w-36 items-center gap-3"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50 text-[11px] font-semibold text-muted-foreground">
              {e.row.clientName
                .split(/\s+/)
                .slice(0, 2)
                .map((w) => w[0])
                .join("")}
            </span>
            <span className="font-medium group-hover:text-primary">
              {e.row.clientName}
            </span>
          </Link>
        );
      },
    }),
    helper.accessor("health", {
      header: () => sortHeader("Client health", "priority"),
      cell: (info) => {
        const e = info.row.original;
        return (
          <div className="flex min-w-48 max-w-64 flex-col gap-1.5">
            <HealthLabel health={e.health} />
            <Link
              href={`${clientHref(e.row.clientId)}#issues`}
              prefetch={false}
              className="text-[11px] leading-relaxed text-muted-foreground hover:text-foreground"
            >
              {e.flags[0]
                ? `${ISSUE_GUIDES[e.flags[0].kind].title}${e.flags.length > 1 ? ` +${e.flags.length - 1}` : ""}`
                : e.coverage.available < e.coverage.total
                  ? `${e.coverage.available} of ${e.coverage.total} metrics available`
                  : "Across available metrics"}
            </Link>
          </div>
        );
      },
    }),
    helper.accessor((e) => e.row.leads, {
      id: "leads",
      header: () => sortHeader("Leads", "leads"),
      cell: (info) => (
        <div className="flex flex-col gap-1">
          <DataCell state={info.getValue()} format={formatInteger} />
          <span className="text-[10px]">
            <DeltaCellView delta={info.row.original.row.leadsDelta} />
          </span>
        </div>
      ),
    }),
    helper.accessor((e) => e.row.spend, {
      id: "spend",
      header: () => sortHeader("Spend", "spend"),
      cell: (info) => (
        <DataCell state={info.getValue()} format={formatCurrency} />
      ),
    }),
    helper.accessor((e) => e.row.cpl, {
      id: "cpl",
      header: () => sortHeader("Cost / lead", "cpl"),
      cell: (info) => (
        <DataCell state={info.getValue()} format={formatCurrency} />
      ),
    }),
    helper.accessor((e) => e.row.lastSyncedAt, {
      id: "freshness",
      header: () => sortHeader("Last success", "freshness"),
      cell: (info) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {info.getValue()
            ? formatRelativeTime(info.getValue()!, now)
            : "Not synced yet"}
        </span>
      ),
    }),
  ]);
  const table = useTable({
    features: dashboardTableFeatures,
    data: entries,
    columns,
  });
  return (
    <>
      <div className="divide-y divide-border border-t border-border lg:hidden">
        {entries.map((entry) => (
          <article key={entry.row.clientId} className="px-5 py-5">
            <div className="mb-2 flex items-start justify-between gap-3">
              <Link
                href={clientHref(entry.row.clientId)}
                prefetch={false}
                className="text-sm font-semibold hover:text-primary"
              >
                {entry.row.clientName}
              </Link>
              <ChevronRightIcon
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
            </div>
            <HealthLabel health={entry.health} />
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {entry.flags[0]
                ? ISSUE_GUIDES[entry.flags[0].kind].title
                : `${entry.coverage.available}/${entry.coverage.total} metrics available`}
            </p>
            <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="mb-1 text-[10px] text-muted-foreground">
                  Leads
                </dt>
                <dd>
                  <DataCell
                    state={entry.row.leads}
                    format={formatInteger}
                    align="start"
                  />
                  <span className="mt-1 block text-[10px]">
                    <DeltaCellView delta={entry.row.leadsDelta} />
                  </span>
                </dd>
              </div>
              <div>
                <dt className="mb-1 text-[10px] text-muted-foreground">
                  Spend
                </dt>
                <dd>
                  <DataCell
                    state={entry.row.spend}
                    format={formatCurrency}
                    align="start"
                  />
                </dd>
              </div>
              <div>
                <dt className="mb-1 text-[10px] text-muted-foreground">
                  Cost / lead
                </dt>
                <dd>
                  <DataCell
                    state={entry.row.cpl}
                    format={formatCurrency}
                    align="start"
                  />
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-[10px] text-muted-foreground">
              Last success:{" "}
              {entry.row.lastSyncedAt
                ? formatRelativeTime(entry.row.lastSyncedAt, now)
                : "Not synced yet"}
            </p>
          </article>
        ))}
      </div>
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full border-collapse text-[13px]">
          <caption className="sr-only">
            Client health and performance over the last seven full days. Lead
            change compares the previous seven days.
          </caption>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr
                key={group.id}
                className="border-y border-border bg-[#f8f9f5]"
              >
                {group.headers.map((header, i) => (
                  <th
                    key={header.id}
                    scope="col"
                    className={`px-5 py-3 text-[11px] font-medium text-muted-foreground ${i > 1 && i < 5 ? "text-right" : "text-left"}`}
                  >
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )}
                  </th>
                ))}
                <th scope="col">
                  <span className="sr-only">Open client</span>
                </th>
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.original.row.clientId}
                className="border-b border-border/75 last:border-b-0 hover:bg-[#fafbf7]"
              >
                {row.getAllCells().map((cell) => (
                  <td key={cell.id} className="px-5 py-5 align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
                <td className="pr-5">
                  <Link
                    href={clientHref(row.original.row.clientId)}
                    prefetch={false}
                    aria-label={`Open ${row.original.row.clientName}`}
                    className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                  >
                    <ChevronRightIcon className="size-4" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
