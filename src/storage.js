import fs from "fs";

export class MetaStorage {
  constructor(filename = "meta_cache.json") {
    this.filename = filename;
    this.data = [];
    if (fs.existsSync(filename)) {
      this.data = JSON.parse(fs.readFileSync(filename, "utf8"));
    }
  }

  save() {
    fs.writeFileSync(this.filename, JSON.stringify(this.data, null, 2), "utf8");
  }

  addMany(items) {
    this.data.push(...items);
    this.save();
  }

  clear() {
    this.data = [];
    this.save();
  }

  search(query) {
    const q = query.toLowerCase();
    return this.data.filter((entry) =>
      Object.values(entry).some((v) => String(v).toLowerCase().includes(q))
    );
  }
}
