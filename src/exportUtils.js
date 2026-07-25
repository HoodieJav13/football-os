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

function cloneSvgWithInlineStyles(svg) {
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
  clone.setAttribute("width", "1600");
  clone.setAttribute("height", "1088");
  const background = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  background.setAttribute("x", "0");
  background.setAttribute("y", "0");
  background.setAttribute("width", "1000");
  background.setAttribute("height", "680");
  background.setAttribute("fill", "#063b2d");
  clone.insertBefore(background, clone.firstChild);
  return clone;
}

export async function svgToPngBlob(svg) {
  if (!svg) throw new Error("The play canvas is not available.");
  const clone = cloneSvgWithInlineStyles(svg);
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
    canvas.width = 1600;
    canvas.height = 1088;
    const context = canvas.getContext("2d");
    context.fillStyle = "#063b2d";
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
