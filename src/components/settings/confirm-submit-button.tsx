"use client";

import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";

export function ConfirmSubmitButton({
  confirmMessage,
  children,
  ...props
}: ComponentProps<typeof Button> & { confirmMessage: string }) {
  return (
    <Button
      {...props}
      onClick={(e) => {
        if (!window.confirm(confirmMessage)) e.preventDefault();
      }}
    >
      {children}
    </Button>
  );
}
