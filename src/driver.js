/**
 * This module implements a Remote Two integration driver for Global Caché devices.
 *
 * @copyright (c) 2024 by Unfolded Circle ApS.
 * @license Mozilla Public License Version 2.0, see LICENSE for more details.
 */

"use strict";

import * as uc from "@unfoldedcircle/integration-api";
import i18n from "i18n";
import path from "path";
import * as config from "./config.js";
import { DEVICE_EVENTS, DEVICE_STATES, GlobalCacheDevice } from "./device.js";
import { driverSetupHandler } from "./setup_flow.js";
import { log } from "./loggers.js";

// Node.js 20.11 / 21.2
const __dirname = import.meta.dirname;

const driver = new uc.IntegrationAPI();

i18n.configure({
  locales: ["en", "de", "fr"],
  defaultLocale: "en",
  directory: path.join(__dirname, "..", "locales"),
  objectNotation: true
});

/**
 * Configured GC devices.
 * @type {Map<string, GlobalCacheDevice>}
 */
const configuredDevices = new Map();

driver.on(uc.Events.Connect, async () => {
  await driver.setDeviceState(uc.DeviceStates.Connected);

  configuredDevices.forEach((configured) => configured.connect());
});

driver.on(uc.Events.Disconnect, async () => {
  await driver.setDeviceState(uc.DeviceStates.Disconnected);

  configuredDevices.forEach((configured) => configured.disconnect());
});

driver.on(uc.Events.EnterStandby, async () => {
  log.debug("Going to standby.");

  configuredDevices.forEach((configured) => configured.disconnect());
});

driver.on(uc.Events.ExitStandby, async () => {
  log.debug("Came back from standby. Getting state updates.");

  configuredDevices.forEach((configured) => configured.connect());
});

driver.on(uc.Events.SubscribeEntities, async (entityIds) => {
  for (const index in entityIds) {
    const entityId = entityIds[index];
    const entity = driver.getConfiguredEntities().getEntity(entityId);
    if (entity) {
      log.debug(`Subscribe: ${entityId}`);

      const deviceId = _deviceIdFromEntityId(entityId);
      if (deviceId === undefined) {
        continue;
      }

      const device = configuredDevices.get(deviceId);
      if (device !== undefined) {
        device.connect();
      } else {
        const configured = config.devices.get(deviceId);
        if (configured !== undefined) {
          _addConfiguredDevice(configured);
        }
      }

      // TODO get latest state and update entity attributes?
    }
  }
});

driver.on(uc.Events.UnsubscribeEntities, async (entityIds) => {
  entityIds.forEach((entityId) => {
    log.debug(`Unsubscribe: ${entityId}`);
    // TODO anything to do in unsubscribe?
    // we could check if all entities of a device are unsubscribed and then disconnect the device
  });
});

/**
 * Entity command handler.
 *
 * Called by the integration-API if a command is sent to a configured entity.
 *
 * @param {uc.Entity} entity button entity
 * @param {string} cmdId command
 * @param {Object<string, *>} params optional command parameters
 * @return {Promise<uc.StatusCodes>} status of the command
 */
async function cmdHandler(entity, cmdId, params) {
  const deviceId = _deviceIdFromEntityId(entity.id);
  if (!deviceId) {
    return uc.StatusCodes.NotFound;
  }
  const device = configuredDevices.get(deviceId);
  if (!device) {
    return uc.StatusCodes.NotFound;
  }
  if (entity.entity_type === "ir_emitter") {
    switch (cmdId) {
      case "send_ir":
        if (params.format && params.format !== "PRONTO") {
          return uc.StatusCodes.BadRequest;
        }
        device.sendPronto(params.port || "1:1", params.code, params.repeat).catch((reason) => {
          // TODO improve error handling. An invalid request should return BadRequest
          //      Verify UI & core implementation: can we delay the cmd ack, or does it prevent IR-repeat?
          log.error("send_ir command failed: %s", reason);
        });
        break;
      case "stop_ir":
        device.send(`stopir,${params?.port || "1:1"}`).catch((reason) => {
          log.error("stopir command failed: %s", reason);
        });
        break;
      default:
        // invalid command
        return uc.StatusCodes.BadRequest;
    }
  } else {
    return uc.StatusCodes.BadRequest;
  }

  return uc.StatusCodes.Ok;
}

function _deviceIdFromEntityId(entityId) {
  const index = entityId.lastIndexOf(":");
  if (index !== -1) {
    return entityId.substring(0, index);
  }

  return undefined;
}

/**
 * Add the given Global Caché device to the configured devices and register all provided entities.
 *
 * @param {GcDevice} device the device to register and add entities for.
 * @param {boolean} connect establish TCP connection to the device.
 * @private
 */
function _addConfiguredDevice(device, connect = true) {
  // the device should not yet be configured, but better be safe
  const existing = configuredDevices.get(device.id);
  if (existing !== undefined) {
    existing.disconnect();
  } else {
    log.info("Adding new device: %s (%s) %s", device.name, device.id, device.address);

    const client = new GlobalCacheDevice(device);

    client.on(DEVICE_EVENTS.STATE_CHANGED, async (data) => {
      const configured = config.devices.get(data.id);
      if (configured === undefined) {
        log.warn("Can't handle device state change '%s': device %s is no longer configured!", data.state, data.id);
        return;
      }

      let newState;
      switch (data.state) {
        case DEVICE_STATES.ONLINE:
          newState = "ON";
          break;
        case DEVICE_STATES.OFFLINE:
          // hack: UNAVAILABLE is a common state for all entity types
          newState = uc.SensorStates.Unavailable;
          break;
        default:
          log.warn("Unhandled device state event:", data.state);
          return;
      }

      const entityIds = configured.entityIds();
      for (const entityId of entityIds) {
        const entity = driver.getConfiguredEntities().getEntity(entityId);
        if (!entity) {
          continue;
        }

        if (entity?.attributes?.state === newState) {
          continue;
        }

        driver.getConfiguredEntities().updateEntityAttributes(
          entityId,
          // hack: state key string is always the same, independent of entity type
          { [uc.SensorAttributes.State]: newState }
        );
      }
    });

    configuredDevices.set(device.id, client);
  }

  if (connect) {
    const client = configuredDevices.get(device.id);
    client.connect();
  }

  _registerAvailableEntities(device);
}

/**
 * Add all provided entities of a configured Global Caché device to the available entities.
 *
 * @param {GcDevice} device the device to add entities for.
 * @returns {boolean} true if added, false if the device was already in storage.
 * @private
 */
function _registerAvailableEntities(device) {
  const entities = device.entities();

  for (const entity of entities) {
    if (driver.getAvailableEntities().contains(entity.id)) {
      driver.getAvailableEntities().removeEntity(entity.id);
    }
    entity.setCmdHandler(cmdHandler);
    driver.getAvailableEntities().addAvailableEntity(entity);
  }

  return true;
}

/**
 * Handle a newly added device in the configuration.
 * @param {GcDevice} device
 */
function onDeviceAdded(device) {
  log.debug("New device added:", JSON.stringify(device));
  _addConfiguredDevice(device, false);
}

/**
 * Handle a removed device in the configuration.
 * @param {GcDevice} device
 */
function onDeviceRemoved(device) {
  if (device === null) {
    log.info("Configuration cleared, disconnecting & removing all configured device instances");
    configuredDevices.forEach((configured) => {
      configured.disconnect();
      configured.removeAllListeners();
    });
    configuredDevices.clear();
    driver.getConfiguredEntities().clear();
    driver.getAvailableEntities().clear();
  } else if (configuredDevices.has(device.id)) {
    log.debug("Disconnecting from removed device %s", device.id);
    const configured = configuredDevices.get(device.id);
    if (!configured) {
      return;
    }
    configuredDevices.delete(device.id);
    configured.disconnect();
    configured.removeAllListeners();

    const ids = device.entityIds();
    for (const entityId of ids) {
      driver.getConfiguredEntities().removeEntity(entityId);
      driver.getAvailableEntities().removeEntity(entityId);
    }
  }
}

async function main() {
  // load configured devices
  config.devices.init(driver.getConfigDirPath(), onDeviceAdded, onDeviceRemoved);

  // Note: device will be moved to configured devices with the subscribe_events request!
  // This will also start the device connection.
  config.devices.all().forEach((device) => {
    _addConfiguredDevice(device, false);
  });

  driver.init("driver.json", driverSetupHandler);

  const info = driver.getDriverVersion();
  log.info("Global Caché integration %s started", info.version.driver);
}

// Execute the main function if the module is run directly
if (import.meta.url === new URL("", import.meta.url).href) {
  await main();
}
