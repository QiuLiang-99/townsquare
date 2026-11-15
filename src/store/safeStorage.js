// Keep the running session usable when browser storage is blocked or full.
// Property reads are supported because the legacy persistence plugin uses both
// storage.getItem("key") and storage.key.
function createSessionStorage(getStorage, onError = () => {}) {
  const memory = new Map();
  let native;
  const failed = () => {
    native = null;
    onError();
  };
  try {
    native = getStorage();
  } catch (error) {
    failed();
  }
  const methods = {
    getItem(key) {
      key = String(key);
      if (native) {
        try {
          const value = native.getItem(key);
          if (value !== null) memory.set(key, value);
          else memory.delete(key);
          return value;
        } catch (error) {
          failed();
        }
      }
      return memory.has(key) ? memory.get(key) : null;
    },
    setItem(key, value) {
      key = String(key);
      value = String(value);
      memory.set(key, value);
      if (native) {
        try {
          native.setItem(key, value);
        } catch (error) {
          failed();
        }
      }
    },
    removeItem(key) {
      key = String(key);
      memory.delete(key);
      if (native) {
        try {
          native.removeItem(key);
        } catch (error) {
          failed();
        }
      }
    },
  };
  return new Proxy(methods, {
    get(target, key) {
      if (key in target) return target[key];
      return methods.getItem(key) === null ? undefined : methods.getItem(key);
    },
    set(target, key, value) {
      methods.setItem(key, value);
      return true;
    },
  });
}
module.exports = { createSessionStorage };
