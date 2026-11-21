// How the scripts write figures and names on the lines they print. Pure functions.
import type { Tier } from "./population.ts";

/** A share as a figure in every 100, to one decimal unless `digits` says otherwise: 0.125 is "12.5". */
export const per100 = (x: number, digits = 1): string => (100 * x).toFixed(digits);

/** A share as a percentage, whole unless `digits` says otherwise: 0.125 is "13%". */
export const percent = (x: number, digits = 0): string => `${per100(x, digits)}%`;

/** A code as words: underscores as spaces, and no "quintile" at the end ("big_five_openness_quintile" is "big five openness"). */
export const asWords = (code: string): string => code.replace(/_/g, " ").replace(/ quintile$/, "");

/** A field's tier as printed: A, B or C, or "derived" for a field worked out from others ("-" in the map). */
export const tierLabel = (tier: Tier): string => (tier === "-" ? "derived" : tier);

/** A label without what it adds in brackets: "Retired (from paid work)" is "Retired". */
export const unbracketed = (label: string): string => String(label).split(" (")[0];

/** Text cut at a word to `max` characters or fewer, "..." included, when it is longer. */
export const shorten = (text: string, max = 110): string =>
  text.length > max ? `${text.slice(0, max - 3).replace(/\s+\S*$/, "")}...` : text;

/**
 * A value by its label without brackets, or by its code as words when that label is still over `max` characters.
 * @param value  a field's value, as the map gives it
 */
export const valueName = (value: { code: string; label?: string }, max: number): string => {
  const label = unbracketed(value.label ?? value.code);
  return label.length > max ? asWords(String(value.code)) : label;
};

/** The word that agrees with a count: plural(2, "place") is "places", plural(1, "was", "were") is "was". */
export const plural = (n: number, one: string, many = `${one}s`): string => (n === 1 ? one : many);
