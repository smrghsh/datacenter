export default class EventEmitter {
  constructor() {
    this.callbacks = {};
    this.callbacks.base = {};
  }

  on(_names, callback) {
    if (typeof _names === "undefined" || _names === "") return false;
    if (typeof callback === "undefined") return false;

    const names = this.resolveNames(_names);
    names.forEach((_name) => {
      const name = this.resolveName(_name);
      if (!(this.callbacks[name.namespace] instanceof Object))
        this.callbacks[name.namespace] = {};
      if (!(this.callbacks[name.namespace][name.value] instanceof Array))
        this.callbacks[name.namespace][name.value] = [];
      this.callbacks[name.namespace][name.value].push(callback);
    });
    return this;
  }

  off(_names) {
    if (typeof _names === "undefined" || _names === "") return false;

    const names = this.resolveNames(_names);
    names.forEach((_name) => {
      const name = this.resolveName(_name);
      if (name.namespace !== "base" && name.value === "") {
        delete this.callbacks[name.namespace];
      } else {
        if (name.namespace === "base") {
          for (const namespace in this.callbacks) {
            if (
              this.callbacks[namespace] instanceof Object &&
              this.callbacks[namespace][name.value] instanceof Array
            ) {
              delete this.callbacks[namespace][name.value];
              if (Object.keys(this.callbacks[namespace]).length === 0)
                delete this.callbacks[namespace];
            }
          }
        } else if (
          this.callbacks[name.namespace] instanceof Object &&
          this.callbacks[name.namespace][name.value] instanceof Array
        ) {
          delete this.callbacks[name.namespace][name.value];
          if (Object.keys(this.callbacks[name.namespace]).length === 0)
            delete this.callbacks[name.namespace];
        }
      }
    });
    return this;
  }

  trigger(_name, _args) {
    if (typeof _name === "undefined" || _name === "") return false;

    let finalResult = null;
    const args = !(_args instanceof Array) ? [] : _args;
    let nameArray = this.resolveNames(_name);
    let name = this.resolveName(nameArray[0]);

    if (name.namespace === "base") {
      for (const namespace in this.callbacks) {
        if (
          this.callbacks[namespace] instanceof Object &&
          this.callbacks[namespace][name.value] instanceof Array
        ) {
          this.callbacks[namespace][name.value].forEach((callback) => {
            const result = callback.apply(this, args);
            if (typeof finalResult === "undefined") finalResult = result;
          });
        }
      }
    } else if (this.callbacks[name.namespace] instanceof Object) {
      if (name.value === "") return this;
      this.callbacks[name.namespace][name.value]?.forEach((callback) => {
        const result = callback.apply(this, args);
        if (typeof finalResult === "undefined") finalResult = result;
      });
    }
    return finalResult;
  }

  resolveNames(_names) {
    let names = _names;
    names = names.replace(/[^a-zA-Z0-9 ,/.]/g, "");
    names = names.replace(/[,/]+/g, " ");
    names = names.split(" ");
    return names;
  }

  resolveName(name) {
    const newName = {};
    const parts = name.split(".");
    newName.original = name;
    newName.value = parts[0];
    newName.namespace = "base";
    if (parts.length > 1 && parts[1] !== "") newName.namespace = parts[1];
    return newName;
  }
}
