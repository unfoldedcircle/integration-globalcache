/**
 * This module implements the Global Caché communication of the Remote Two integration driver.
 *
 * @copyright (c) 2024 by Unfolded Circle ApS.
 * @license Mozilla Public License Version 2.0, see LICENSE for more details.
 */
import { UnifiedClient } from "gc-unified-lib";
import EventEmitter from "events";

const DEVICE_STATES = {
  ONLINE: "ONLINE",
  IDLE: "IDLE",
  OFFLINE: "OFFLINE"
};

const DEVICE_EVENTS = {
  STATE_CHANGED: "STATE_CHANGED"
};

class GlobalCacheDevice extends EventEmitter {
  #cfg;
  #client;
  #connected = false;

  /**
   *
   * @param {GcDevice} deviceCfg
   */
  constructor(deviceCfg) {
    super();
    this.#cfg = deviceCfg;
    this.#client = new UnifiedClient();

    this.#client.on("connect", this._onConnected.bind(this));
    this.#client.on("close", this._onClosed.bind(this));
    this.#client.on("error", this._onError.bind(this));
  }

  get connected() {
    return this.#client.connected;
  }

  connect() {
    if (this.#client.connected) {
      return;
    }
    console.debug("[%s] start connection to %s", this.#cfg.id, this.#cfg.address);
    this.#client.connect({
      host: this.#cfg.host,
      port: this.#cfg.port,
      reconnect: true
    });
  }

  disconnect() {
    console.debug("[%s] disconnect", this.#cfg.id);
    this.#connected = false;
    this.#client.close({ reconnect: false });
  }

  send(data) {
    return this.#client.send(data);
  }

  _onConnected() {
    this.#connected = true;
    //
    console.info("[%s] connected", this.#cfg.id);
    this.emit(DEVICE_EVENTS.STATE_CHANGED, {
      id: this.#cfg.id,
      state: DEVICE_STATES.ONLINE
    });
  }

  _onClosed() {
    this.#connected = false;
    //
    console.info("[%s] disconnected", this.#cfg.id);
    this.emit(DEVICE_EVENTS.STATE_CHANGED, {
      id: this.#cfg.id,
      state: DEVICE_STATES.OFFLINE
    });
  }

  _onError(err) {
    //
    console.error("[%s] communication error:", this.#cfg.id, err);
  }
}

export { GlobalCacheDevice, DEVICE_EVENTS, DEVICE_STATES };
