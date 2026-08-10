import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type WheelEvent,
} from "react";
import type { SuggestionReply } from "../../../components/conversation/SuggestionReplyBar.js";

interface PromptParticleDeckProps {
  suggestions: SuggestionReply[];
  disabled?: boolean;
  onPick: (suggestion: SuggestionReply) => void;
}

const WHEEL_STEP = 80;
const MAX_WHEEL_STEPS = 2;

/**
 * A 3D set of context-aware drafts. It intentionally only appears in the New
 * chat empty state: a conversation already has its own next-step UI. The deck
 * follows direct input (wheel or keyboard) instead of taking focus away with
 * an idle carousel; picking a card still only fills the composer.
 */
export function PromptParticleDeck({ suggestions, disabled = false, onPick }: PromptParticleDeckProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [compact, setCompact] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const wheelDeltaRef = useRef(0);
  const wheelFrameRef = useRef<number | null>(null);
  const suggestionKey = useMemo(() => suggestions.map((suggestion) => suggestion.id).join("|"), [suggestions]);

  useEffect(() => {
    setActiveIndex(0);
  }, [suggestionKey]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const updateDensity = () => setCompact(stage.getBoundingClientRect().width < 560);
    updateDensity();
    const observer = new ResizeObserver(updateDensity);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const moveActive = useCallback((delta: number) => {
    if (suggestions.length === 0) return;
    setActiveIndex((current) => wrapIndex(current + delta, suggestions.length));
  }, [suggestions.length]);

  useEffect(() => {
    return () => {
      if (wheelFrameRef.current !== null) cancelAnimationFrame(wheelFrameRef.current);
    };
  }, []);

  if (suggestions.length === 0) return null;

  const handleWheel = (event: WheelEvent<HTMLElement>) => {
    if (disabled) return;
    const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (delta === 0) return;
    event.preventDefault();
    wheelDeltaRef.current += delta;
    if (wheelFrameRef.current !== null) return;
    wheelFrameRef.current = requestAnimationFrame(() => {
      wheelFrameRef.current = null;
      const wholeSteps = Math.trunc(wheelDeltaRef.current / WHEEL_STEP);
      if (wholeSteps === 0) return;
      const steps = Math.max(-MAX_WHEEL_STEPS, Math.min(MAX_WHEEL_STEPS, wholeSteps));
      wheelDeltaRef.current -= wholeSteps * WHEEL_STEP;
      moveActive(steps);
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (disabled) return;
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown" || event.key === "PageDown") {
      nextIndex = activeIndex + 1;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp" || event.key === "PageUp") {
      nextIndex = activeIndex - 1;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = suggestions.length - 1;
    } else if ((event.key === "Enter" || event.key === " ") && event.target === event.currentTarget) {
      event.preventDefault();
      onPick(suggestions[activeIndex]!);
      return;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    setActiveIndex(wrapIndex(nextIndex, suggestions.length));
  };

  return (
    <section
      className="prompt-particle-deck"
      role="region"
      aria-label="Suggested prompt drafts"
      aria-roledescription="prompt carousel"
      data-interaction="direct"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={handleKeyDown}
      onWheel={handleWheel}
    >
      <div ref={stageRef} className="prompt-particle-deck__stage">
        <div className="prompt-particle-deck__particles" aria-hidden="true">
          {PARTICLES.map(([left, top, size, delay]) => (
            <i key={`${left}-${top}`} style={{ left, top, width: size, height: size, animationDelay: `${delay}s` }} />
          ))}
        </div>
        <div className="prompt-particle-deck__ring">
          {suggestions.map((suggestion, index) => {
            const offset = deckOffset(index, activeIndex, suggestions.length);
            const isActive = offset === 0;
            return (
              <button
                key={suggestion.id}
                type="button"
                disabled={disabled}
                data-suggestion-id={suggestion.id}
                aria-label={`Use prompt: ${suggestion.label}`}
                title={disabled ? "Create a Project Link first" : "Add this prompt to the composer"}
                className="prompt-particle-deck__card"
                data-active={isActive ? "true" : "false"}
                data-depth={Math.abs(offset)}
                aria-current={isActive ? "true" : undefined}
                style={cardTransform(offset, compact)}
                onFocus={() => setActiveIndex(index)}
                onPointerDown={() => setActiveIndex(index)}
                // A native button click preserves both pointer and keyboard
                // activation, including WebViews that synthesize a click
                // after a 3D-transformed pointer interaction.
                onClick={() => onPick(suggestion)}
              >
                <span className="prompt-particle-deck__label">{suggestion.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="prompt-particle-deck__steps" aria-hidden="true">
        {suggestions.map((suggestion, index) => <i key={suggestion.id} data-active={index === activeIndex ? "true" : "false"} />)}
      </div>
    </section>
  );
}

const PARTICLES = [
  ["8%", "30%", 3, 0], ["18%", "72%", 3, 0.3], ["32%", "18%", 2, 0.6],
  ["65%", "14%", 3, 0.2], ["79%", "26%", 2, 0.75], ["91%", "65%", 3, 0.45],
] as const;

function wrapIndex(index: number, count: number): number {
  return ((index % count) + count) % count;
}

function deckOffset(index: number, activeIndex: number, count: number): number {
  const rawOffset = index - activeIndex;
  const forward = rawOffset - count;
  const backward = rawOffset + count;
  return [rawOffset, forward, backward].reduce((closest, candidate) => (
    Math.abs(candidate) < Math.abs(closest) ? candidate : closest
  ));
}

function cardTransform(offset: number, compact: boolean): CSSProperties {
  const depth = Math.abs(offset);
  const x = offset * (compact ? 142 : 205);
  const y = depth * (compact ? 8 : 14);
  const z = -depth * (compact ? 40 : 68);
  return {
    transform: `translate3d(${x}px, ${y}px, ${z}px) rotateY(${-offset * (compact ? 16 : 21)}deg) rotateZ(${-offset * 0.6}deg) scale(${1 - depth * 0.12})`,
    opacity: Math.max(0.42, 1 - depth * 0.14),
    zIndex: 5 - depth,
  };
}
