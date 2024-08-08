/**
 * This module implements a Remote Two integration driver for Global Caché devices.
 *
 * @copyright (c) 2024 by Unfolded Circle ApS.
 * @license Mozilla Public License Version 2.0, see LICENSE for more details.
 */

"use strict";

import uc from "uc-integration-api";
import { discover, retrieveDeviceInfo } from "gc-unified-lib";
import * as config from "./config.js";
import { GcDevice, GcIrPort } from "./config.js";
import { DEVICE_EVENTS, DEVICE_STATES, GlobalCacheDevice } from "./device.js";

const configuredDevices = new Map();

uc.on(uc.EVENTS.CONNECT, async () => {
  await uc.setDeviceState(uc.DEVICE_STATES.CONNECTED);

  for (const key in configuredDevices) {
    configuredDevices[key].connect();
  }
});

uc.on(uc.EVENTS.DISCONNECT, async () => {
  await uc.setDeviceState(uc.DEVICE_STATES.DISCONNECTED);

  for (const key in configuredDevices) {
    configuredDevices[key].disconnect();
  }
});

uc.on(uc.EVENTS.ENTER_STANDBY, async () => {
  console.debug("[uc_gc] Going to standby.");

  for (const key in configuredDevices) {
    configuredDevices[key].disconnect();
  }
});

uc.on(uc.EVENTS.EXIT_STANDBY, async () => {
  console.debug("[uc_gc] Came back from standby. Getting state updates.");

  for (const key in configuredDevices) {
    configuredDevices[key].connect();
  }
});

uc.on(uc.EVENTS.SUBSCRIBE_ENTITIES, async (entityIds) => {
  for (const index in entityIds) {
    const entityId = entityIds[index];
    const entity = uc.configuredEntities.getEntity(entityId);
    if (entity) {
      console.log(`[uc_gc] Subscribe: ${entityId}`);

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

uc.on(uc.EVENTS.UNSUBSCRIBE_ENTITIES, async (entityIds) => {
  entityIds.forEach((entityId) => {
    console.log(`[uc_gc] Unsubscribe: ${entityId}`);
    // TODO anything to do in unsubscribe?
    // we could check if all entities of a device are unsubscribed and then disconnect the device
  });
});

uc.on(uc.EVENTS.ENTITY_COMMAND, async (wsHandle, entityId, entityType, cmdId, params) => {
  console.debug(`[uc_gc] ENTITY COMMAND: ${entityId} ${entityType} ${cmdId}`);

  await uc.acknowledgeCommand(wsHandle, uc.STATUS_CODES.SERVICE_UNAVAILABLE);
});

// TODO move driver setup functions to setup_flow.js module -> requires enhancements of the nodejs integration wrapper library
// === DRIVER SETUP ===

let discoveredDevices = [];

async function discoverAndPresentResults(wsHandle) {
  await uc.driverSetupProgress(wsHandle);

  console.log("[uc_gc] Discovering devices on the network");
  discoveredDevices = await discover(45000);

  const checkBoxes = [];

  discoveredDevices.forEach((item) => {
    const id = item.get("UUID");
    if (id === undefined) {
      console.warn("Ignoring discovered device: missing UUID.", item);
    } else if (config.devices.contains(id)) {
      console.debug("Skipping found device %s: already configured", id);
    } else {
      checkBoxes.push({
        field: { checkbox: { value: false } },
        id: item.get("UUID"),
        label: {
          en: `${item.get("Model")} ${item.get("Revision")} (${item.get("address")})`
        }
      });
    }
  });

  if (checkBoxes.length === 0) {
    console.info("[uc_gc] Could not discover any device");
    await uc.requestDriverSetupUserConfirmation(
      wsHandle,
      "No new Global Caché devices found",
      "Please make sure that your Global Caché devices are powered on and accessible from the same network as the remote. Already configured devices are excluded from the discovery.\nClick Next to try again, or close this dialog to abort."
    );
    return;
  }

  await uc.requestDriverSetupUserInput(wsHandle, "Select your Global Caché products", checkBoxes);
}

uc.on(uc.EVENTS.SETUP_DRIVER, async (wsHandle, setupData) => {
  console.log(`[uc_gc] Setting up driver. Setup data: ${setupData}`);

  const reconfigure = setupData.reconfigure; // FIXME provide reconfigure property in event

  if (reconfigure) {
    // TODO setup screen as in ATV & Android TV: ask what to do
  } else {
    // clear the config
    // configuredDevices.clear();
    // TODO Initial setup, make sure we have a clean configuration
    config.devices.clear(); // triggers device instance removal
  }

  await uc.acknowledgeCommand(wsHandle);
  console.log("[uc_gc] Acknowledged driver setup");

  await discoverAndPresentResults(wsHandle);
});

uc.on(uc.EVENTS.SETUP_DRIVER_USER_CONFIRMATION, async (wsHandle) => {
  console.log("[uc_gc] Received user confirmation for starting discovery again: sending OK");
  await uc.acknowledgeCommand(wsHandle);

  await discoverAndPresentResults(wsHandle);
});

uc.on(uc.EVENTS.SETUP_DRIVER_USER_DATA, async (wsHandle, data) => {
  console.log("[uc_gc] Received user input for driver setup.", JSON.stringify(data));
  await uc.acknowledgeCommand(wsHandle);
  await uc.driverSetupProgress(wsHandle);

  for (const uuid in data) {
    // selected by user?
    if (data[uuid] === "true") {
      const device = discoveredDevices.get(uuid);
      if (device === undefined) {
        continue;
      }
      try {
        const deviceInfo = await retrieveDeviceInfo(device.get("address"));
        console.info("Device information %s:", uuid, deviceInfo);
        /*
        Device information GC100_000C1E01A875_GlobalCache: DeviceInfo {
          host: '172.16.16.184',
          port: 4998,
          productFamily: 'GC-100',
          model: 'GC-100-12',
          version: '3.0-12',
          irPorts: [
            IrPort { module: 4, port: 1, mode: 'IR' },
            IrPort { module: 4, port: 2, mode: 'IR' },
            IrPort { module: 4, port: 3, mode: 'IR' },
            IrPort { module: 5, port: 1, mode: 'IR' },
            IrPort { module: 5, port: 2, mode: 'IR' },
            IrPort { module: 5, port: 3, mode: 'IR' }
          ]
        }
         */
        const irPorts = [];
        deviceInfo.irPorts.forEach((port) => {
          irPorts.push(new GcIrPort(port.module, port.port, port.mode.toString()));
        });
        const gcDevice = new GcDevice(uuid, deviceInfo.name, deviceInfo.address, irPorts);
        config.devices.addOrUpdate(gcDevice);
      } catch (e) {
        console.error("Failed to retrieve device information for %s.", uuid, e);
        await uc.driverSetupError(wsHandle, e.toString());
        return;
      }
    }
  }

  await uc.driverSetupComplete(wsHandle);
});

// === END DRIVER SETUP ===

/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

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
    console.debug("Adding new Global Caché device: %s (%s) %s", device.name, device.id, device.address);

    const client = new GlobalCacheDevice(device);

    client.on(DEVICE_EVENTS.STATE_CHANGED, async (data) => {
      const configured = config.devices.get(data.id);
      if (configured === undefined) {
        console.warn("Can't handle device state change '%s': device %s is no longer configured!", data.state, data.id);
        return;
      }

      let newState;
      switch (data.state) {
        case DEVICE_STATES.ONLINE:
          newState = "ON";
          break;
        case DEVICE_STATES.OFFLINE:
          // hack: UNAVAILABLE is a common state for all entity types
          newState = uc.Entities.Sensor.STATES.UNAVAILABLE;
          break;
        default:
          console.warn("Unhandled device state event:", data.state);
          return;
      }

      const entityIds = configured.entityIds();
      for (const entityId of entityIds) {
        const entity = uc.configuredEntities.getEntity(entityId);
        // adjust state based on entity type
        if (newState === "ON") {
          switch (entity.entity_type) {
            case uc.Entities.TYPES.BUTTON:
              newState = uc.Entities.Button.STATES.AVAILABLE;
              break;
            case uc.Entities.TYPES.SENSOR:
              newState = uc.Entities.Sensor.STATES.ON;
              break;
            case uc.Entities.TYPES.SWITCH:
              // TODO get current state
              newState = uc.Entities.Switch.STATES.UNKNOWN;
              break;
          }
        }

        if (entity?.attributes?.state === newState) {
          continue;
        }

        uc.configuredEntities.updateEntityAttributes(
          entityId,
          // hack: state key string is always the same, independent of entity type
          new Map([[uc.Entities.Sensor.ATTRIBUTES.STATE, newState]])
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
    if (uc.availableEntities.contains(entity.id)) {
      uc.availableEntities.removeEntity(entity.id);
    }
    uc.availableEntities.addEntity(entity);
  }

  return true;
}

/**
 * Handle a newly added device in the configuration.
 * @param {GcDevice} device
 */
function onDeviceAdded(device) {
  console.debug("New device added:", device);
  _addConfiguredDevice(device, false);
}

/**
 * Handle a removed device in the configuration.
 * @param {GcDevice} device
 */
function _onDeviceRemoved(device) {
  if (device === null) {
    console.debug("Configuration cleared, disconnecting & removing all configured device instances");
    for (const configured in configuredDevices) {
      configured.disconnect();
      configured.removeAllListeners();
    }
    configuredDevices.clear();
    uc.configuredEntities.clear();
    uc.availableEntities.clear();
  } else if (device.id in configuredDevices) {
    console.debug("Disconnecting from removed device %s", device.id);
    const configured = configuredDevices.get(device.id);
    configuredDevices.delete(configured.id);
    if (configured === undefined) {
      return;
    }
    configured.disconnect();
    configured.removeAllListeners();

    const ids = device.entityIds();
    for (const entityId in ids) {
      uc.configuredEntities.removeEntity(entityId);
      uc.availableEntities.removeEntity(entityId);
    }
  }
}

// ***** Main function ******
async function main() {
  // load paired devices
  config.devices.init(uc.configDirPath, onDeviceAdded, _onDeviceRemoved);

  // Note: device will be moved to configured devices with the subscribe_events request!
  // This will also start the device connection.
  config.devices.all().forEach((device) => {
    _addConfiguredDevice(device, false);
  });

  uc.init("driver.json");
}

// Execute the main function if the module is run directly
if (import.meta.url === new URL("", import.meta.url).href) {
  await main();
}
