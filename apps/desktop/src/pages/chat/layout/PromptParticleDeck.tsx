import { motion, useReducedMotion } from "motion/react";
import {
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
  "-2": { x: -164, y: 14, rotateY: 32, rotateZ: -3.5, scale: 0.7, opacity: 0.6, zIndex: 1 },
  "-1": { x: -94, y: 5, rotateY: 17, rotateZ: -1.5, scale: 0.86, opacity: 0.84, zIndex: 2 },
  "0": { x: 0, y: -5, rotateY: 0, rotateZ: 0, scale: 1, opacity: 1, zIndex: 3 },
  "1": { x: 94, y: 5, rotateY: -17, rotateZ: 1.5, scale: 0.86, opacity: 0.84, zIndex: 2 },
  "2": { x: 164, y: 14, rotateY: -32, rotateZ: 3.5, scale: 0.7, opacity: 0.6, zIndex: 1 },
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
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const wheelLockUntil = useRef(0);
  const reducedMotion = useReducedMotion() ?? false;
  const activeSuggestion = suggestions[activeIndex];

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
      onWheel={handleWheel}
      onKeyDown={handleKeyDown}
    >
      <div
        className="prompt-particle-deck__stage"
        onPointerMove={handlePointerMove}
        onPointerEnter={() => setHovering(true)}
        onPointerLeave={resetTilt}
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
          const position = DECK_POSITIONS[String(offset) as keyof typeof DECK_POSITIONS];
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
      <span className="sr-only" aria-live="polite">Selected draft: {activeSuggestion.label}. Use the mouse wheel or up and down arrow keys to browse.</span>
    </div>
  );
}
