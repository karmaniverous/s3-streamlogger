export type Pickable = Record<string | number | symbol, unknown>;

export const pick = (value: Pickable, keys: (keyof Pickable)[]) => {
  return keys.reduce<Pickable>((result, key) => {
    if (key in value) {
      result[key] = value[key];
    }
    return result;
  }, {});
};

export const omit = (value: Pickable, keys: (keyof Pickable)[]) => {
  return Object.keys(value).reduce<Pickable>((result, key) => {
    if (!keys.includes(key)) {
      result[key] = value[key];
    }
    return result;
  }, {});
};
