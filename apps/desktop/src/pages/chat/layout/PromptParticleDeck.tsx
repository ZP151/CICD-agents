import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useSpring,
} from "motion/react";
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
  ["8%", "24%", 4, 22, -12], ["14%", "69%", 3, 18, 15], ["25%", "12%", 3, -14, 18],
  ["34%", "82%", 5, 13, -17], ["65%", "11%", 4, 19, 12], ["78%", "27%", 3, -17, 16],
  ["88%", "62%", 5, -21, -10], ["73%", "82%", 3, 15, -18], ["48%", "7%", 3, 12, 9],
  ["18%", "44%", 3, 18, -7], ["84%", "42%", 4, -19, 8], ["57%", "87%", 3, 9, -16],
] as const;

function PromptGlyph({ id }: { id: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (id.includes("review")) return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...common} d="m5 12 4 4L19 6" /><path {...common} d="M5 5h9" /></svg>;
  if (id.includes("pipeline")) return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...common} d="M5 5v14M19 5v14M5 9h6m2 6h6" /><circle cx="12" cy="9" r="2" {...common} /></svg>;
  if (id.includes("commit")) return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...common} d="M6 12h12M12 6v12" /><circle cx="12" cy="12" r="3.25" {...common} /></svg>;
  if (id.includes("pr")) return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...common} d="M7 5v14m0-14a3 3 0 1 0 0 6m0 2a3 3 0 1 1 0 6M7 8h10a2 2 0 0 1 2 2v3" /></svg>;
  if (id.includes("branch")) return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...common} d="M7 5v14m0-14a3 3 0 1 0 0 6m0 2a3 3 0 1 1 0 6m0-5h6a4 4 0 0 1 4 4v3" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="5.5" {...common} /><path {...common} d="m15 15 4 4" /></svg>;
}

/** A wheel-driven vertical deck. Particles activate only while exploring a draft. */
export function PromptParticleDeck({ suggestions, disabled = false, onPick }: PromptParticleDeckProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [hovering, setHovering] = useState(false);
  const wheelLockUntil = useRef(0);
  const reducedMotion = useReducedMotion() ?? false;
  const rotateX = useSpring(0, { stiffness: 260, damping: 24, mass: 0.55 });
  const rotateY = useSpring(0, { stiffness: 260, damping: 24, mass: 0.55 });
  const activeSuggestion = suggestions[activeIndex];

  const selectIndex = (nextIndex: number) => {
    const next = Math.min(suggestions.length - 1, Math.max(0, nextIndex));
    if (next === activeIndex) return;
    setDirection(next > activeIndex ? 1 : -1);
    setActiveIndex(next);
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (Math.abs(event.deltaY) < 4) return;
    event.preventDefault();
    if (Date.now() < wheelLockUntil.current) return;
    wheelLockUntil.current = Date.now() + 130;
    selectIndex(activeIndex + (event.deltaY > 0 ? 1 : -1));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      selectIndex(activeIndex + 1);
    }
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      selectIndex(activeIndex - 1);
    }
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType !== "mouse" || reducedMotion) return;
    const rect = event.currentTarget.getBoundingClientRect();
    rotateX.set(((event.clientY - rect.top) / rect.height - 0.5) * -12);
    rotateY.set(((event.clientX - rect.left) / rect.width - 0.5) * 14);
  };

  const resetTilt = () => {
    rotateX.set(0);
    rotateY.set(0);
    setHovering(false);
  };

  if (!activeSuggestion) return null;

  return (
    <div
      className={`prompt-particle-deck${hovering ? " is-exploring" : ""}`}
      role="region"
      tabIndex={0}
      aria-label="Suggested prompt drafts"
      onWheel={handleWheel}
      onKeyDown={handleKeyDown}
    >
      <div className="prompt-particle-deck__stage">
        <div className="prompt-particle-deck__particles" aria-hidden="true">
          {PARTICLES.map(([left, top, size, driftX, driftY], index) => (
            <motion.i
              key={`${activeSuggestion.id}-${index}`}
              className="prompt-particle-deck__particle"
              style={{ left, top, width: size, height: size }}
              initial={false}
              animate={hovering && !reducedMotion
                ? { x: [0, driftX, 0], y: [0, driftY, 0], opacity: [0.42, 0.95, 0.48], scale: [0.72, 1.25, 0.78] }
                : { x: 0, y: 0, opacity: 0.3, scale: 1 }}
              transition={{ duration: 1.25 + index * 0.08, ease: [0.22, 1, 0.36, 1], repeat: hovering && !reducedMotion ? Infinity : 0 }}
            />
          ))}
        </div>
        <AnimatePresence initial={false} mode="wait" custom={direction}>
          <motion.button
            key={activeSuggestion.id}
            type="button"
            className="prompt-particle-deck__card"
            initial={{ opacity: 0, y: direction > 0 ? 28 : -28, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: hovering && !reducedMotion ? 1.018 : 1 }}
            exit={{ opacity: 0, y: direction > 0 ? -20 : 20, scale: 0.985 }}
            transition={{ duration: reducedMotion ? 0.01 : 0.28, ease: [0.22, 1, 0.36, 1] }}
            style={{ rotateX, rotateY }}
            disabled={disabled}
            title={disabled ? "Create a Project Link first" : "Click to edit this prompt"}
            onPointerMove={handlePointerMove}
            onPointerEnter={() => setHovering(true)}
            onPointerLeave={resetTilt}
            onFocus={() => setHovering(true)}
            onBlur={resetTilt}
            onClick={() => {
              if (!disabled) onPick(activeSuggestion);
            }}
          >
            <span className="prompt-particle-deck__glyph"><PromptGlyph id={activeSuggestion.id} /></span>
            <span className="prompt-particle-deck__label">{activeSuggestion.label}</span>
          </motion.button>
        </AnimatePresence>
      </div>
      <div className="prompt-particle-deck__steps" aria-hidden="true">
        {suggestions.map((suggestion, index) => <i key={suggestion.id} data-active={index === activeIndex ? "true" : "false"} />)}
      </div>
      <span className="sr-only" aria-live="polite">Selected draft: {activeSuggestion.label}. Use the mouse wheel or arrow keys to browse.</span>
    </div>
  );
}
