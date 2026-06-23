import { useEffect, useState } from "react";

export function initialsFromText(value: string | undefined, fallback = "?"): string {
  const source = value?.trim() || fallback;
  const parts = source.split(/[^A-Za-z0-9]+/).filter(Boolean);
  return (parts.length > 1 ? parts.map((part) => part[0]).join("") : source.slice(0, 2))
    .slice(0, 2)
    .toUpperCase();
}

export function InitialsAvatar({ label, className }: { label?: string; className: string }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-blue-600/80 font-semibold text-white ${className}`}
    >
      {initialsFromText(label)}
    </span>
  );
}

export function SafeAvatar({
  src,
  label,
  imageClassName,
  fallbackClassName,
}: {
  src?: string;
  label?: string;
  imageClassName: string;
  fallbackClassName: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (src && !failed) {
    return <img src={src} alt="" className={imageClassName} onError={() => setFailed(true)} />;
  }
  return <InitialsAvatar label={label} className={fallbackClassName} />;
}
