import EventEmitter from "./EventEmitter.js";

// Tiny fetch-based loader: types "json" and "binary" (ArrayBuffer).
export default class Resources extends EventEmitter {
  constructor(sources) {
    super();
    this.sources = sources;
    this.items = {};
    this.toLoad = this.sources.length;
    this.loaded = 0;
    this.startLoading();
  }

  startLoading() {
    for (const source of this.sources) {
      fetch(source.path)
        .then((r) => {
          if (!r.ok) throw new Error(`${source.path}: ${r.status}`);
          return source.type === "json" ? r.json() : r.arrayBuffer();
        })
        .then((data) => this.sourceLoaded(source, data))
        .catch((err) => {
          console.error("[resources]", err);
          this.sourceLoaded(source, null);
        });
    }
  }

  sourceLoaded(source, data) {
    this.items[source.name] = data;
    this.loaded++;
    if (this.loaded === this.toLoad) {
      this.trigger("ready");
    }
  }
}
