import Link from "next/link";
import { ArrowLeftIcon, ArrowRightIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  HEALTH_LABELS,
  param,
  queryHref,
  type Health,
  type SearchParams,
} from "@/lib/dashboard/portfolio";

export function HealthLabel({ health }: { health: Health }) {
  return (
    <span className={`health-label health-${health}`}>
      {HEALTH_LABELS[health]}
    </span>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-5">
      <div>
        <p className="eyebrow mb-3">{eyebrow}</p>
        <h1 className="page-title">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {children}
    </header>
  );
}
export function FilterForm({
  path,
  params,
  children,
  placeholder = "Search clients…",
}: {
  path: string;
  params: SearchParams;
  children?: React.ReactNode;
  placeholder?: string;
}) {
  return (
    <form
      action={path}
      className="flex flex-wrap items-center gap-2.5"
      role="search"
    >
      {Object.entries(params)
        .filter(
          ([key, value]) =>
            typeof value === "string" &&
            ![
              "q",
              "page",
              "severity",
              "kind",
              "status",
              "metric",
              "sort",
              "dir",
            ].includes(key),
        )
        .map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value as string} />
        ))}
      <div className="relative min-w-44 flex-1 sm:max-w-xs">
        <SearchIcon
          className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground"
          aria-hidden
        />
        <input
          key={param(params, "q")}
          aria-label="Search clients"
          className="field-control w-full pl-9"
          type="search"
          name="q"
          defaultValue={param(params, "q")}
          placeholder={placeholder}
        />
      </div>
      {children}
      <Button type="submit" variant="outline" className="h-10 bg-card">
        Apply
      </Button>
      {Object.keys(params).some(
        (key) => !["tab", "page"].includes(key) && param(params, key),
      ) && (
        <Link
          href={queryHref(path, {}, { tab: param(params, "tab") })}
          className="px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          Reset
        </Link>
      )}
    </form>
  );
}
export function Pagination({
  path,
  params,
  page,
  pages,
  total,
  pageSize = 25,
  noun = "clients",
}: {
  path: string;
  params: SearchParams;
  page: number;
  pages: number;
  total: number;
  pageSize?: number;
  noun?: string;
}) {
  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4 text-xs text-muted-foreground"
    >
      <span>
        {total
          ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`
          : "0"}{" "}
        {noun}
      </span>
      <div className="flex items-center gap-3">
        <Button asChild variant="outline" size="icon-sm" disabled={page === 1}>
          {page === 1 ? (
            <span aria-disabled="true" aria-label="Previous page">
              <ArrowLeftIcon className="size-3.5" />
            </span>
          ) : (
            <Link
              aria-label="Previous page"
              href={queryHref(path, params, { page: page - 1 })}
              scroll={false}
            >
              <ArrowLeftIcon className="size-3.5" />
            </Link>
          )}
        </Button>
        <span>
          Page {page} of {pages}
        </span>
        <Button
          asChild
          variant="outline"
          size="icon-sm"
          disabled={page === pages}
        >
          {page === pages ? (
            <span aria-disabled="true" aria-label="Next page">
              <ArrowRightIcon className="size-3.5" />
            </span>
          ) : (
            <Link
              aria-label="Next page"
              href={queryHref(path, params, { page: page + 1 })}
              scroll={false}
            >
              <ArrowRightIcon className="size-3.5" />
            </Link>
          )}
        </Button>
      </div>
    </nav>
  );
}
export function EmptyState({
  title,
  description,
  href,
  action,
}: {
  title: string;
  description: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="px-6 py-16 text-center">
      <div className="mx-auto mb-5 h-1 w-8 rounded-full bg-border" />
      <h2 className="section-title">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      {href && (
        <Button asChild variant="outline" className="mt-5">
          <Link href={href}>{action}</Link>
        </Button>
      )}
    </div>
  );
}
