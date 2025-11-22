import fs from "fs";
import path from "path";

const blockStart = /\/\/ <--\[(.*?)\]/;
const blockEnd = /\/\/ -->/;

function parseBlock(blockText, type) {
  const lines = blockText.split("\n");
  const result = { type };

  if (type === "data") return null;

  let currentTag = null;
  let buffer = [];
  let isFirstUsageContent = false;

  for (const lineRaw of lines) {
    const line = lineRaw.trim().replace(/^\/\/\s?/, "");
    
    if (!line) {
      if (currentTag === "description") {
        buffer.push("");
      }
      continue;
    }

    if (line.startsWith("@")) {
      if (currentTag) {
        let content = buffer.join("\n");
        if (currentTag !== 'description') {
          content = content.trim();
        }

        if (content) {
          if (result[currentTag]) {
            if (Array.isArray(result[currentTag])) {
              result[currentTag].push(content);
            } else {
              result[currentTag] = [result[currentTag], content];
            }
          } else {
            result[currentTag] = content;
          }
        }
      }

      const [key, ...rest] = line.slice(1).split(" ");
      const value = rest.join(" ").trim();

      currentTag = key.toLowerCase();
      buffer = value ? [value] : [];
      isFirstUsageContent = (currentTag === "usage");

      if (currentTag === "attribute" && value.startsWith("<") && value.endsWith(">")) {
        const cleanedValue = value.substring(1, value.length - 1);
        const firstDotIndex = cleanedValue.indexOf('.');
        
        if (firstDotIndex !== -1) {
            const namePart = cleanedValue.substring(firstDotIndex + 1);
            result.name = namePart.replace(/\[.*?\]/g, '');
        } else {
            result.name = cleanedValue.replace(/\[.*?\]/g, '');
        }

        result.syntax = value;
        currentTag = null;
        buffer = [];
        isFirstUsageContent = false;
      } else if (currentTag === "name") {
        result.name = value;
        currentTag = null;
        isFirstUsageContent = false;
      } else if (currentTag === "syntax") {
        result.syntax = value;
        currentTag = null;
        isFirstUsageContent = false;
      } else if (currentTag === "events") {
        buffer = [];
        isFirstUsageContent = false;
      }

      continue;
    }

    if (currentTag === "usage" && isFirstUsageContent && line && !line.startsWith("#")) {
      buffer.push("# " + line);
      isFirstUsageContent = false;
    } else {
      buffer.push(line);
    }
  }

  if (currentTag && buffer.length) {
    let content = buffer.join("\n");
    if (currentTag !== 'description') {
      content = content.trim();
    }
    
    if (content) {
      if (result[currentTag]) {
        if (Array.isArray(result[currentTag])) {
          result[currentTag].push(content);
        } else {
          result[currentTag] = [result[currentTag], content];
        }
      } else {
        result[currentTag] = content;
      }
    }
  }

  if (result.events && typeof result.events === "string") {
    result.events = result.events.split("\n").map(l => l.trim()).filter(Boolean);
    if (!result.name && result.events.length) {
      result.name = result.events[0];
    }
  }

  if (type === "property") {
    const objectName = result.object || "UnknownObject";
    const propertyName = result.name || "unknown";
    const fullReference = `${objectName}.${propertyName}`;
    const firstDescLine = (result.description ? result.description.split('\n')[0] : "").trim();

    const tagResult = { ...result };
    tagResult.type = "tag";
    tagResult.name = fullReference;
    tagResult.syntax = `<${fullReference}>`;
    tagResult.mechanism = fullReference;

    const mechResult = { ...result };
    mechResult.type = "mechanism";
    mechResult.name = propertyName;

    mechResult.tags = `<${fullReference}> ${firstDescLine}`;
    return [tagResult, mechResult];
  }

  if (!result.name) result.name = "unknown";

  return result;
}

export function parseJavaFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const results = [];
  const lines = content.split("\n");
  
  for (let i = 0; i < lines.length; i++) {
    const startMatch = lines[i].match(blockStart);
    if (startMatch) {
      const type = startMatch[1];
      let block = [];
      for (let j = i + 1; j < lines.length; j++) {
        if (blockEnd.test(lines[j])) {
          i = j;
          break;
        }
        block.push(lines[j]);
      }
      
      const parsed = parseBlock(block.join("\n"), type);
      
      if (parsed) {
        const items = Array.isArray(parsed) ? parsed : [parsed];
        
        items.forEach(item => {
          item.file = path.basename(filePath);
          results.push(item);
        });
      }
    }
  }
  return results;
}

export function parseDirectory(dirPath) {
  const results = [];
  const files = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const file of files) {
    const fullPath = path.join(dirPath, file.name);
    if (file.isDirectory()) {
      results.push(...parseDirectory(fullPath));
    } else if (file.name.endsWith(".java")) {
      results.push(...parseJavaFile(fullPath));
    }
  }

  return results;
}
