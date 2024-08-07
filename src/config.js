/**
 * Configuration handling of the integration driver.
 *
 * @copyright (c) 2024 by Unfolded Circle ApS.
 * @license Mozilla Public License Version 2.0, see LICENSE for more details.
 */

import fs from "fs";
import path from "path";
import uc from "uc-integration-api";

const CFG_FILENAME = "gc_config.json";

class GcDevice {
  /**
   * Global Caché device configuration.
   * @param {string} id Unique id of the device.
   * @param {string} name Friendly name of the device.
   * @param {string} address IP address of the device. Optionally followed by `:port` number.
   * @param {Array<GcIrPort>} [irPorts=[]] Configured IR ports of the device.
   */
  constructor(id, name, address, irPorts = []) {
    this.id = id;
    this.name = name;
    this.address = address;
    this.irPorts = irPorts;
  }

  get host() {
    const pos = this.address.indexOf(":");
    if (pos === -1) {
      return this.address;
    }

    return this.address.substring(0, pos);
  }

  get port() {
    const pos = this.address.indexOf(":");
    if (pos === -1) {
      return 4998;
    }

    return parseInt(this.address.substring(pos + 1), 10);
  }

  entityIds() {
    const ids = [];

    for (const port of this.irPorts) {
      ids.push(this._idForPort(port));
    }

    return ids;
  }

  entities() {
    const entities = [];

    for (const port of this.irPorts) {
      // FIXME create sensor entities just for testing!
      const sensor = new uc.Entities.Sensor(
        this._idForPort(port),
        this.name + " " + port.name,
        [],
        new Map([
          [uc.Entities.Sensor.ATTRIBUTES.STATE, "ON"],
          [uc.Entities.Sensor.ATTRIBUTES.VALUE, "foobar"]
        ])
      );
      entities.push(sensor);
    }

    return entities;
  }

  _idForPort(port) {
    return `${this.id}:${port.module}_${port.port}`;
  }
}

class GcIrPort {
  module;
  port;
  mode;

  /**
   * Constructs a new GcIrPort object.
   * @param {number} module
   * @param {number} port
   * @param {string} mode
   */
  constructor(module, port, mode) {
    this.module = module;
    this.port = port;
    this.mode = mode;
  }

  get name() {
    return `${this.module}:${this.port} ${this.mode}`;
  }
}

/**
 * Integration driver configuration class. Manages all configured Global Caché devices.
 */
class Devices {
  #config = [];
  #dataPath;
  #cfgFilePath;
  #addHandler;
  #removeHandler;

  /**
   * Return the configuration path.
   * @return {string}
   */
  get dataPath() {
    return this.#dataPath;
  }

  /**
   * Initialize devices from configuration file.
   *
   * @param {string} dataPath Configuration path for the configuration file.
   * @param {function(GcDevice)} addHandler Handler for added devices.
   * @param {function(GcDevice)} removeHandler Handler for removed devices.
   * @return true if configuration could be loaded, false otherwise.
   */
  init(dataPath, addHandler, removeHandler) {
    this.#dataPath = dataPath;
    this.#cfgFilePath = path.join(dataPath, CFG_FILENAME);
    this.#addHandler = addHandler;
    this.#removeHandler = removeHandler;
    return this.load();
  }

  /**
   * Get all device configurations.
   * @return {Array<GcDevice>}
   */
  all() {
    return this.#config;
  }

  /**
   * Check if there's a device with the given device identifier.
   * @param {string} gcId device identifier
   * @return {boolean}
   */
  contains(gcId) {
    return this.#config.some((item) => item.id === gcId);
  }

  /**
   * Add a new configured Global Caché device and persist configuration.
   *
   * The device is updated if it already exists in the configuration.
   * @param {GcDevice} device
   */
  addOrUpdate(device) {
    if (!this.update(device)) {
      this.#config.push(device);
      this.store();
      if (this.#addHandler) {
        this.#addHandler(device);
      }
    }
  }

  /**
   * Get device configuration for given identifier.
   * @param {string} gcId device identifier
   * @return {GcDevice|undefined}
   */
  get(gcId) {
    return this.#config.find((item) => item.id === gcId);
  }

  /**
   * Update a configured Global Caché device and persist configuration.
   * @param {GcDevice} device
   */
  update(device) {
    const index = this.#config.findIndex((item) => item.id === device.id);
    if (index !== -1) {
      this.#config[index] = { ...this.#config[index], ...device };
      this.store();
      return true;
    }
    return false;
  }

  /**
   * Remove the given device configuration.
   * @param {string} gcId device identifier
   * @return {boolean}
   */
  remove(gcId) {
    const index = this.#config.findIndex((item) => item.id === gcId);
    if (index !== -1) {
      const [removedDevice] = this.#config.splice(index, 1);
      if (this.#removeHandler) {
        this.#removeHandler(removedDevice);
      }
      return true;
    }
    return false;
  }

  /**
   * Clear configuration and remove configuration file.
   */
  clear() {
    this.#config = [];
    if (fs.existsSync(this.#cfgFilePath)) {
      fs.unlink(this.#cfgFilePath, (e) => {
        if (e) {
          console.error("Could not delete configuration file. %s", e);
        }
      });
    }
    if (this.#removeHandler) {
      this.#removeHandler(null);
    }
  }

  /**
   * Store the configuration file.
   * @return {boolean} true if the configuration could be saved.
   */
  store() {
    try {
      fs.writeFileSync(this.#cfgFilePath, JSON.stringify(this.#config), "utf-8");
      return true;
    } catch (err) {
      console.error("Cannot write the config file:", err);
      return false;
    }
  }

  /**
   * Load the configuration from the configuration file.
   * @return {boolean} true if the configuration could be loaded.
   */
  load() {
    if (!fs.existsSync(this.#cfgFilePath)) {
      console.info("No configuration file found, using empty configuration.");
      this.#config.length = 0;
      return false;
    }
    try {
      const json = JSON.parse(fs.readFileSync(this.#cfgFilePath, "utf8"));
      for (const configItem of json) {
        console.debug("config entry:", configItem);
      }
      this.#config = json.map((item) => {
        const irPorts = [];
        if (item.irPorts !== undefined && item.irPorts instanceof Array) {
          item.irPorts.forEach((port) => {
            if (port.module && port.port && port.mode) {
              irPorts.push(new GcIrPort(port.module, port.port, port.mode));
            }
          });
        }
        return new GcDevice(item.id, item.name, item.address, irPorts);
      });
      return true;
    } catch (err) {
      console.error("Cannot open the config file: %s", err);
      return false;
    }
  }
}

const devices = new Devices();

export { GcDevice, GcIrPort, devices };
