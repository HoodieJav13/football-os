import { ArrowsOut, CornersOut } from "@phosphor-icons/react";

/** End Zone / Sideline camera switch, shared by the header and the layer bar. */
export function SegmentedControl({ value, onChange }) {
  return (
    <div className="segmented" role="group" aria-label="Field view">
      <button className={value === "end" ? "active" : ""} aria-pressed={value === "end"} onClick={() => onChange("end")}><CornersOut size={18} />End Zone</button>
      <button className={value === "side" ? "active" : ""} aria-pressed={value === "side"} onClick={() => onChange("side")}><ArrowsOut size={18} />Sideline</button>
    </div>
  );
}
