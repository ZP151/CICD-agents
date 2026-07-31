import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { PropsWithChildren, ReactNode } from "react";

export function TooltipProvider({ children }: PropsWithChildren) {
  return <TooltipPrimitive.Provider delayDuration={350}>{children}</TooltipPrimitive.Provider>;
}

export function Tooltip({
  content,
  children,
  contentClassName = "",
}: PropsWithChildren<{ content: ReactNode; contentClassName?: string }>) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side="right"
          sideOffset={8}
          className={`z-50 rounded-md bg-[rgb(var(--app-overlay))] px-2 py-1 text-[11px] font-medium text-white shadow-lg outline-none ${contentClassName}`.trim()}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-[rgb(var(--app-overlay))]" width={8} height={5} />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
