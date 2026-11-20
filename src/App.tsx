import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from "react";
import { compose, newLayer, suggestAssets } from "./compose";
import type { Layout, Scenario } from "./compose";
import { canvasSizes, defaultPalette } from "./model";
import type { Asset, CanvasSize, Layer, Palette } from "./model";
import { loadState, saveState } from "./storage";
import { assetMarkup, buildSvg, downloadSvg, importSvg } from "./svg";
import "./App.css";

const palettes: Palette[] = [
  defaultPalette,
  {
    name: "Сирень",
    colors: ["#4c3a87", "#8f7bc8", "#c7b9e9", "#efdcff", "#f9c884"],
    background: "#f0eaff",
  },
  {
    name: "Абрикос",
    colors: ["#202327", "#ea9c61", "#f9cba2", "#ffe8cb", "#be9ae3"],
    background: "#fff0df",
  },
  {
    name: "Бирюза",
    colors: ["#162d38", "#36a8a8", "#83d5d4", "#d8f0ed", "#e4b1dc"],
    background: "#e4f5f3",
  },
];
const initialSize = canvasSizes[0];

function App() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [size, setSize] = useState<CanvasSize>(initialSize);
  const [palette, setPalette] = useState<Palette>(defaultPalette);
  const [title, setTitle] = useState("Новая композиция");
  const [prompt, setPrompt] = useState("");
  const [scenario, setScenario] = useState<Scenario>("metaphor");
  const [layout, setLayout] = useState<Layout>("cluster");
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<"compose" | "layers" | "colors">("compose");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const assetInput = useRef<HTMLInputElement>(null);
  const paletteInput = useRef<HTMLInputElement>(null);
  const stage = useRef<SVGSVGElement>(null);
  const drag = useRef<{
    id: string;
    sx: number;
    sy: number;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    loadState()
      .then((saved) => {
        if (saved) {
          setAssets(saved.assets);
          setLayers(saved.layers);
          setSize(saved.size);
          setPalette(saved.palette);
          setTitle(saved.title);
        }
      })
      .catch(() => setError("Не удалось открыть локально сохранённый проект."))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      saveState({ assets, layers, size, palette, title }).catch(() =>
        setError("Не удалось сохранить проект в браузере."),
      );
    }, 400);
    return () => clearTimeout(timer);
  }, [assets, layers, size, palette, title, ready]);

  const activeLayer = layers.find((layer) => layer.id === selected);
  const activeAsset = assets.find((asset) => asset.id === activeLayer?.assetId);

  function update(id: string, patch: Partial<Layer>) {
    setLayers((current) =>
      current.map((layer) =>
        layer.id === id ? { ...layer, ...patch } : layer,
      ),
    );
  }

  const duplicate = useCallback(
    (id: string) => {
      const source = layers.find((layer) => layer.id === id);
      if (!source) return;
      const copy = {
        ...source,
        id: crypto.randomUUID(),
        x: source.x + 24,
        y: source.y + 24,
      };
      setLayers((current) => [...current, copy]);
      setSelected(copy.id);
    },
    [layers],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        !selected ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      )
        return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        setLayers((current) =>
          current.filter((layer) => layer.id !== selected),
        );
        setSelected(null);
      } else if (event.key.startsWith("Arrow")) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        update(selected, {
          x:
            (layers.find((layer) => layer.id === selected)?.x ?? 0) +
            (event.key === "ArrowRight"
              ? step
              : event.key === "ArrowLeft"
                ? -step
                : 0),
          y:
            (layers.find((layer) => layer.id === selected)?.y ?? 0) +
            (event.key === "ArrowDown"
              ? step
              : event.key === "ArrowUp"
                ? -step
                : 0),
        });
      } else if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "d"
      ) {
        event.preventDefault();
        duplicate(selected);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, layers, duplicate]);

  async function addFiles(files: FileList | File[]) {
    const items: Asset[] = [];
    const failures: string[] = [];
    for (const file of Array.from(files)) {
      if (!file.name.toLowerCase().endsWith(".svg")) continue;
      try {
        items.push(await importSvg(file));
      } catch (cause) {
        failures.push(
          cause instanceof Error
            ? cause.message
            : `${file.name}: ошибка чтения.`,
        );
      }
    }
    if (items.length) {
      setAssets((current) => [...current, ...items]);
      setNotice(`Загружено SVG-объектов: ${items.length}`);
    }
    setError(
      failures.join(" ") || (!items.length ? "Выберите SVG-файлы." : ""),
    );
  }

  function add(asset: Asset) {
    const layer = newLayer(asset, size);
    setLayers((current) => [...current, layer]);
    setSelected(layer.id);
    setTab("layers");
  }

  function assemble() {
    if (!assets.length) {
      setError("Сначала загрузите SVG-объекты.");
      return;
    }
    if (!prompt.trim()) {
      setError("Напишите идею или названия объектов.");
      return;
    }
    const chosen = suggestAssets(prompt, assets, 5, scenario);
    if (!chosen.length) {
      setError(
        "Подходящих объектов не нашлось. Уточните запрос или добавьте метки в библиотеке.",
      );
      return;
    }
    const next = compose(chosen, size, layout);
    setLayers(next);
    setSelected(next.at(-1)?.id ?? null);
    setTab("layers");
    setError("");
    setNotice("Композиция собрана. Проверьте выбор и расположение объектов.");
  }

  function move(id: string, direction: -1 | 1) {
    setLayers((current) => {
      const index = current.findIndex((layer) => layer.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function point(event: ReactPointerEvent) {
    const matrix = stage.current?.getScreenCTM();
    return matrix
      ? new DOMPoint(event.clientX, event.clientY).matrixTransform(
          matrix.inverse(),
        )
      : null;
  }

  function startDrag(event: ReactPointerEvent<SVGGElement>, layer: Layer) {
    if (event.button !== 0) return;
    const at = point(event);
    if (!at) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: layer.id, sx: at.x, sy: at.y, x: layer.x, y: layer.y };
    setSelected(layer.id);
  }

  function continueDrag(event: ReactPointerEvent<SVGGElement>) {
    if (!drag.current) return;
    const at = point(event);
    if (!at) return;
    const { id, sx, sy, x, y } = drag.current;
    update(id, { x: Math.round(x + at.x - sx), y: Math.round(y + at.y - sy) });
  }

  async function addPalette(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const colors = [
      ...new Set(
        ((await file.text()).match(/#[0-9a-fA-F]{6}\b/g) || []).map((color) =>
          color.toLowerCase(),
        ),
      ),
    ];
    if (!colors.length) {
      setError("В файле не найдены цвета вида #RRGGBB.");
      return;
    }
    setPalette({
      name: file.name.replace(/\.[^.]+$/, ""),
      colors,
      background: colors[0],
    });
    setError("");
    setNotice(`Палитра «${file.name}» загружена`);
    event.target.value = "";
  }

  function exportFile() {
    if (!layers.length) {
      setError("Для экспорта добавьте хотя бы один объект.");
      return;
    }
    try {
      const filename =
        title
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, "-")
          .replace(/^-|-$/g, "") || "composition";
      downloadSvg(buildSvg(assets, layers, size, palette), `${filename}.svg`);
      setError("");
      setNotice("SVG скачан. Объекты остались отдельными векторными группами.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Не удалось собрать SVG.",
      );
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">▧</span>
          <strong>Композиция</strong>
          <span>SVG studio</span>
        </div>
        <div className="project-title">
          <label htmlFor="project-title">Проект</label>
          <input
            id="project-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="top-actions">
          <span>Сохраняется в браузере</span>
          <button className="button primary" onClick={exportFile}>
            Скачать SVG ↗
          </button>
        </div>
      </header>
      <div className="workspace">
        <aside className="library-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">01 / Библиотека</span>
              <h2>Объекты</h2>
            </div>
            <span className="count">{assets.length}</span>
          </div>
          <p className="panel-intro">
            Загрузите исходные SVG. Каждый файл станет отдельным объектом
            композиции.
          </p>
          <input
            ref={assetInput}
            type="file"
            accept=".svg,image/svg+xml"
            multiple
            hidden
            onChange={(event) => {
              if (event.target.files) void addFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <button
            className="button outline wide"
            onClick={() => assetInput.current?.click()}
          >
            + Загрузить SVG
          </button>
          <div
            className="asset-list"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void addFiles(event.dataTransfer.files);
            }}
          >
            {assets.length ? (
              assets.map((asset, index) => (
                <div className="asset-row" key={asset.id}>
                  <div className="asset-thumb">
                    <svg
                      viewBox={asset.viewBox.join(" ")}
                      dangerouslySetInnerHTML={{
                        __html: assetMarkup(
                          asset,
                          `thumb-${asset.id}`,
                          defaultPalette,
                        ),
                      }}
                    />
                  </div>
                  <div className="asset-details">
                    <input
                      aria-label={`Название объекта ${index + 1}`}
                      title="Можно изменить название для поиска"
                      value={asset.name}
                      onChange={(event) =>
                        setAssets((current) =>
                          current.map((item) =>
                            item.id === asset.id
                              ? { ...item, name: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                    <input
                      className="asset-tags"
                      aria-label={`Метки объекта ${index + 1}`}
                      title="Метки через запятую"
                      placeholder="Метки через запятую"
                      value={asset.tags.join(", ")}
                      onChange={(event) =>
                        setAssets((current) =>
                          current.map((item) =>
                            item.id === asset.id
                              ? {
                                  ...item,
                                  tags: event.target.value
                                    .split(",")
                                    .map((tag) => tag.trim()),
                                }
                              : item,
                          ),
                        )
                      }
                    />
                  </div>
                  <button
                    className="icon-button add-button"
                    aria-label={`Добавить ${asset.name}`}
                    title={`Добавить ${asset.name}`}
                    onClick={() => add(asset)}
                  >
                    +
                  </button>
                </div>
              ))
            ) : (
              <div className="library-empty">
                <span>{"<svg>"}</span>
                <strong>Здесь появятся объекты</strong>
                <p>Выберите несколько файлов или перетащите их сюда.</p>
              </div>
            )}
          </div>
          <div className="library-foot">
            Исходные векторы не заменяются растровыми изображениями.
          </div>
        </aside>

        <main className="canvas-panel">
          <div className="canvas-toolbar">
            <div>
              <span className="eyebrow">02 / Холст</span>
              <h1>Сборка композиции</h1>
            </div>
            <div className="canvas-size">
              <label htmlFor="canvas-size">Формат</label>
              <select
                id="canvas-size"
                value={`${size.width}x${size.height}`}
                onChange={(event) =>
                  setSize(
                    canvasSizes.find(
                      (item) =>
                        `${item.width}x${item.height}` === event.target.value,
                    ) || initialSize,
                  )
                }
              >
                {canvasSizes.map((item) => (
                  <option
                    key={item.label}
                    value={`${item.width}x${item.height}`}
                  >
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="canvas-scroll">
            <div
              className="canvas-frame"
              style={{ aspectRatio: `${size.width} / ${size.height}` }}
            >
              <svg
                ref={stage}
                className="stage"
                viewBox={`0 0 ${size.width} ${size.height}`}
                role="img"
                aria-label="Редактор композиции"
                onPointerDown={() => setSelected(null)}
              >
                <rect
                  width={size.width}
                  height={size.height}
                  fill={palette.background}
                />
                {layers.map((layer) => {
                  if (!layer.visible) return null;
                  const asset = assets.find(
                    (item) => item.id === layer.assetId,
                  );
                  if (!asset) return null;
                  return (
                    <g
                      key={layer.id}
                      transform={`translate(${layer.x} ${layer.y}) rotate(${layer.rotation})`}
                      onPointerDown={(event) => startDrag(event, layer)}
                      onPointerMove={continueDrag}
                      onPointerUp={() => {
                        drag.current = null;
                      }}
                      onPointerCancel={() => {
                        drag.current = null;
                      }}
                      style={{ cursor: "grab" }}
                    >
                      <svg
                        x={-layer.width / 2}
                        y={-layer.height / 2}
                        width={layer.width}
                        height={layer.height}
                        viewBox={asset.viewBox.join(" ")}
                        preserveAspectRatio="xMidYMid meet"
                        dangerouslySetInnerHTML={{
                          __html: assetMarkup(
                            asset,
                            `preview-${layer.id}`,
                            palette,
                          ),
                        }}
                      />
                      <rect
                        x={-layer.width / 2}
                        y={-layer.height / 2}
                        width={layer.width}
                        height={layer.height}
                        fill="transparent"
                      />
                      {selected === layer.id && (
                        <rect
                          className="selection-outline"
                          x={-layer.width / 2}
                          y={-layer.height / 2}
                          width={layer.width}
                          height={layer.height}
                          fill="none"
                          pointerEvents="none"
                        />
                      )}
                    </g>
                  );
                })}
              </svg>
              {!layers.length && (
                <div className="canvas-empty">
                  <span>□</span>
                  <strong>Холст пока пуст</strong>
                  <small>
                    Добавьте SVG слева или соберите композицию по запросу.
                  </small>
                </div>
              )}
            </div>
          </div>
          <div className="canvas-footer">
            <span>
              {size.width} × {size.height} px
            </span>
            <span>{layers.length} слоёв · SVG</span>
            <span>Перетаскивайте объекты мышью</span>
          </div>
        </main>

        <aside className="inspector-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">03 / Инструменты</span>
              <h2>Настройки</h2>
            </div>
          </div>
          <div className="tabs" role="tablist" aria-label="Настройки">
            <button
              role="tab"
              aria-selected={tab === "compose"}
              className={tab === "compose" ? "active" : ""}
              onClick={() => setTab("compose")}
            >
              Сборка
            </button>
            <button
              role="tab"
              aria-selected={tab === "layers"}
              className={tab === "layers" ? "active" : ""}
              onClick={() => setTab("layers")}
            >
              Слои
            </button>
            <button
              role="tab"
              aria-selected={tab === "colors"}
              className={tab === "colors" ? "active" : ""}
              onClick={() => setTab("colors")}
            >
              Цвета
            </button>
          </div>
          {tab === "compose" && (
            <div className="inspector-content">
              <fieldset className="layout-field">
                <legend>Как подобрать объекты</legend>
                <label>
                  <input
                    type="radio"
                    name="scenario"
                    checked={scenario === "metaphor"}
                    onChange={() => setScenario("metaphor")}
                  />{" "}
                  По идее или заголовку
                </label>
                <label>
                  <input
                    type="radio"
                    name="scenario"
                    checked={scenario === "objects"}
                    onChange={() => setScenario("objects")}
                  />{" "}
                  По списку объектов
                </label>
              </fieldset>
              <div className="field">
                <label htmlFor="prompt">
                  {scenario === "metaphor"
                    ? "Идея композиции"
                    : "Какие объекты нужны"}
                </label>
                <textarea
                  id="prompt"
                  rows={4}
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder={
                    scenario === "metaphor"
                      ? "Например: идея для нового проекта"
                      : "Например: книга, лампа, карандаш"
                  }
                />
                <small>
                  Поиск использует названия и метки объектов. Результат можно
                  поправить вручную.
                </small>
              </div>
              <fieldset className="layout-field">
                <legend>Расположение</legend>
                <label>
                  <input
                    type="radio"
                    name="layout"
                    checked={layout === "cluster"}
                    onChange={() => setLayout("cluster")}
                  />{" "}
                  Собранно
                </label>
                <label>
                  <input
                    type="radio"
                    name="layout"
                    checked={layout === "offset"}
                    onChange={() => setLayout("offset")}
                  />{" "}
                  Со смещением
                </label>
                <label>
                  <input
                    type="radio"
                    name="layout"
                    checked={layout === "headline"}
                    onChange={() => setLayout("headline")}
                  />{" "}
                  Место под заголовок
                </label>
              </fieldset>
              <button className="button primary wide" onClick={assemble}>
                Собрать композицию
              </button>
              <p className="help-text">
                Повторная сборка заменит слои на холсте. Библиотека сохранится.
              </p>
            </div>
          )}
          {tab === "layers" && (
            <div className="inspector-content">
              <div className="section-label">
                На холсте <span>{layers.length}</span>
              </div>
              <div className="layer-list">
                {layers.length ? (
                  [...layers].reverse().map((layer) => (
                    <div
                      key={layer.id}
                      className={`layer-row ${selected === layer.id ? "selected" : ""}`}
                    >
                      <button
                        className="layer-select"
                        onClick={() => setSelected(layer.id)}
                      >
                        <span>◇</span>
                        {assets.find((asset) => asset.id === layer.assetId)
                          ?.name || "Объект"}
                      </button>
                      <button
                        className="icon-button"
                        title={layer.visible ? "Скрыть" : "Показать"}
                        onClick={() =>
                          update(layer.id, { visible: !layer.visible })
                        }
                      >
                        {layer.visible ? "◉" : "○"}
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="empty-copy">
                    Слои появятся после добавления объектов.
                  </p>
                )}
              </div>
              {activeLayer && activeAsset && (
                <div className="properties">
                  <div className="section-label">
                    Выбран: {activeAsset.name}
                  </div>
                  <div className="property-grid">
                    <label>
                      X
                      <input
                        type="number"
                        value={Math.round(activeLayer.x)}
                        onChange={(event) =>
                          update(activeLayer.id, {
                            x: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Y
                      <input
                        type="number"
                        value={Math.round(activeLayer.y)}
                        onChange={(event) =>
                          update(activeLayer.id, {
                            y: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Ширина
                      <input
                        type="number"
                        min="10"
                        value={Math.round(activeLayer.width)}
                        onChange={(event) => {
                          const width = Math.max(
                            10,
                            Number(event.target.value),
                          );
                          update(activeLayer.id, {
                            width,
                            height: Math.round(
                              (width * activeAsset.viewBox[3]) /
                                activeAsset.viewBox[2],
                            ),
                          });
                        }}
                      />
                    </label>
                    <label>
                      Поворот
                      <input
                        type="number"
                        value={activeLayer.rotation}
                        onChange={(event) =>
                          update(activeLayer.id, {
                            rotation: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                  <div className="layer-actions">
                    <button onClick={() => move(activeLayer.id, 1)}>
                      Выше
                    </button>
                    <button onClick={() => move(activeLayer.id, -1)}>
                      Ниже
                    </button>
                    <button onClick={() => duplicate(activeLayer.id)}>
                      Дублировать
                    </button>
                    <button
                      onClick={() => {
                        setLayers((current) =>
                          current.filter(
                            (layer) => layer.id !== activeLayer.id,
                          ),
                        );
                        setSelected(null);
                      }}
                    >
                      Удалить
                    </button>
                  </div>
                  <p className="help-text">
                    Стрелки сдвигают на 1 px, с Shift — на 10 px. Ctrl+D
                    дублирует.
                  </p>
                </div>
              )}
            </div>
          )}
          {tab === "colors" && (
            <div className="inspector-content">
              <div className="field">
                <label htmlFor="palette-preset">Цветовая схема</label>
                <select
                  id="palette-preset"
                  value={
                    palettes.some((item) => item.name === palette.name)
                      ? palette.name
                      : "custom"
                  }
                  onChange={(event) => {
                    const next = palettes.find(
                      (item) => item.name === event.target.value,
                    );
                    if (next) setPalette(next);
                  }}
                >
                  <option value="custom" disabled>
                    Загруженная палитра
                  </option>
                  {palettes.map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="background">Фон холста</label>
                <div className="color-field">
                  <input
                    id="background"
                    type="color"
                    value={palette.background}
                    onChange={(event) =>
                      setPalette((current) => ({
                        ...current,
                        background: event.target.value,
                      }))
                    }
                  />
                  <code>{palette.background}</code>
                </div>
              </div>
              <div className="section-label">Цвета объектов</div>
              <div className="swatches">
                {palette.colors.length ? (
                  palette.colors.map((color, index) => (
                    <label key={index}>
                      <input
                        aria-label={`Цвет ${index + 1}`}
                        type="color"
                        value={color}
                        onChange={(event) =>
                          setPalette((current) => ({
                            ...current,
                            colors: current.colors.map((item, i) =>
                              i === index ? event.target.value : item,
                            ),
                          }))
                        }
                      />
                      <span>{color}</span>
                    </label>
                  ))
                ) : (
                  <p className="empty-copy">
                    Исходные цвета SVG остаются без изменений.
                  </p>
                )}
              </div>
              <input
                ref={paletteInput}
                type="file"
                accept=".json,.txt,.css"
                hidden
                onChange={(event) => void addPalette(event)}
              />
              <button
                className="button outline wide"
                onClick={() => paletteInput.current?.click()}
              >
                Загрузить палитру
              </button>
              <p className="help-text">
                JSON, CSS или TXT с цветами #RRGGBB. Меняются только заливки и
                обводки.
              </p>
            </div>
          )}
        </aside>
      </div>
      {(notice || error) && (
        <div className={`toast ${error ? "error" : ""}`} role="status">
          {error || notice}
          <button
            aria-label="Закрыть уведомление"
            onClick={() => {
              setNotice("");
              setError("");
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
