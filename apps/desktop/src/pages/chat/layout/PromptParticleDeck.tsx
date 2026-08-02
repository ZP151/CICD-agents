import { animate, motion, useMotionValue, useReducedMotion } from "motion/react";
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
  "-2": { x: -356, y: 16, rotateY: 32, rotateZ: 0, scale: 0.72, opacity: 0.62, zIndex: 1 },
  "-1": { x: -184, y: 4, rotateY: 18, rotateZ: 0, scale: 0.88, opacity: 0.88, zIndex: 2 },
  "0": { x: 0, y: -8, rotateY: 0, rotateZ: 0, scale: 1, opacity: 1, zIndex: 3 },
  "1": { x: 184, y: 4, rotateY: -18, rotateZ: 0, scale: 0.88, opacity: 0.88, zIndex: 2 },
  "2": { x: 356, y: 16, rotateY: -32, rotateZ: 0, scale: 0.72, opacity: 0.62, zIndex: 1 },
} as const;

const COMPACT_DECK_POSITIONS = {
  "-2": { x: -258, y: 14, rotateY: 30, rotateZ: 0, scale: 0.68, opacity: 0.54, zIndex: 1 },
  "-1": { x: -136, y: 4, rotateY: 16, rotateZ: 0, scale: 0.84, opacity: 0.82, zIndex: 2 },
  "0": { x: 0, y: -8, rotateY: 0, rotateZ: 0, scale: 1, opacity: 1, zIndex: 3 },
  "1": { x: 136, y: 4, rotateY: -16, rotateZ: 0, scale: 0.84, opacity: 0.82, zIndex: 2 },
  "2": { x: 258, y: 14, rotateY: -30, rotateZ: 0, scale: 0.68, opacity: 0.54, zIndex: 1 },
} as const;

const DRAG_VISUAL_LIMIT = 172;
const DRAG_DISTANCE_PER_CARD = 118;
const DRAG_DISTANCE_START = 62;
const DRAG_VELOCITY_START = 0.42;
const DRAG_VELOCITY_PER_CARD = 0.58;

interface DragState {
  pointerId: number;
  startX: number;
  deltaX: number;
  lastX: number;
  lastTime: number;
  velocityX: number;
}

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

function resistedDragOffset(deltaX: number): number {
  const direction = Math.sign(deltaX);
  const magnitude = Math.abs(deltaX);
  if (magnitude <= DRAG_VISUAL_LIMIT) return deltaX;
  return direction * (DRAG_VISUAL_LIMIT + (magnitude - DRAG_VISUAL_LIMIT) * 0.18);
}

export function resolvePromptDeckRelease(deltaX: number, velocityX: number, suggestionCount: number) {
  const distance = Math.abs(deltaX);
  const velocity = Math.abs(velocityX);
  const distanceSteps = distance < DRAG_DISTANCE_START
    ? 0
    : Math.floor((distance - DRAG_DISTANCE_START) / DRAG_DISTANCE_PER_CARD) + 1;
  const momentumSteps = velocity < DRAG_VELOCITY_START
    ? 0
    : Math.min(3, Math.floor((velocity - DRAG_VELOCITY_START) / DRAG_VELOCITY_PER_CARD) + 1);
  const steps = Math.min(Math.max(distanceSteps, momentumSteps), Math.max(0, suggestionCount - 1));
  return {
    // Dragging left advances the visible ring; dragging right returns it.
    indexDelta: steps === 0 ? 0 : deltaX < 0 ? steps : -steps,
    steps,
    strength: Math.min(1, Math.max(distance / 360, velocity / 1.8)),
  };
}

export function promptDeckKeyboardAction(key: string, suggestionCount: number): number | "start" | "end" | null {
  if (key === "ArrowRight" || key === "ArrowDown") return 1;
  if (key === "ArrowLeft" || key === "ArrowUp") return -1;
  if (key === "Home") return "start";
  if (key === "End") return suggestionCount > 0 ? "end" : null;
  return null;
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
  const [releaseStrength, setReleaseStrength] = useState(0);
  const [compactDeck, setCompactDeck] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const wheelLockUntil = useRef(0);
  const dragState = useRef<DragState | null>(null);
  const suppressClick = useRef(false);
  const dragX = useMotionValue(0);
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

  const selectRelative = (delta: number) => {
    if (suggestions.length < 2 || delta === 0) return;
    setActiveIndex((current) => (current + delta + suggestions.length) % suggestions.length);
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (Math.abs(event.deltaY) < 4) return;
    event.preventDefault();
    if (Date.now() < wheelLockUntil.current) return;
    wheelLockUntil.current = Date.now() + 140;
    selectRelative(event.deltaY > 0 ? 1 : -1);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const action = promptDeckKeyboardAction(event.key, suggestions.length);
    if (action === null) return;
    event.preventDefault();
    if (action === "start") setActiveIndex(0);
    else if (action === "end") setActiveIndex(Math.max(0, suggestions.length - 1));
    else selectRelative(action);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragState.current;
    if (drag?.pointerId === event.pointerId) {
      const deltaX = event.clientX - drag.startX;
      const now = performance.now();
      const elapsed = Math.max(8, now - drag.lastTime);
      const instantaneousVelocity = (event.clientX - drag.lastX) / elapsed;
      drag.deltaX = deltaX;
      drag.velocityX = drag.velocityX * 0.32 + instantaneousVelocity * 0.68;
      drag.lastX = event.clientX;
      drag.lastTime = now;
      dragX.set(resistedDragOffset(deltaX));
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
    const now = performance.now();
    dragX.stop();
    dragX.set(0);
    dragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      deltaX: 0,
      lastX: event.clientX,
      lastTime: now,
      velocityX: 0,
    };
    setReleaseStrength(0);
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
    const release = resolvePromptDeckRelease(drag.deltaX, drag.velocityX, suggestions.length);
    setReleaseStrength(release.strength);
    selectRelative(release.indexDelta);
    void animate(dragX, 0, reducedMotion
      ? { duration: 0.01 }
      : {
          type: "spring",
          stiffness: 360 + release.strength * 160,
          damping: 30 + release.strength * 5,
          mass: 0.56,
          velocity: drag.velocityX * 1000,
        });
    dragState.current = null;
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
      aria-roledescription="prompt carousel"
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
        <motion.div className="prompt-particle-deck__ring" style={{ x: dragX }}>
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
                x: position.x,
                rotateX: isActive && !reducedMotion ? tilt.x : 0,
                rotateY: position.rotateY + (isActive && !reducedMotion ? tilt.y : 0),
              }}
              transition={reducedMotion
                ? { duration: 0.01 }
                : {
                    type: "spring",
                    stiffness: 300 + releaseStrength * 180,
                    damping: 28 + releaseStrength * 5,
                    mass: 0.62,
                  }}
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
        </motion.div>
      </div>
      <div className="prompt-particle-deck__steps" aria-hidden="true">
        {suggestions.map((suggestion, index) => <i key={suggestion.id} data-active={index === activeIndex ? "true" : "false"} />)}
      </div>
      <span className="sr-only" aria-live="polite">Selected draft: {activeSuggestion.label}. Use the mouse wheel, left and right arrow keys, or drag the card ring left and right to browse. Faster or longer drags move through more drafts.</span>
    </div>
  );
}
