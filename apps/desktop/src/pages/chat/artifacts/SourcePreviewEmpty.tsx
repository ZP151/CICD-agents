export function SourcePreviewEmpty({ label, detail }: { label: string; detail?: string }) {
  return (
    <div className={sourcePreviewEmptyClass()}>
      <p className="font-medium text-[rgb(var(--app-text-muted))]">{label}</p>
      {detail && <p className="mt-1 max-w-[34ch] break-words text-[11px]">{detail}</p>}
    </div>
  );
}

export function sourcePreviewEmptyClass(): string {
  return "flex h-full min-h-48 min-w-0 flex-col items-center justify-center px-4 text-center text-xs text-[rgb(var(--app-text-subtle))]";
}
