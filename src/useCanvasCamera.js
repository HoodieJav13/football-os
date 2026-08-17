import { useCallback, useEffect, useRef, useState } from "react";
import { fieldProjection, pointerToField, ZOOM_MAX } from "./fieldView";

/** The visible window's centre in field yards, for a given projection. */
function centreOf(projection) {
  return [
    (projection.lateralRange[0] + projection.lateralRange[1]) / 2,
    (projection.depthRange[0] + projection.depthRange[1]) / 2,
  ];
}

/**
 * The canvas camera: wheel-zoom about the cursor, and drag-to-pan once zoomed.
 *
 * State is `null` at base framing, else `{ factor, centre }` in field yards --
 * yards rather than pixels so the camera means the same thing in either view
 * and survives a resize. Everything downstream (drawing, dragging, snapping)
 * keeps working at any zoom because pointer input flows through the same
 * projection this produces.
 *
 * @param stageFor  () => the canvas stage element, or null before it mounts
 * @param view      "end" | "side", part of the projection identity
 * @param play      the current play, likewise
 */
export function useCanvasCamera({ stageFor, view, play }) {
  const [zoom, setZoom] = useState(null);
  /** A pan in progress: the projection frozen at pan start, plus start points. */
  const panSession = useRef(null);

  /*
   * Wheel-zoom about the cursor. The invariant that makes it feel right: the
   * field point under the pointer stays under the pointer through the zoom, so
   * a coach aims the wheel at the guard they care about and the camera dives
   * there. Bound as a real (non-passive) listener because a React wheel handler
   * cannot preventDefault, and a trackpad pinch arrives as ctrl+wheel that
   * would otherwise zoom the whole page.
   */
  useEffect(() => {
    const stage = stageFor();
    if (!stage) return undefined;
    const onWheel = (event) => {
      event.preventDefault();
      const box = stage.getBoundingClientRect();
      setZoom((current) => {
        const oldFactor = current?.factor ?? 1;
        const nextFactor = Math.min(ZOOM_MAX, Math.max(1, oldFactor * Math.exp(-event.deltaY * 0.002)));
        if (nextFactor <= 1) return null;
        const projection = fieldProjection({ width: box.width, height: box.height, view, play, zoom: current });
        const under = pointerToField(event, box, projection);
        const centre = centreOf(projection);
        const keep = oldFactor / nextFactor;
        return {
          factor: nextFactor,
          centre: [under[0] - (under[0] - centre[0]) * keep, under[1] - (under[1] - centre[1]) * keep],
        };
      });
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [stageFor, view, play]);

  /** True when a pan actually began, so the caller knows to stop handling the press. */
  const beginPan = useCallback((event) => {
    if (!(zoom?.factor > 1)) return false;
    const box = event.currentTarget.getBoundingClientRect();
    const projection = fieldProjection({ width: box.width, height: box.height, view, play, zoom });
    panSession.current = {
      box,
      projection,
      start: pointerToField(event, box, projection),
      centre: centreOf(projection),
    };
    return true;
  }, [zoom, view, play]);

  const panning = useCallback(() => panSession.current !== null, []);

  const movePan = useCallback((event) => {
    /*
     * The projection stays frozen at pan start: recomputing it per move would
     * chase its own centre and feed back into the delta being measured.
     */
    const { box, projection, start, centre } = panSession.current;
    const now = pointerToField(event, box, projection);
    setZoom((current) => (current ? {
      ...current,
      centre: [centre[0] - (now[0] - start[0]), centre[1] - (now[1] - start[1])],
    } : current));
  }, []);

  const endPan = useCallback(() => { panSession.current = null; }, []);
  const resetZoom = useCallback(() => setZoom(null), []);

  /*
   * Pinch to zoom, the touch equivalent of the wheel.
   *
   * A phone in portrait shows the play at about 8.3 px/yd -- the play is 39 yd
   * wide against a 390px screen, and no layout change fixes that without
   * cropping someone off the field. Magnifying on demand adds reach without
   * taking anything away by default.
   *
   * Listeners are attached in the capture phase on the stage so a second finger
   * is seen before React's handlers treat the gesture as a player drag, and the
   * projection is frozen at gesture start for the same reason panning freezes
   * it: recomputing per move would chase its own centre.
   */
  const pointers = useRef(new Map());
  const pinch = useRef(null);
  const pinching = useCallback(() => pinch.current !== null, []);

  useEffect(() => {
    const stage = stageFor();
    if (!stage) return undefined;

    const spread = () => {
      const [a, b] = [...pointers.current.values()];
      return {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        midpoint: { clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 },
      };
    };

    const onDown = (event) => {
      if (event.pointerType !== "touch") return;
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.current.size !== 2) return;

      const box = stage.getBoundingClientRect();
      const projection = fieldProjection({ width: box.width, height: box.height, view, play, zoom });
      const { distance, midpoint } = spread();
      pinch.current = {
        box,
        projection,
        distance,
        factor: zoom?.factor ?? 1,
        centre: centreOf(projection),
        anchor: pointerToField(midpoint, box, projection),
      };
    };

    const onMove = (event) => {
      if (!pointers.current.has(event.pointerId)) return;
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (!pinch.current || pointers.current.size !== 2) return;
      event.preventDefault();

      const { distance, factor, centre, anchor } = pinch.current;
      const next = Math.min(ZOOM_MAX, Math.max(1, factor * (spread().distance / distance)));
      if (next <= 1) {
        setZoom(null);
        return;
      }
      // Hold the field point between the fingers still, exactly as the wheel does.
      const keep = factor / next;
      setZoom({
        factor: next,
        centre: [anchor[0] - (anchor[0] - centre[0]) * keep, anchor[1] - (anchor[1] - centre[1]) * keep],
      });
    };

    const onUp = (event) => {
      pointers.current.delete(event.pointerId);
      if (pointers.current.size < 2) pinch.current = null;
    };

    stage.addEventListener("pointerdown", onDown, true);
    stage.addEventListener("pointermove", onMove, { capture: true, passive: false });
    stage.addEventListener("pointerup", onUp, true);
    stage.addEventListener("pointercancel", onUp, true);
    return () => {
      stage.removeEventListener("pointerdown", onDown, true);
      stage.removeEventListener("pointermove", onMove, true);
      stage.removeEventListener("pointerup", onUp, true);
      stage.removeEventListener("pointercancel", onUp, true);
    };
  }, [stageFor, view, play, zoom]);

  return { zoom, beginPan, panning, movePan, endPan, resetZoom, pinching };
}
