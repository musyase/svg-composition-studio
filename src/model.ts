export type Asset = {
  id: string;
  name: string;
  svg: string;
  viewBox: [number, number, number, number];
  tags: string[];
};

export type Layer = {
  id: string;
  assetId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  visible: boolean;
};

export type CanvasSize = { width: number; height: number; label: string };

export type Palette = {
  name: string;
  colors: string[];
  background: string;
};

export const canvasSizes: CanvasSize[] = [
  { width: 1200, height: 630, label: "Обложка · 1200 × 630" },
  { width: 1080, height: 1080, label: "Квадрат · 1080 × 1080" },
  { width: 1080, height: 1350, label: "Портрет · 1080 × 1350" },
];

export const defaultPalette: Palette = {
  name: "Исходные цвета",
  colors: [],
  background: "#ffffff",
};
