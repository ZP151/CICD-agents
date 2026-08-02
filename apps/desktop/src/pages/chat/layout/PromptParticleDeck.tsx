import { motion, useReducedMotion } from "motion/react";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent,
} from "react";
import type { SuggestionReply } from "../../../components/conversation/SuggestionReplyBar.js";

interface PromptParticleDeckProps {
  suggestions: SuggestionReply[];
  disabled?: boolean;
  onPick: (suggestion: SuggestionReply) => void;
}

const PARTICLES = [
  ["7%", "29%", 3, 18, -9], ["15%", "76%", 3, 12, 11], ["26%", "17%", 2, -10, 13],
  ["38%", "86%", 3, 8, -12], ["63%", "12%", 3, 13, 9], ["78%", "24%", 2, -12, 10],
  ["92%", "65%", 3, -17, -8], ["77%", "85%", 2, 10, -13], ["50%", "7%", 2, 7, 8],
] as const;

const DECK_POSITIONS = {
  "-2": { x: -344, y: 8, rotateY: 28, rotateZ: 0, scale: 0.8, opacity: 0.76, zIndex: 1 },
  "-1": { x: -172, y: 2, rotateY: 13, rotateZ: 0, scale: 0.93, opacity: 0.94, zIndex: 2 },
  "0": { x: 0, y: -5, rotateY: 0, rotateZ: 0, scale: 1, opacity: 1, zIndex: 3 },
  "1": { x: 172, y: 2, rotateY: -13, rotateZ: 0, scale: 0.93, opacity: 0.94, zIndex: 2 },
  "2": { x: 344, y: 8, rotateY: -28, rotateZ: 0, scale: 0.8, opacity: 0.76, zIndex: 1 },
} as const;

const COMPACT_DECK_POSITIONS = {
  "-2": { x: -255, y: 8, rotateY: 25, rotateZ: 0, scale: 0.76, opacity: 0.72, zIndex: 1 },
  "-1": { x: -132, y: 2, rotateY: 12, rotateZ: 0, scale: 0.9, opacity: 0.92, zIndex: 2 },
  "0": { x: 0, y: -5, rotateY: 0, rotateZ: 0, scale: 1, opacity: 1, zIndex: 3 },
  "1": { x: 132, y: 2, rotateY: -12, rotateZ: 0, scale: 0.9, opacity: 0.92, zIndex: 2 },
  "2": { x: 255, y: 8, rotateY: -25, rotateZ: 0, scale: 0.76, opacity: 0.72, zIndex: 1 },
} as const;

function deckOffset(index: number, activeIndex: number, count: number): number {
  const rawOffset = index - activeIndex;
  const wrapForward = rawOffset - count;
  const wrapBackward = rawOffset + count;
  return [rawOffset, wrapForward, wrapBackward].reduce((closest, candidate) => (
    Math.abs(candidate) < Math.abs(closest) ? candidate : closest
  ));
}

function promptTone(index: number): "blue" | "violet" | "mint" {
  return (["blue", "violet", "mint"] as const)[index % 3] ?? "blue";
}

/**
 * Wheel-driven prompt selector. The cards sit on a shallow 3D arc so users can
 * preview neighboring drafts without a horizontal scroller or an oversized
 * one-card-at-a-time presentation.
 */
export function PromptParticleDeck({ suggestions, disabled = false, onPick }: PromptParticleDeckProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [compactDeck, setCompactDeck] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const wheelLockUntil = useRef(0);
  const dragState = useRef<{ pointerId: number; startX: number; deltaX: number } | null>(null);
  const suppressClick = useRef(false);
  const reducedMotion = useReducedMotion() ?? false;
  const activeSuggestion = suggestions[activeIndex];
  const autoPlaying = !disabled && !hovering && !dragging && !reducedMotion && suggestions.length > 1;

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1150px)");
    const updateCompactDeck = () => setCompactDeck(media.matches);
    updateCompactDeck();
    media.addEventListener("change", updateCompactDeck);
    return () => media.removeEventListener("change", updateCompactDeck);
  }, []);

  useEffect(() => {
    if (!autoPlaying) return undefined;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % suggestions.length);
    }, 4600);
    return () => window.clearInterval(timer);
  }, [autoPlaying, suggestions.length]);

  const selectIndex = (nextIndex: number) => {
    if (suggestions.length < 2) return;
    const next = (nextIndex + suggestions.length) % suggestions.length;
    setActiveIndex(next);
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (Math.abs(event.deltaY) < 4) return;
    event.preventDefault();
    if (Date.now() < wheelLockUntil.current) return;
    wheelLockUntil.current = Date.now() + 140;
    selectIndex(activeIndex + (event.deltaY > 0 ? 1 : -1));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      selectIndex(activeIndex + 1);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      selectIndex(activeIndex - 1);
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    }
    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(Math.max(0, suggestions.length - 1));
    }
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragState.current;
    if (drag?.pointerId === event.pointerId) {
      const deltaX = event.clientX - drag.startX;
      drag.deltaX = deltaX;
      setDragOffset(Math.max(-72, Math.min(72, deltaX)));
      return;
    }
    if (event.pointerType !== "mouse" || reducedMotion) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setTilt({
      x: ((event.clientY - rect.top) / rect.height - 0.5) * -7,
      y: ((event.clientX - rect.left) / rect.width - 0.5) * 7,
    });
  };

  const resetTilt = () => {
    setHovering(false);
    setTilt({ x: 0, y: 0 });
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragState.current = { pointerId: event.pointerId, startX: event.clientX, deltaX: 0 };
    setDragging(true);
    setHovering(true);
  };

  const completeDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const didDrag = Math.abs(drag.deltaX) > 10;
    suppressClick.current = didDrag;
    if (Math.abs(drag.deltaX) > 48) {
      selectIndex(activeIndex + (drag.deltaX < 0 ? 1 : -1));
    }
    dragState.current = null;
    setDragOffset(0);
    setDragging(false);
  };

  if (!activeSuggestion) return null;

  const visibleSuggestions = suggestions
    .map((suggestion, index) => ({ suggestion, index, offset: deckOffset(index, activeIndex, suggestions.length) }))
    .filter(({ offset }) => Math.abs(offset) <= 2);

  return (
    <div
      className={`prompt-particle-deck${hovering ? " is-exploring" : ""}`}
      role="region"
      tabIndex={0}
      aria-label="Suggested prompt drafts"
      data-autoplay={autoPlaying ? "true" : "false"}
      onWheel={handleWheel}
      onKeyDown={handleKeyDown}
    >
      <div
        className="prompt-particle-deck__stage"
        onPointerMove={handlePointerMove}
        onPointerEnter={() => setHovering(true)}
        onPointerLeave={resetTilt}
        onPointerDown={handlePointerDown}
        onPointerUp={completeDrag}
        onPointerCancel={completeDrag}
      >
        <div className="prompt-particle-deck__particles" aria-hidden="true">
          {PARTICLES.map(([left, top, size, driftX, driftY], index) => (
            <motion.i
              key={`${activeSuggestion.id}-${index}`}
              className="prompt-particle-deck__particle"
              style={{ left, top, width: size, height: size }}
              initial={false}
              animate={hovering && !reducedMotion
                ? { x: [0, driftX, 0], y: [0, driftY, 0], opacity: [0.3, 0.82, 0.38], scale: [0.8, 1.18, 0.84] }
                : { x: 0, y: 0, opacity: 0.2, scale: 1 }}
              transition={{ duration: 1.35 + index * 0.08, ease: [0.22, 1, 0.36, 1], repeat: hovering && !reducedMotion ? Infinity : 0 }}
            />
          ))}
        </div>
        {visibleSuggestions.map(({ suggestion, index, offset }) => {
          const positions = compactDeck ? COMPACT_DECK_POSITIONS : DECK_POSITIONS;
          const position = positions[String(offset) as keyof typeof positions];
          const isActive = index === activeIndex;
          return (
            <motion.button
              key={suggestion.id}
              type="button"
              className="prompt-particle-deck__card"
              data-active={isActive ? "true" : "false"}
              data-tone={promptTone(index)}
              initial={false}
              animate={{
                ...position,
                x: position.x + (dragging ? dragOffset : 0),
                rotateX: isActive && !reducedMotion ? tilt.x : 0,
                rotateY: position.rotateY + (isActive && !reducedMotion ? tilt.y : 0),
              }}
              transition={reducedMotion
                ? { duration: 0.01 }
                : { type: "spring", stiffness: 300, damping: 28, mass: 0.62 }}
              disabled={disabled}
              title={disabled
                ? "Create a Project Link first"
                : isActive
                  ? "Click to edit this prompt"
                  : "Click to preview this prompt"}
              onFocus={() => setHovering(true)}
              onBlur={resetTilt}
              onClick={() => {
                if (disabled) return;
                if (suppressClick.current) {
                  suppressClick.current = false;
                  return;
                }
                if (isActive) onPick(suggestion);
                else selectIndex(index);
              }}
            >
              <span className="prompt-particle-deck__label">{suggestion.label}</span>
            </motion.button>
          );
        })}
      </div>
      <div className="prompt-particle-deck__steps" aria-hidden="true">
        {suggestions.map((suggestion, index) => <i key={suggestion.id} data-active={index === activeIndex ? "true" : "false"} />)}
      </div>
      <span className="sr-only" aria-live="polite">Selected draft: {activeSuggestion.label}. Use the mouse wheel, up and down arrow keys, or drag the card ring left and right to browse.</span>
    </div>
  );
}
