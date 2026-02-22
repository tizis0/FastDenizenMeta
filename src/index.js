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
   * @param {string} pluginName - название плагина. Будет добавлено как plugin: <название>
   * 
   * Внимание! Загрузка одного и того же источника не тестировалась и может вызвать ошибки и дубликаты.
   */
async addSource(url, pluginName = null) {
  const tmpDir = path.join(os.tmpdir(), "fast_denizen_meta_addon");
  await downloadAndExtractZip(url, tmpDir);
  const blocks = parseDirectory(tmpDir);

  if (pluginName) {
    const blocksWithPlugin = blocks.map(block => {
      const existingPlugins = block.plugin
        ? block.plugin.split(',').map(p => p.trim()).filter(Boolean)
        : [];
      const allPluginsSet = new Set(existingPlugins);
      allPluginsSet.add(pluginName.trim());
      return {
        ...block,
        plugin: [...allPluginsSet].join(', ')
      };
    });

    this.storage.addMany(blocksWithPlugin);
    return;
  }

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
  /**
 * УМНЫЙ поиск по ключевому слову и типу, если он указан
 * @param {string} query - поисковый запрос
 * @param {string} [type] - тип ("mechanism", "command", и тд)
 *
 * ## ИЩЕТ ПО НАЗВАНИЮ И СОБЫТИЯМ
 *
 * Умный поиск применяет улучшенные алгоритмы для обработки
 * неточных поисковых запросов, включая опечатки и неполные слова.
 * @example
 * meta.searchSmart("item script contaner") // Найдет "Item Script Containers"
 * meta.searchSmart("falg") // Найдет команду "flag"
 */
  searchSmart(query, type = null) {
    const q = query.toLowerCase().trim();
    const qWords = q.split(/\s+/).filter(Boolean);

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
        const nameClean = nameLower.startsWith('.') ? nameLower.slice(1) : nameLower;
        const eventsLower = entry.events?.join(" ").toLowerCase() || "";

        if (nameLower === q || nameClean === q) {
          score += 200;
        }

        if (nameLower.startsWith(q) || nameClean.startsWith(q)) {
          score += 120;
        } else if (nameLower.includes(q) || nameClean.includes(q)) {
          score += 40;
        }

        const nameWords = nameLower.split(/[\s_.]+/).filter(Boolean);
        let wordsMatched = 0;

        for (const qw of qWords) {
          let bestWordScore = 0;
          for (const nw of nameWords) {
            const dist = levenshtein(qw, nw);
            if (dist === 0) {
              bestWordScore = Math.max(bestWordScore, 30);
            } else if (dist <= 2) {
              bestWordScore = Math.max(bestWordScore, 20 - dist * 5);
            } else if (nw.startsWith(qw)) {
              bestWordScore = Math.max(bestWordScore, 15);
            } else if (nw.includes(qw)) {
              bestWordScore = Math.max(bestWordScore, 5);
            }
          }
          if (bestWordScore > 0) {
            score += bestWordScore;
            wordsMatched++;
          }
        }

        if (qWords.length > 1 && wordsMatched === qWords.length) {
          score += 50;
        }

        if (eventsLower.includes(q)) {
          score += 20;
        }

        if (score > 0) {
          const lengthDiff = Math.abs(nameLower.length - q.length);
          score -= lengthDiff * 0.5;
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

        const pA = aIndex === -1 ? 999 : aIndex;
        const pB = bIndex === -1 ? 999 : bIndex;
        
        return pA - pB;
      });

    if (scored.length) {
      return { status: "ok", results: scored.map((x) => x.entry) };
    }

    const allNames = filtered.map((x) => x.name).filter(Boolean);
    const suggestions = allNames
      .map((n) => ({ n, dist: levenshtein(q, n.toLowerCase()) }))
      .sort((a, b) => a.dist - b.dist);

    if (suggestions.length && suggestions[0].dist <= 2) {
      return { status: "suggestion", suggestion: suggestions[0].n, results: [] };
    }

    return { status: "not_found", results: [] };
  }

}

export default FastDenizenMeta;
export { FastDenizenMeta };
