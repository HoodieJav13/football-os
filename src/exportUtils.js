import { createWorkspaceBackup } from "./workspaceData";

const SVG_STYLE_PROPERTIES = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-opacity",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "text-anchor",
];

export function safeFilename(value, fallback = "football-os") {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return normalized || fallback;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadWorkspaceBackup(workspace) {
  const backup = createWorkspaceBackup(workspace);
  const date = backup.exportedAt.slice(0, 10);
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  downloadBlob(blob, `football-os-backup-${date}.footballos`);
}

const EXPORT_PIXELS_PER_YARD = 26;
const FIELD_BACKGROUND = "#12352c";

/**
 * The viewBox is derived from the live canvas rather than assumed, because it
 * now depends on the viewport aspect. Reading it back keeps the export framed
 * exactly like what the coach is looking at.
 */
function readViewBox(svg) {
  const [minX, minY, width, height] = (svg.getAttribute("viewBox") ?? "0 0 100 100")
    .split(/[\s,]+/)
    .map(Number);
  return { minX, minY, width, height };
}

function cloneSvgWithInlineStyles(svg, viewBox, size) {
  const clone = svg.cloneNode(true);
  const originalElements = [svg, ...svg.querySelectorAll("*")];
  const cloneElements = [clone, ...clone.querySelectorAll("*")];

  originalElements.forEach((element, index) => {
    const target = cloneElements[index];
    if (!target) return;
    const computed = window.getComputedStyle(element);
    SVG_STYLE_PROPERTIES.forEach((property) => {
      const value = computed.getPropertyValue(property);
      if (value) target.style.setProperty(property, value);
    });
  });

  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(size.width));
  clone.setAttribute("height", String(size.height));

  const background = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  background.setAttribute("x", String(viewBox.minX));
  background.setAttribute("y", String(viewBox.minY));
  background.setAttribute("width", String(viewBox.width));
  background.setAttribute("height", String(viewBox.height));
  background.setAttribute("fill", FIELD_BACKGROUND);
  clone.insertBefore(background, clone.firstChild);
  return clone;
}

export async function svgToPngBlob(svg) {
  if (!svg) throw new Error("The play canvas is not available.");
  const viewBox = readViewBox(svg);
  // Yard-true output: one scale for both axes, so the PNG is not stretched either.
  const size = {
    width: Math.round(viewBox.width * EXPORT_PIXELS_PER_YARD),
    height: Math.round(viewBox.height * EXPORT_PIXELS_PER_YARD),
  };
  const clone = cloneSvgWithInlineStyles(svg, viewBox, size);
  const markup = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([markup], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("The play image could not be rendered."));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    context.fillStyle = FIELD_BACKGROUND;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The PNG export could not be created.")), "image/png");
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function downloadPlayPng(svg, playName) {
  const blob = await svgToPngBlob(svg);
  downloadBlob(blob, `${safeFilename(playName, "play")}.png`);
}
