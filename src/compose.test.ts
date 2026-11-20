import { describe, expect, it } from "vitest";
import { suggestAssets } from "./compose";
import type { Asset } from "./model";

const asset = (name: string): Asset => ({
  id: name,
  name,
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/>',
  viewBox: [0, 0, 10, 10],
  tags: [],
});

const library = [asset("Книга"), asset("Лампа"), asset("Кошелёк")];

describe("подбор объектов", () => {
  it("находит связанные предметы для метафоры", () => {
    expect(
      suggestAssets("Идея и обучение", library, 5, "metaphor").map(
        (item) => item.name,
      ),
    ).toEqual(["Книга", "Лампа"]);
  });

  it("для списка берёт только названные объекты", () => {
    expect(
      suggestAssets("Книга и кошелёк", library, 5, "objects").map(
        (item) => item.name,
      ),
    ).toEqual(["Книга", "Кошелёк"]);
  });

  it("не подставляет случайные объекты при отсутствии совпадений", () => {
    expect(suggestAssets("Подводная лодка", library, 5, "objects")).toEqual([]);
  });
});
