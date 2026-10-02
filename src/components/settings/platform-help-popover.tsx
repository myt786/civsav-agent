"use client";

import { ExternalLinkIcon, HelpCircleIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { PlatformHelp } from "@/lib/connectors/platform-labels";

export function PlatformHelpPopover({
  help,
  accessLink,
}: {
  help: PlatformHelp;
  accessLink?: { label: string; href: string };
}) {
  return (
    <Popover>
      <PopoverTrigger
        className="flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label="What this connects"
      >
        <HelpCircleIcon className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="start" className="flex flex-col gap-2.5 text-sm">
        <p className="text-foreground">{help.what}</p>
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">If the wrong account is picked: </span>
          {help.ifWrong}
        </p>
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">If you can&apos;t find it in the list: </span>
          {help.ifEmpty}
        </p>
        {accessLink && (
          <a
            href={accessLink.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
          >
            {accessLink.label}
            <ExternalLinkIcon className="size-3.5" aria-hidden />
          </a>
        )}
      </PopoverContent>
    </Popover>
  );
}
