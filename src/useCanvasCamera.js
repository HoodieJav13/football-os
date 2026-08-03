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

  return { zoom, beginPan, panning, movePan, endPan, resetZoom };
}
