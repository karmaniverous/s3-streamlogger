import { isObject } from 'is-what';

export type Pickable = Record<string | number | symbol, unknown>;

export const pick = (value: Pickable, keys: (keyof Pickable)[]) =>
  isObject(value)
    ? keys.reduce<Pickable>((result, key) => {
        if (key in value) {
          result[key] = value[key];
        }
        return result;
      }, {})
    : value;

export const omit = (value: Pickable, keys: (keyof Pickable)[]) =>
  isObject(value)
    ? Object.keys(value).reduce<Pickable>((result, key) => {
        if (!keys.includes(key)) {
          result[key] = value[key];
        }
        return result;
      }, {})
    : value;
