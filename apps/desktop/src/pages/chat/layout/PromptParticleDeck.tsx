import { animate, motion, useMotionValue, useReducedMotion } from "motion/react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent,
} from "react";
import type { SuggestionReply } from "../../../components/conversation/SuggestionReplyBar.js";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

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
  "-3": { x: -615, y: 38, z: -160, rotateY: 42, rotateZ: -2.1, scale: 0.54, opacity: 0, zIndex: 0 },
  "-2": { x: -410, y: 24, z: -94, rotateY: 34, rotateZ: -1.4, scale: 0.7, opacity: 0.56, zIndex: 1 },
  "-1": { x: -205, y: 5, z: -30, rotateY: 20, rotateZ: -0.5, scale: 0.88, opacity: 0.87, zIndex: 2 },
  "0": { x: 0, y: -10, z: 28, rotateY: 0, rotateZ: 0, scale: 1, opacity: 1, zIndex: 3 },
  "1": { x: 205, y: 5, z: -30, rotateY: -20, rotateZ: 0.5, scale: 0.88, opacity: 0.87, zIndex: 2 },
  "2": { x: 410, y: 24, z: -94, rotateY: -34, rotateZ: 1.4, scale: 0.7, opacity: 0.56, zIndex: 1 },
  "3": { x: 615, y: 38, z: -160, rotateY: -42, rotateZ: 2.1, scale: 0.54, opacity: 0, zIndex: 0 },
} as const;

const COMPACT_DECK_POSITIONS = {
  "-3": { x: -426, y: 29, z: -116, rotateY: 37, rotateZ: -1.6, scale: 0.5, opacity: 0, zIndex: 0 },
  "-2": { x: -284, y: 19, z: -70, rotateY: 30, rotateZ: -1, scale: 0.66, opacity: 0.5, zIndex: 1 },
  "-1": { x: -146, y: 4, z: -22, rotateY: 16, rotateZ: -0.4, scale: 0.84, opacity: 0.8, zIndex: 2 },
  "0": { x: 0, y: -8, z: 20, rotateY: 0, rotateZ: 0, scale: 1, opacity: 1, zIndex: 3 },
  "1": { x: 146, y: 4, z: -22, rotateY: -16, rotateZ: 0.4, scale: 0.84, opacity: 0.8, zIndex: 2 },
  "2": { x: 284, y: 19, z: -70, rotateY: -30, rotateZ: 1, scale: 0.66, opacity: 0.5, zIndex: 1 },
  "3": { x: 426, y: 29, z: -116, rotateY: -37, rotateZ: 1.6, scale: 0.5, opacity: 0, zIndex: 0 },
} as const;

const DRAG_VISUAL_LIMIT = 172;
const DRAG_DISTANCE_PER_CARD = 118;
const DRAG_DISTANCE_START = 62;
const DRAG_VELOCITY_START = 0.42;
const DRAG_VELOCITY_PER_CARD = 0.58;
const WIDE_CARD_ADVANCE_DISTANCE = 205;
const COMPACT_CARD_ADVANCE_DISTANCE = 146;

interface DragState {
  pointerId: number;
  startX: number;
  deltaX: number;
  lastX: number;
  lastTime: number;
  velocityX: number;
}

interface PendingGlide {
  indexDelta: number;
  visualOffset: number;
  cardAdvanceDistance: number;
  velocityX: number;
  sequence: number;
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
  // WebView2 normally emits the browser-standard Arrow* values, while some
  // native key injectors surface the Win32 keysym names without the prefix.
  if (key === "ArrowRight" || key === "ArrowDown" || key === "Right" || key === "Down") return 1;
  if (key === "ArrowLeft" || key === "ArrowUp" || key === "Left" || key === "Up") return -1;
  if (key === "Home") return "start";
  if (key === "End") return suggestionCount > 0 ? "end" : null;
  return null;
}

export function promptDeckContinuationOffset(
  visualOffset: number,
  indexDelta: number,
  cardAdvanceDistance: number,
): number {
  return visualOffset + indexDelta * cardAdvanceDistance;
}

export function promptDeckInertiaDuration(continuationOffset: number, velocityX: number): number {
  const travel = Math.abs(continuationOffset);
  const velocity = Math.abs(velocityX);
  // A UIKit-style deceleration has one non-bouncy trajectory. Longer releases
  // take longer to coast, while velocity can extend the motion slightly without
  // making a fast flick feel like a spring rebound.
  return Math.min(0.72, Math.max(0.28, 0.28 + travel / 900 + Math.min(velocity / 12, 0.1)));
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
  const [settling, setSettling] = useState(false);
  const [instantPositioning, setInstantPositioning] = useState(false);
  const [glideRequest, setGlideRequest] = useState(0);
  const wheelLockUntil = useRef(0);
  const dragState = useRef<DragState | null>(null);
  const suppressClick = useRef(false);
  const deckRef = useRef<HTMLDivElement>(null);
  const pendingGlide = useRef<PendingGlide | null>(null);
  const glideFrame = useRef<number | null>(null);
  const interactionSequence = useRef(0);
  const dragX = useMotionValue(0);
  const reducedMotion = useReducedMotion() ?? false;
  const activeSuggestion = suggestions[activeIndex];
  const autoPlaying = !disabled && !hovering && !dragging && !settling && !reducedMotion && suggestions.length > 1;
  const particlesFlowing = !reducedMotion && (hovering || autoPlaying);

  useEffect(() => {
    const deck = deckRef.current;
    if (!deck) return undefined;
    // The chat pane can be narrower than the window because of navigation and
    // split panels. Measure the ring itself rather than the viewport so its
    // outer cards are never clipped by a wide-window false positive.
    const updateDeckDensity = (width: number) => setCompactDeck(width < 940);
    updateDeckDensity(deck.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) updateDeckDensity(width);
    });
    observer.observe(deck);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!autoPlaying) return undefined;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % suggestions.length);
    }, 4600);
    return () => window.clearInterval(timer);
  }, [autoPlaying, suggestions.length]);

  useIsomorphicLayoutEffect(() => {
    const glide = pendingGlide.current;
    if (!glide) return;
    pendingGlide.current = null;

    // Move the card geometry and the ring transform together before paint.
    // The visible position therefore stays continuous while the active index
    // changes, then the ring itself coasts to rest in a single motion.
    setInstantPositioning(true);
    setActiveIndex((current) => (current + glide.indexDelta + suggestions.length) % suggestions.length);
    const continuationOffset = promptDeckContinuationOffset(
      glide.visualOffset,
      glide.indexDelta,
      glide.cardAdvanceDistance,
    );
    dragX.set(continuationOffset);
    glideFrame.current = window.requestAnimationFrame(() => {
      glideFrame.current = null;
      const inertia = animate(dragX, 0, reducedMotion
        ? { duration: 0.01 }
        : {
            type: "tween",
            duration: promptDeckInertiaDuration(continuationOffset, glide.velocityX),
            ease: [0.16, 1, 0.3, 1],
          });
      void inertia.then(() => {
        if (interactionSequence.current !== glide.sequence) return;
        setSettling(false);
        setInstantPositioning(false);
      });
    });
  }, [dragX, glideRequest, reducedMotion, suggestions.length]);

  useEffect(() => () => {
    if (glideFrame.current !== null) window.cancelAnimationFrame(glideFrame.current);
  }, []);

  const selectIndex = (nextIndex: number) => {
    if (suggestions.length < 2) return;
    const next = (nextIndex + suggestions.length) % suggestions.length;
    setActiveIndex(next);
  };

  const selectRelative = (delta: number) => {
    if (suggestions.length < 2 || delta === 0) return;
    setActiveIndex((current) => (current + delta + suggestions.length) % suggestions.length);
  };

  const applyKeyboardAction = (action: number | "start" | "end") => {
    if (action === "start") setActiveIndex(0);
    else if (action === "end") setActiveIndex(Math.max(0, suggestions.length - 1));
    else selectRelative(action);
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (Math.abs(event.deltaY) < 4) return;
    event.preventDefault();
    if (Date.now() < wheelLockUntil.current) return;
    wheelLockUntil.current = Date.now() + 140;
    selectRelative(event.deltaY > 0 ? 1 : -1);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return;
    const action = promptDeckKeyboardAction(event.key, suggestions.length);
    if (action === null) return;
    event.preventDefault();
    applyKeyboardAction(action);
  };

  useEffect(() => {
    const handleGlobalKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const action = promptDeckKeyboardAction(event.key, suggestions.length);
      if (action === null) return;
      event.preventDefault();
      applyKeyboardAction(action);
    };
    window.addEventListener("keydown", handleGlobalKeyDown, true);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown, true);
  }, [suggestions.length]);

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
    interactionSequence.current += 1;
    if (glideFrame.current !== null) {
      window.cancelAnimationFrame(glideFrame.current);
      glideFrame.current = null;
    }
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
    setSettling(false);
    setInstantPositioning(false);
    setDragging(true);
    setHovering(true);
  };

  const completeDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    // Pointer events can be coalesced during a fast drag. The release event is
    // the only coordinate we are guaranteed to receive, so fold it into the
    // gesture before resolving momentum instead of trusting the last move.
    const releaseTime = performance.now();
    const finalDeltaX = event.clientX - drag.startX;
    const releaseElapsed = Math.max(8, releaseTime - drag.lastTime);
    const releaseVelocity = (event.clientX - drag.lastX) / releaseElapsed;
    drag.deltaX = finalDeltaX;
    drag.velocityX = drag.velocityX * 0.32 + releaseVelocity * 0.68;
    const finalVisualOffset = resistedDragOffset(finalDeltaX);
    dragX.set(finalVisualOffset);
    const didDrag = Math.abs(finalDeltaX) > 10;
    suppressClick.current = didDrag;
    const release = resolvePromptDeckRelease(finalDeltaX, drag.velocityX, suggestions.length);
    setReleaseStrength(release.strength);
    const cardAdvanceDistance = compactDeck
      ? COMPACT_CARD_ADVANCE_DISTANCE
      : WIDE_CARD_ADVANCE_DISTANCE;
    if (release.indexDelta === 0) {
      void animate(dragX, 0, reducedMotion
        ? { duration: 0.01 }
        : {
            type: "tween",
            duration: promptDeckInertiaDuration(dragX.get(), drag.velocityX) * 0.72,
            ease: [0.2, 0.8, 0.2, 1],
          });
    } else {
      setSettling(true);
      pendingGlide.current = {
        indexDelta: release.indexDelta,
        visualOffset: finalVisualOffset,
        cardAdvanceDistance,
        velocityX: drag.velocityX,
        sequence: interactionSequence.current,
      };
      setGlideRequest((current) => current + 1);
    }
    dragState.current = null;
    setDragging(false);
  };

  if (!activeSuggestion) return null;

  const visibleSuggestions = suggestions
    .map((suggestion, index) => ({ suggestion, index, offset: deckOffset(index, activeIndex, suggestions.length) }))
    .filter(({ offset }) => Math.abs(offset) <= 3);

  return (
    <div
      ref={deckRef}
      className={`prompt-particle-deck${hovering ? " is-exploring" : ""}${autoPlaying ? " is-autoplaying" : ""}`}
      role="region"
      aria-label="Suggested prompt drafts"
      aria-roledescription="prompt carousel"
      data-autoplay={autoPlaying ? "true" : "false"}
      onWheel={handleWheel}
      onKeyDownCapture={handleKeyDown}
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
              animate={particlesFlowing
                ? { x: [0, driftX, 0], y: [0, driftY, 0], opacity: [0.3, 0.82, 0.38], scale: [0.8, 1.18, 0.84] }
                : { x: 0, y: 0, opacity: 0.2, scale: 1 }}
              transition={{ duration: 1.35 + index * 0.08, ease: [0.22, 1, 0.36, 1], repeat: particlesFlowing ? Infinity : 0 }}
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
              data-depth={Math.abs(offset)}
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
                : instantPositioning
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
