/**
 * This module implements the Global Caché communication of the Remote Two integration driver.
 *
 * @copyright (c) 2024 by Unfolded Circle ApS.
 * @license Mozilla Public License Version 2.0, see LICENSE for more details.
 */
import { UnifiedClient } from "gc-unified-lib";
import EventEmitter from "events";
import { convertProntoToGlobalCache } from "./util.js";
import { log } from "./loggers.js";

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
  #client = new UnifiedClient({ sendTimeout: 1000 });
  #connected = false;
  #lastSendIrPort = "";
  #lastSendIr = "";
  #irId = 1;

  /**
   *
   * @param {GcDevice} deviceCfg
   */
  constructor(deviceCfg) {
    super();
    this.#cfg = deviceCfg;

    this.#client.on("connect", this.#onConnected.bind(this));
    this.#client.on("close", this.#onClosed.bind(this));
    this.#client.on("error", this.#onError.bind(this));
  }

  get connected() {
    return this.#client.connected;
  }

  connect() {
    if (this.#client.connected) {
      return;
    }
    if (!["stopped", "failed"].some((state) => this.#client.state === state)) {
      return;
    }

    const tcpKeepAlive = !this.#cfg.name.startsWith("GC-100");
    log.debug("[%s] start connection to %s (keepAlive=%s)", this.#cfg.id, this.#cfg.address, tcpKeepAlive);
    this.#client.connect({
      host: this.#cfg.host,
      port: this.#cfg.port,
      reconnect: true,
      tcpKeepAlive,
      tcpKeepAliveInitialDelay: 10000
    });
  }

  disconnect() {
    log.debug("[%s] disconnecting", this.#cfg.id);
    this.#connected = false;
    this.#client.close({ reconnect: false });
  }

  /**
   * Send a raw request message without further processing.
   *
   * @param {string} data request message
   * @return {Promise<string, Error>} response message from device, or an Error in case of a communication error or if
   *         the device responded with an error message.
   */
  async send(data) {
    this.#lastSendIr = "";
    return this.#client.send(data);
  }

  /**
   * Send a PRONTO IR code. The code is converted to a `sendir` message and assigned an ID, depending on if it's a new
   * or a repeated code.
   *
   * @param {string} port output port
   * @param {string} pronto PRONTO hex code
   * @param {number} [repeat] number of repeats
   * @return {Promise<string, Error>} response message from device, or an Error in case of a communication error or if
   *         the device responded with an error message.
   */
  async sendPronto(port, pronto, repeat) {
    const sendIr = convertProntoToGlobalCache(pronto, repeat > 0 ? repeat : 1);
    if (this.#lastSendIrPort !== port || this.#lastSendIr !== sendIr) {
      this.#lastSendIrPort = port;
      this.#lastSendIr = sendIr;
      this.#irId += 1;
      if (this.#irId > 65535) {
        this.#irId = 1;
      }
    }
    const msg = `sendir,${port},${this.#irId},${sendIr}`;
    return this.#client.send(msg);
  }

  #onConnected() {
    this.#connected = true;
    log.info("[%s] connected", this.#cfg.id);
    this.emit(DEVICE_EVENTS.STATE_CHANGED, {
      id: this.#cfg.id,
      state: DEVICE_STATES.ONLINE
    });
  }

  #onClosed() {
    this.#connected = false;
    log.info("[%s] disconnected", this.#cfg.id);
    this.emit(DEVICE_EVENTS.STATE_CHANGED, {
      id: this.#cfg.id,
      state: DEVICE_STATES.OFFLINE
    });
  }

  #onError(err) {
    log.error("[%s] communication error:", this.#cfg.id, err);
  }
}

export { GlobalCacheDevice, DEVICE_EVENTS, DEVICE_STATES };
