import { lazy, Suspense } from "react";
import { MarkdownContentFallback } from "./MarkdownContentFallback.js";
import type { MarkdownContentProps } from "./MarkdownContent.types.js";

const StreamdownMarkdownContent = lazy(() =>
  import("./MarkdownContent.js").then((module) => ({
    default: module.MarkdownContent,
  })),
);

export function MarkdownContentRuntime(props: MarkdownContentProps) {
  return (
    <Suspense fallback={<MarkdownContentFallback {...props} />}>
      <StreamdownMarkdownContent {...props} />
    </Suspense>
  );
}
