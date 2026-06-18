export function ChatThinkingDots() {
  return (
    <span className="ml-1 inline-flex items-center gap-0.5">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400"
          style={{ animationDelay: `${index * 0.15}s` }}
        />
      ))}
    </span>
  );
}
