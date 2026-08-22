"use client";

import { HelpCircleIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { PlatformHelp } from "@/lib/connectors/platform-labels";

export function PlatformHelpPopover({ help }: { help: PlatformHelp }) {
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
          <span className="font-medium text-foreground">If it&apos;s wrong: </span>
          {help.ifWrong}
        </p>
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">If the dropdown is empty: </span>
          {help.ifEmpty}
        </p>
      </PopoverContent>
    </Popover>
  );
}
