import DOMPurify from "dompurify";
import type { Asset, CanvasSize, Layer, Palette } from "./model";

const NS = "http://www.w3.org/2000/svg";
const unsafeTags = [
  "script",
  "foreignObject",
  "image",
  "iframe",
  "object",
  "embed",
  "a",
  "animate",
  "animateTransform",
  "set",
];
const rootPaintAttributes = [
  "fill",
  "stroke",
  "color",
  "opacity",
  "style",
  "fill-rule",
  "clip-rule",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "clip-path",
  "mask",
  "filter",
];

function parseSvg(source: string): SVGSVGElement {
  const document = new DOMParser().parseFromString(source, "image/svg+xml");
  if (
    document.querySelector("parsererror") ||
    document.documentElement.localName !== "svg"
  ) {
    throw new Error("Файл не содержит корректный SVG.");
  }
  return document.documentElement as unknown as SVGSVGElement;
}

function dimensions(svg: SVGSVGElement): [number, number, number, number] {
  const viewBox = svg
    .getAttribute("viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (
    viewBox?.length === 4 &&
    viewBox.every(Number.isFinite) &&
    viewBox[2] > 0 &&
    viewBox[3] > 0
  ) {
    return viewBox as [number, number, number, number];
  }
  const width = Number.parseFloat(svg.getAttribute("width") || "");
  const height = Number.parseFloat(svg.getAttribute("height") || "");
  if (width > 0 && height > 0) return [0, 0, width, height];
  throw new Error("У SVG нет viewBox или числовых width и height.");
}

export async function importSvg(file: File): Promise<Asset> {
  if (file.size > 3_000_000)
    throw new Error(`${file.name}: размер больше 3 МБ.`);
  const raw = await file.text();
  if (!/<svg[\s>]/i.test(raw))
    throw new Error(`${file.name}: это не SVG-файл.`);
  if (/<(?:image|foreignObject|script|iframe|object|embed)\b/i.test(raw)) {
    throw new Error(
      `${file.name}: файл содержит растровый или исполняемый элемент.`,
    );
  }
  const clean = DOMPurify.sanitize(raw, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: unsafeTags,
  });
  const svg = parseSvg(clean);
  if (svg.querySelector("image, foreignObject, script"))
    throw new Error(
      `${file.name}: найдены не-векторные или небезопасные элементы.`,
    );
  for (const element of [svg, ...svg.querySelectorAll("*")]) {
    for (const attr of ["href", "xlink:href"]) {
      const value = element.getAttribute(attr);
      if (value && !value.startsWith("#")) element.removeAttribute(attr);
    }
    for (const attribute of Array.from(element.attributes)) {
      if (/url\(\s*['"]?(?!#)/i.test(attribute.value))
        element.removeAttribute(attribute.name);
    }
  }
  const viewBox = dimensions(svg);
  svg.setAttribute("viewBox", viewBox.join(" "));
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  const name = file.name
    .replace(/\.svg$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
  return {
    id: crypto.randomUUID(),
    name: name || "Без названия",
    svg: new XMLSerializer().serializeToString(svg),
    viewBox,
    tags: [],
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeHex(value: string): string {
  if (value.length === 4)
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`.toLowerCase();
  return value.toLowerCase();
}

function recolor(svg: SVGSVGElement, palette: Palette): void {
  if (!palette.colors.length) return;
  const colorMap = new Map<string, string>();
  const replace = (value: string): string =>
    value.replace(/#[0-9a-fA-F]{3,8}\b/g, (color) => {
      const normalized = normalizeHex(color);
      if (normalized === "#000000" || normalized === "#ffffff") return color;
      if (!colorMap.has(normalized))
        colorMap.set(
          normalized,
          palette.colors[colorMap.size % palette.colors.length],
        );
      return colorMap.get(normalized)!;
    });
  for (const element of [svg, ...svg.querySelectorAll("*")]) {
    for (const attr of ["fill", "stroke", "stop-color", "flood-color"]) {
      const value = element.getAttribute(attr);
      if (value) element.setAttribute(attr, replace(value));
    }
    const style = element.getAttribute("style");
    if (style)
      element.setAttribute(
        "style",
        style.replace(
          /((?:fill|stroke|stop-color|flood-color)\s*:\s*)(#[0-9a-fA-F]{3,8}\b)/gi,
          (_, key: string, color: string) => key + replace(color),
        ),
      );
  }
  svg.querySelectorAll("style").forEach((style) => {
    style.textContent = (style.textContent || "").replace(
      /((?:fill|stroke|stop-color|flood-color)\s*:\s*)(#[0-9a-fA-F]{3,8}\b)/gi,
      (_, key: string, color: string) => key + replace(color),
    );
  });
}

export function assetMarkup(
  asset: Asset,
  instanceId: string,
  palette: Palette,
): string {
  const svg = parseSvg(asset.svg);
  recolor(svg, palette);
  const ids = new Map<string, string>();
  const elementsWithIds = [svg, ...svg.querySelectorAll("[id]")];
  elementsWithIds.forEach((element) => {
    if (!element.id) return;
    const original = element.id;
    const next = `${instanceId}-${original}`;
    ids.set(original, next);
    element.id = next;
  });
  for (const element of [svg, ...svg.querySelectorAll("*")]) {
    for (const attr of Array.from(element.attributes)) {
      let value = attr.value;
      for (const [original, next] of ids) {
        value = value.replace(
          new RegExp(`url\\(#${escapeRegExp(original)}\\)`, "g"),
          `url(#${next})`,
        );
        if (
          (attr.name === "href" || attr.name === "xlink:href") &&
          value === `#${original}`
        )
          value = `#${next}`;
      }
      if (value !== attr.value) element.setAttribute(attr.name, value);
    }
  }
  svg.querySelectorAll("style").forEach((style) => {
    let css = style.textContent || "";
    for (const [original, next] of ids)
      css = css.replace(
        new RegExp(`#${escapeRegExp(original)}(?![\\w-])`, "g"),
        `#${next}`,
      );
    style.textContent = css;
  });
  const wrapper = svg.ownerDocument.createElementNS(NS, "g");
  for (const name of rootPaintAttributes) {
    const value = svg.getAttribute(name);
    if (value) wrapper.setAttribute(name, value);
  }
  for (const child of Array.from(svg.childNodes)) wrapper.appendChild(child);
  return new XMLSerializer().serializeToString(wrapper);
}

export function buildSvg(
  assets: Asset[],
  layers: Layer[],
  size: CanvasSize,
  palette: Palette,
): string {
  const document = window.document.implementation.createDocument(
    NS,
    "svg",
    null,
  );
  const root = document.documentElement;
  root.setAttribute("viewBox", `0 0 ${size.width} ${size.height}`);
  root.setAttribute("width", String(size.width));
  root.setAttribute("height", String(size.height));
  const background = document.createElementNS(NS, "rect");
  background.setAttribute("width", String(size.width));
  background.setAttribute("height", String(size.height));
  background.setAttribute("fill", palette.background);
  background.setAttribute("data-role", "background");
  root.appendChild(background);
  for (const layer of layers) {
    if (!layer.visible) continue;
    const asset = assets.find((item) => item.id === layer.assetId);
    if (!asset) continue;
    const group = document.createElementNS(NS, "g");
    group.setAttribute("id", `layer-${layer.id}`);
    group.setAttribute("data-source", asset.name);
    group.setAttribute(
      "transform",
      `translate(${layer.x} ${layer.y}) rotate(${layer.rotation})`,
    );
    const nested = document.createElementNS(NS, "svg");
    nested.setAttribute("x", String(-layer.width / 2));
    nested.setAttribute("y", String(-layer.height / 2));
    nested.setAttribute("width", String(layer.width));
    nested.setAttribute("height", String(layer.height));
    nested.setAttribute("viewBox", asset.viewBox.join(" "));
    nested.setAttribute("preserveAspectRatio", "xMidYMid meet");
    const parsed = parseSvg(
      `<svg xmlns="${NS}">${assetMarkup(asset, `i-${layer.id}`, palette)}</svg>`,
    );
    for (const child of Array.from(parsed.childNodes))
      nested.appendChild(document.importNode(child, true));
    group.appendChild(nested);
    root.appendChild(group);
  }
  return new XMLSerializer().serializeToString(document);
}

export function downloadSvg(svg: string, name = "composition.svg"): void {
  const url = URL.createObjectURL(
    new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
