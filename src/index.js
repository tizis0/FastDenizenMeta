import os from "os";
import path from "path";
import { downloadAndExtractZip } from "./downloader.js";
import { parseDirectory } from "./parser.js";
import { MetaStorage } from "./storage.js";

/**
 * функция вычисления расстояния Левенштейна by chatGPT, я хз как до этого можно додуматься самому
 */
function levenshtein(a, b) {
  const matrix = Array.from({ length: a.length + 1 }, () => []);
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

const DEFAULT_URL = "https://github.com/DenizenScript/Denizen/archive/dev.zip";

class FastDenizenMeta {
  constructor(cacheFile = "meta_cache.json") {
    this.storage = new MetaStorage(cacheFile);
  }

  /**
   * ### Перезагружает мету полностью.
   * 
   * @param {string} [sourceUrl] - [**НЕОБЯЗАТЕЛЬНО**] прямая ссылка на скачивание исходного кода.
   * 
   * 
   * Перезагружает мету путем сноса всего кэша меты.
   * Любые сторонние источники тоже будут удалены, но
   * могут быть восстановленны с помощью addSource()
   */
  async reload(sourceUrl = DEFAULT_URL) {
    const tmpDir = path.join(os.tmpdir(), "fast_denizen_meta");
    await downloadAndExtractZip(sourceUrl, tmpDir);

    const blocks = parseDirectory(tmpDir);

    this.storage.clear();
    this.storage.addMany(blocks);
  }

  /**
   * ### Добавляет источник меты.
   * 
   * @param {string} url - прямая ссылка на скачивание исходного кода.
   * 
   * Внимание! Загрузка одного и того же источника не тестировалась и может вызвать ошибки и дубликаты.
   */
  async addSource(url) {
    const tmpDir = path.join(os.tmpdir(), "fast_denizen_meta_addon");
    await downloadAndExtractZip(url, tmpDir);
    const blocks = parseDirectory(tmpDir);
    this.storage.addMany(blocks);
  }

  /**
   * Поиск по ключевому слову и типу, если он указан
   * @param {string} query - поисковый запрос
   * @param {string} [type] - тип ("mechanism", "command", и тд)
   * ## ИЩЕТ ТОЛЬКО ПО НАЗВАНИЮ
   */
  search(query, type = null) {
    const q = query.toLowerCase();
    let filtered = this.storage.data;

    if (type) {
      filtered = filtered.filter((x) => x.type?.toLowerCase() === type.toLowerCase());
    }

    const matches = filtered.filter((entry) => entry.name && entry.name.toLowerCase().includes(q));

    if (matches.length > 0) {
      return { status: "ok", results: matches };
    }

    const allNames = filtered.map((x) => x.name || "").filter(Boolean);
    const suggestions = allNames
      .map((n) => ({ n, dist: levenshtein(q, n.toLowerCase()) }))
      .sort((a, b) => a.dist - b.dist);

    if (suggestions.length && suggestions[0].dist <= 2) {
      return {
        status: "suggestion",
        suggestion: suggestions[0].n,
        results: [],
      };
    }

    return { status: "not_found", results: [] };
  }

  /**
   * УМНЫЙ поиск по ключевому слову и типу, если он указан
   * @param {string} query - поисковый запрос
   * @param {string} [type] - тип ("mechanism", "command", и тд)
   * 
   * ## ИЩЕТ ТОЛЬКО ПО НАЗВАНИЮ
   * 
   * Умный поиск применяет алгоритмы обработки
   * для более размытых поисковых запросов.
   * Пример:
   * @example meta.searchSmart("blocks flagged") // Найдет тег blocks_flagged
   */
  searchSmart(query, type = null) {
    const qWords = query.toLowerCase().split(/\s+/).filter(Boolean);

    // сортiрiвка
    const typePriority = [
        "command",
        "tag",
        "mechanism",
        "objecttype",
        "event",
        "language",
        "action"
    ];

    let filtered = this.storage.data;

    if (type) {
        filtered = filtered.filter((x) => x.type?.toLowerCase() === type.toLowerCase());
    }
    const scored = filtered
        .map((entry) => {
        let score = 0;
        const nameLower = (entry.name || "").toLowerCase();
        const events = entry.events?.join(" ").toLowerCase() || "";

        for (const w of qWords) {
            if (nameLower === w) score += 10;
            else if (nameLower.includes(w)) score += 5;
            else if (events.includes(w)) score += 1;
        }

        return { entry, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const aType = (a.entry.type || "").toLowerCase();
        const bType = (b.entry.type || "").toLowerCase();
        const aIndex = typePriority.indexOf(aType);
        const bIndex = typePriority.indexOf(bType);
        if (aIndex === -1 && bIndex === -1) return 0;
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
        });

    if (scored.length) {
        return { status: "ok", results: scored.map((x) => x.entry) };
    }
    const allNames = filtered.map((x) => x.name).filter(Boolean);
    const suggestions = allNames
        .map((n) => ({ n, dist: levenshtein(query.toLowerCase(), n.toLowerCase()) }))
        .sort((a, b) => a.dist - b.dist);

    if (suggestions.length && suggestions[0].dist <= 2) {
        return { status: "suggestion", suggestion: suggestions[0].n, results: [] };
    }

    return { status: "not_found", results: [] };
    }

}

export default FastDenizenMeta;
export { FastDenizenMeta };

if (typeof module !== "undefined" && module.exports) {
  module.exports = { FastDenizenMeta };
}
