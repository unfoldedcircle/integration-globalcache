/**
 * Central log functions.
 *
 * Use [debug](https://www.npmjs.com/package/debug) module for logging.
 *
 * @copyright (c) 2024 by Unfolded Circle ApS.
 * @license Mozilla Public License Version 2.0, see LICENSE for more details.
 */

import debug from "debug";

const log = {
  debug: debug("uc_gc:debug"),
  info: debug("uc_gc:info"),
  warn: debug("uc_gc:warn"),
  error: debug("uc_gc:error")
};

export { log };
