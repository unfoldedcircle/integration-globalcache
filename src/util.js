/**
 * Utility functions.
 *
 * @copyright (c) 2024 by Unfolded Circle ApS.
 * @license Mozilla Public License Version 2.0, see LICENSE for more details.
 */

import i18n from "i18n";

/**
 * Returns an object of translations for a given phrase in each language.
 *
 * - The `i18n.__h` hashed list of translations is converted to an object with key values.
 *   - __h result for given key: `[{en: "foo"},{de: "bar"}]`
 *   - Output: `{en: "foo", de: "bar"}`
 * - If a translation text is the same as the key, it is considered "untranslated" and skipped in the output.
 *   - __h result for given key `key42`: `[{en: "foo"},{de: "key42"},{fr: "key42"}]`
 *   - Output: `{en: "foo"}`
 * - If there are no translations, the english key is returned as value.
 *   - __h result for given key: `[]`
 *   - Output: `{en: "${key}"}`
 *
 * @param {string} key translation key
 * @return {Object<string, string>}
 */
function i18all(key) {
  const out = {};
  i18n.__h(key).forEach((item) => {
    const lang = Object.keys(item)[0];
    // skip untranslated keys
    if (key !== item[lang]) {
      out[lang] = item[lang];
    }
  });
  if (Object.keys(out).length === 0) {
    out.en = key;
  }
  return out;
}

/**
 * Convert a PRONTO raw HEX string (raw: starting with 0000).
 * @param {string} prontoHex PRONTO raw HEX string.
 * @param {number} [repeatCount=1] optional repeat count to include in converted format.
 * @return {string}
 * @throws Error if the input PRONTO code is not in raw PRONTO hex format
 */
function convertProntoToGlobalCache(prontoHex, repeatCount = 1) {
  const hexValues = prontoHex.split(/[ ,]/);

  if (parseInt(hexValues[0]) !== 0) {
    throw new Error("Only raw PRONTO Hex codes are supported");
  }

  // Skip the first value (format)
  hexValues.shift();

  // Parse the remaining durations
  const durations = hexValues.map((hexValue) => parseInt(hexValue, 16));

  // Calculate the frequency
  const frequency = Math.round(1000000 / (durations[0] * 0.241246));

  // Calculate the preamble offset if there's a repeat sequence
  let preambleOffset = 1;
  if (durations[1] > 0 && durations[2] > 0) {
    // PRONTO specifies length in pairs, sendir as an offset
    preambleOffset = durations[1] * 2 + 1;
  }

  return `${frequency},${repeatCount},${preambleOffset},` + durations.slice(3).join(",");
}

export { i18all, convertProntoToGlobalCache };
