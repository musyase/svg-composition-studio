// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { buildSvg, importSvg } from "./svg";
import type { Asset, Layer } from "./model";

const asset: Asset = {
  id: "shape",
  name: "Фигура",
  viewBox: [0, 0, 100, 100],
  tags: [],
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="color"><stop stop-color="#339999"/></linearGradient></defs><path d="M0 0H100V100Z" fill="url(#color)" stroke="#aa5500"/></svg>',
};

const layers: Layer[] = [
  {
    id: "first",
    assetId: "shape",
    x: 100,
    y: 90,
    width: 80,
    height: 80,
    rotation: 0,
    visible: true,
  },
  {
    id: "second",
    assetId: "shape",
    x: 240,
    y: 90,
    width: 80,
    height: 80,
    rotation: 15,
    visible: true,
  },
];

describe("SVG export", () => {
  it("keeps each source illustration as an editable vector group", () => {
    const output = buildSvg(
      [asset],
      layers,
      { width: 400, height: 200, label: "test" },
      { name: "source", colors: [], background: "#ffffff" },
    );
    const document = new DOMParser().parseFromString(output, "image/svg+xml");
    expect(document.querySelector("parsererror")).toBeNull();
    expect(document.querySelectorAll('g[data-source="Фигура"]')).toHaveLength(
      2,
    );
    expect(document.querySelectorAll("path")).toHaveLength(2);
    expect(document.querySelectorAll("image, foreignObject")).toHaveLength(0);
    expect(document.getElementById("i-first-color")).not.toBeNull();
    expect(document.getElementById("i-second-color")).not.toBeNull();
    expect(
      document.querySelector("#layer-first path")?.getAttribute("fill"),
    ).toBe("url(#i-first-color)");
    expect(
      document.querySelector("#layer-second path")?.getAttribute("fill"),
    ).toBe("url(#i-second-color)");
  });

  it("recolors fills while retaining the original source", () => {
    const output = buildSvg(
      [asset],
      [layers[0]],
      { width: 400, height: 200, label: "test" },
      { name: "custom", colors: ["#123456", "#abcdef"], background: "#eeeeee" },
    );
    expect(output).toContain('stop-color="#123456"');
    expect(output).toContain('stroke="#abcdef"');
    expect(asset.svg).toContain("#339999");
    expect(output).toContain('d="M0 0H100V100Z"');
  });

  it("retains paint inherited from the source SVG root", () => {
    const rooted = {
      ...asset,
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none" stroke="#aa5500"><path d="M0 0H100V100Z"/></svg>',
    };
    const output = buildSvg(
      [rooted],
      [layers[0]],
      { width: 400, height: 200, label: "test" },
      { name: "source", colors: [], background: "#ffffff" },
    );
    const document = new DOMParser().parseFromString(output, "image/svg+xml");
    const paintGroup = document.querySelector("g[data-source] svg g");
    expect(paintGroup?.getAttribute("fill")).toBe("none");
    expect(paintGroup?.getAttribute("stroke")).toBe("#aa5500");
  });
});

function fileWithText(name: string, source: string): File {
  const file = new File([source], name, { type: "image/svg+xml" });
  Object.defineProperty(file, "text", { value: async () => source });
  return file;
}

describe("SVG import", () => {
  it("preserves vector paths and clipping from a source file", async () => {
    const source =
      '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80"><defs><clipPath id="crop"><rect width="120" height="80"/></clipPath></defs><g clip-path="url(#crop)"><path d="M0 0H120V80Z" fill="#123456"/></g></svg>';
    const imported = await importSvg(fileWithText("Книга.svg", source));
    expect(imported.viewBox).toEqual([0, 0, 120, 80]);
    expect(imported.svg).toContain("clipPath");
    expect(imported.svg).toContain('d="M0 0H120V80Z"');
  });

  it("rejects raster elements embedded in an SVG", async () => {
    const source =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><image href="data:image/png;base64,aGVsbG8="/></svg>';
    await expect(importSvg(fileWithText("raster.svg", source))).rejects.toThrow(
      "растровый",
    );
  });
});
