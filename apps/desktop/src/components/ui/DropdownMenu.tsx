import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import type { ComponentPropsWithoutRef, PropsWithChildren } from "react";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export function DropdownMenuContent({
  className = "",
  sideOffset = 6,
  ...props
}: ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        {...props}
        sideOffset={sideOffset}
        className={`z-50 min-w-44 overflow-hidden rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-1 shadow-xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out ${className}`.trim()}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className = "",
  children,
  ...props
}: PropsWithChildren<ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>>) {
  return (
    <DropdownMenuPrimitive.Item
      {...props}
      className={`flex w-full cursor-default select-none items-center rounded-md px-2.5 py-2 text-left text-xs text-[rgb(var(--app-text-muted))] outline-none transition-colors data-[highlighted]:bg-[rgb(var(--app-control-hover))] data-[highlighted]:text-[rgb(var(--app-text))] data-[disabled]:pointer-events-none data-[disabled]:opacity-50 ${className}`.trim()}
    >
      {children}
    </DropdownMenuPrimitive.Item>
  );
}
