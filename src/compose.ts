import type { Asset, CanvasSize, Layer } from "./model";

const related: Record<string, string[]> = {
  идея: ["лампа", "мысль", "свет", "блокнот"],
  обучение: ["книга", "блокнот", "ручка", "пазл"],
  работа: ["блокнот", "телефон", "книга"],
  деньги: ["кошелек", "монета", "телефон"],
  музыка: ["наушники", "телефон"],
  связь: ["телефон", "наушники"],
  рост: ["растение", "цветок", "лампа"],
  творчество: ["лампа", "карандаш", "ручка", "пазл"],
  проект: ["пазл", "блокнот", "лампа"],
  план: ["блокнот", "ручка", "книга"],
};

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 2);
}

function stem(word: string): string {
  return word.replace(
    /(иями|ями|ами|ого|ему|ыми|ими|ать|ить|ция|ции|ами|ов|ев|ой|ый|ая|ое|ие|их|ы|и|а|я|е|у)$/u,
    "",
  );
}

function sameRoot(left: string, right: string): boolean {
  const a = stem(left);
  const b = stem(right);
  return (
    a === b ||
    (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a)))
  );
}

export type Scenario = "metaphor" | "objects";

export function suggestAssets(
  query: string,
  assets: Asset[],
  count = 4,
  scenario: Scenario = "metaphor",
): Asset[] {
  const queryWords = words(query);
  const expanded = new Set(queryWords.map(stem));
  if (scenario === "metaphor") {
    for (const [term, synonyms] of Object.entries(related)) {
      if (queryWords.some((word) => sameRoot(word, term)))
        synonyms.forEach((word) => expanded.add(stem(word)));
    }
  }
  const requestsBackground =
    queryWords.includes("фон") || queryWords.includes("background");
  const ranked = assets
    .map((asset, index) => {
      const haystack = words([asset.name, ...asset.tags].join(" ")).map(stem);
      const backgroundVariant = /\s+(фон|background)$/iu.test(asset.name);
      const baseName = asset.name
        .toLowerCase()
        .replace(/\s+(фон|background)$/iu, "");
      const score = haystack.reduce(
        (total, word) =>
          total +
          (expanded.has(word)
            ? 3
            : queryWords.some((queryWord) => sameRoot(queryWord, word))
              ? 1
              : 0),
        0,
      );
      return { asset, score, index, baseName, backgroundVariant };
    })
    .filter((item) => item.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(a.backgroundVariant) - Number(b.backgroundVariant) ||
        a.index - b.index,
    );
  const seen = new Set<string>();
  return ranked
    .filter((item) => {
      if (!requestsBackground && seen.has(item.baseName)) return false;
      seen.add(item.baseName);
      return true;
    })
    .slice(0, count)
    .map((item) => item.asset);
}

function fittedSize(
  asset: Asset,
  maxWidth: number,
  maxHeight: number,
): [number, number] {
  const ratio = asset.viewBox[2] / asset.viewBox[3];
  let width = maxWidth;
  let height = width / ratio;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * ratio;
  }
  return [Math.round(width), Math.round(height)];
}

export function newLayer(
  asset: Asset,
  size: CanvasSize,
  at?: { x: number; y: number },
): Layer {
  const [width, height] = fittedSize(
    asset,
    size.width * 0.36,
    size.height * 0.56,
  );
  return {
    id: crypto.randomUUID(),
    assetId: asset.id,
    x: at?.x ?? size.width / 2,
    y: at?.y ?? size.height / 2,
    width,
    height,
    rotation: 0,
    visible: true,
  };
}

export type Layout = "cluster" | "offset" | "headline";

export function compose(
  assets: Asset[],
  size: CanvasSize,
  layout: Layout,
): Layer[] {
  if (!assets.length) return [];
  const horizontal = size.width >= size.height;
  const centerX =
    size.width * (layout === "headline" && horizontal ? 0.69 : 0.5);
  const centerY =
    size.height * (layout === "headline" && !horizontal ? 0.64 : 0.52);
  const slots = horizontal
    ? [
        [centerX, centerY, 0.47, 0.72, -5],
        [
          centerX - size.width * 0.24,
          centerY + size.height * 0.24,
          0.22,
          0.33,
          -13,
        ],
        [
          centerX + size.width * 0.26,
          centerY - size.height * 0.25,
          0.22,
          0.3,
          10,
        ],
        [
          centerX + size.width * 0.28,
          centerY + size.height * 0.23,
          0.18,
          0.26,
          15,
        ],
        [
          centerX - size.width * 0.16,
          centerY - size.height * 0.31,
          0.16,
          0.25,
          8,
        ],
      ]
    : [
        [centerX, centerY, 0.58, 0.42, -5],
        [
          centerX - size.width * 0.28,
          centerY + size.height * 0.23,
          0.25,
          0.19,
          -13,
        ],
        [
          centerX + size.width * 0.28,
          centerY - size.height * 0.22,
          0.25,
          0.18,
          10,
        ],
        [
          centerX + size.width * 0.29,
          centerY + size.height * 0.22,
          0.21,
          0.17,
          15,
        ],
        [
          centerX - size.width * 0.19,
          centerY - size.height * 0.24,
          0.21,
          0.16,
          8,
        ],
      ];
  return assets
    .slice(0, slots.length)
    .map((asset, index) => {
      const [sx, sy, sw, sh, angle] = slots[index];
      const [width, height] = fittedSize(
        asset,
        size.width * sw,
        size.height * sh,
      );
      const shift =
        layout === "offset" ? (index % 2 ? 0.055 : -0.035) * size.width : 0;
      return {
        id: crypto.randomUUID(),
        assetId: asset.id,
        x: Math.round(
          Math.max(width / 2, Math.min(size.width - width / 2, sx + shift)),
        ),
        y: Math.round(
          Math.max(height / 2, Math.min(size.height - height / 2, sy)),
        ),
        width,
        height,
        rotation: layout === "cluster" ? angle : 0,
        visible: true,
      };
    })
    .reverse();
}
