import { useEffect, useRef } from "react";
import { assignmentStartSeconds } from "./playData";
import { ArrowClockwise, CaretDown, Pause, Play } from "@phosphor-icons/react";

/** The bottom playback timeline: transport, speed, and the scrubbable track. */
export function Timeline({ assignment, playback, onRun, onRestart, onScrub, duration, getTime, speed, onSpeed }) {
  const speeds = [0.5, 1, 1.5];
  const cycleSpeed = () => onSpeed(speeds[(speeds.indexOf(speed) + 1) % speeds.length]);
  const selectedStart = assignment ? assignmentStartSeconds(assignment) : null;
  const trackRef = useRef(null);
  const headRef = useRef(null);
  const readoutRef = useRef(null);
  const snapFraction = 2 / duration;

  /*
   * The playhead is written straight to the DOM once per frame: a React state
   * update at 60Hz would re-render the whole app to move a 10px dot. It tracks
   * real SMIL time, replacing a decorative CSS animation whose fixed 3.2s had
   * no relationship to the play's actual duration.
   */
  useEffect(() => {
    const paint = () => {
      const t = Math.min(getTime(), duration);
      if (headRef.current) headRef.current.style.left = `${(t / duration) * 100}%`;
      if (readoutRef.current) readoutRef.current.textContent = `${t >= 2 ? "+" : ""}${(t - 2).toFixed(1)}s`;
      trackRef.current?.setAttribute("aria-valuenow", (t - 2).toFixed(1));
    };
    if (playback === "idle") {
      if (headRef.current) headRef.current.style.left = "0%";
      if (readoutRef.current) readoutRef.current.textContent = "";
      return undefined;
    }
    let frame = requestAnimationFrame(function step() {
      paint();
      frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [playback, duration, getTime]);

  const scrubToPointer = (event) => {
    const box = trackRef.current.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    onScrub(fraction * duration);
  };

  const onTrackKeyDown = (event) => {
    const step = event.shiftKey ? 0.5 : 0.1;
    const current = Math.min(getTime(), duration);
    const jump = { ArrowLeft: current - step, ArrowRight: current + step, Home: 0, End: duration }[event.key];
    if (jump === undefined) return;
    event.preventDefault();
    event.stopPropagation(); // the app-level arrows nudge the selected player
    onScrub(jump);
  };

  return (
    <footer className="timeline">
      <button className="timeline-play" aria-label={playback === "running" ? "Pause animation" : playback === "paused" ? "Resume animation" : "Play animation"} onClick={onRun}>
        {playback === "running" ? <Pause size={22} weight="fill" /> : <Play size={22} weight="fill" />}
      </button>
      <button className="speed-control" aria-label={`Playback speed ${speed.toFixed(2)}x`} onClick={cycleSpeed}>{speed.toFixed(2)}x<CaretDown size={15} /></button>
      <div className="timeline-track" aria-label="Play timing">
        <div className="phase-labels">
          <span>Pre-snap</span>
          <strong>Snap</strong>
          <span>
            Assignments{selectedStart === null ? "" : ` · selected ${selectedStart.toFixed(2)}s`}
            <small ref={readoutRef} className="time-readout" />
          </span>
        </div>
        <div
          ref={trackRef}
          className="phase-bars"
          role="slider"
          tabIndex={0}
          aria-label="Play position, seconds relative to the snap"
          aria-valuemin={-2}
          aria-valuemax={Number((duration - 2).toFixed(1))}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture?.(event.pointerId);
            scrubToPointer(event);
          }}
          onPointerMove={(event) => {
            if (event.buttons) scrubToPointer(event);
          }}
          onKeyDown={onTrackKeyDown}
          style={{ gridTemplateColumns: `${snapFraction * 100}% ${(1 - snapFraction) * 100}%` }}
        >
          <span className="motion-phase" />
          <i className="snap-marker" style={{ left: `${snapFraction * 100}%` }} />
          <span className="route-phase" />
          <b ref={headRef} className={playback} />
          {selectedStart !== null ? <em className="selected-timing-marker" style={{ "--timing-position": `${Math.min(96, Math.max(4, (selectedStart / duration) * 100))}%` }} /> : null}
        </div>
      </div>
      <button className="timeline-settings" aria-label="Restart animation" onClick={onRestart}><ArrowClockwise size={21} /></button>
    </footer>
  );
}
