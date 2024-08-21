/**
 * Setup flow for Global Caché device integration.
 *
 * @copyright (c) 2024 by Unfolded Circle ApS.
 * @license Mozilla Public License Version 2.0, see LICENSE for more details.
 */

"use strict";

import uc from "uc-integration-api";
import { discover, retrieveDeviceInfo } from "gc-unified-lib";
import { GcDevice, GcIrPort } from "./config.js";
import * as config from "./config.js";
import { i18all } from "./util.js";
import { log } from "./loggers.js";

/**
 * Enumeration of setup steps to keep track of user data responses.
 * @type {{PAIRING_AIRPLAY: number, INIT: number, DEVICE_CHOICE: number, DISCOVER: number, CONFIGURATION_MODE: number, PAIRING_COMPANION: number}}
 */
const SetupSteps = {
  INIT: 0,
  CONFIGURATION_MODE: 1,
  DISCOVER: 2,
  DEVICE_CHOICE: 3
};

let discoveredDevices = new Map();
let setupStep = SetupSteps.INIT;
let cfgAddDevice = false;
let manualAddress = false;

/**
 * Dispatch driver setup requests to corresponding handlers.
 *
 * Either start the setup process or handle the provided user input data.
 * @param {uc.setup.SetupDriver} msg the setup driver request object, either DriverSetupRequest,
 *                 UserDataResponse or UserConfirmationResponse
 * @return {Promise<uc.setup.SetupAction>} the setup action on how to continue
 */
async function driverSetupHandler(msg) {
  if (msg instanceof uc.setup.DriverSetupRequest) {
    setupStep = SetupSteps.INIT;
    cfgAddDevice = false;
    return await handleDriverSetup(msg);
  }
  if (msg instanceof uc.setup.UserConfirmationResponse) {
    if (setupStep === SetupSteps.DISCOVER) {
      log.debug("Received user confirmation for starting discovery again");
      return await handleDiscovery(msg);
    }
    log.error("No or invalid user confirmation response was received in step %d: %s", setupStep, msg);
  } else if (msg instanceof uc.setup.UserDataResponse) {
    if (setupStep === SetupSteps.CONFIGURATION_MODE && "action" in msg.inputValues) {
      return await handleConfigurationMode(msg);
    }
    if (setupStep === SetupSteps.DISCOVER) {
      return await handleDiscovery(msg);
    }
    if (setupStep === SetupSteps.DEVICE_CHOICE) {
      return await handleUserDataResponse(msg);
    }
    log.error("No or invalid user response was received in step %d: %s", setupStep, msg);
  } else if (msg instanceof uc.setup.AbortDriverSetup) {
    log.info("Setup was aborted with code: %s", msg.error);
    // TODO abort discovery
    discoveredDevices.clear();
    setupStep = SetupSteps.INIT;
  }

  return new uc.setup.SetupError();
}

/**
 * Start driver setup.
 *
 * Initiated by the UC Remote to set up the driver.
 * @param {uc.setup.DriverSetupRequest} msg value(s) of input fields in the first setup screen.
 * @return {Promise<uc.setup.SetupAction>} the setup action on how to continue
 */
async function handleDriverSetup(msg) {
  log.debug("Setting up driver. Setup data:", msg);

  if (msg.reconfigure) {
    setupStep = SetupSteps.CONFIGURATION_MODE;

    // get all configured devices for the user to choose from
    const dropdownDevices = [];
    config.devices.all().forEach((device) => {
      dropdownDevices.push({ id: device.id, label: { en: `${device.name} (${device.id})` } });
    });

    // build user actions, based on available devices
    const dropdownActions = [
      {
        id: "add",
        label: i18all("setup.configuration.add")
      }
    ];

    // add remove & reset actions if there's at least one configured device
    if (dropdownDevices.length > 0) {
      dropdownActions.push({
        id: "remove",
        label: i18all("setup.configuration.remove")
      });
      dropdownActions.push({
        id: "reset",
        label: i18all("setup.configuration.reset")
      });
    } else {
      // dummy entry if no devices are available
      dropdownDevices.push({ id: "", label: { en: "---" } });
    }

    return new uc.setup.RequestUserInput(i18all("setup.configuration.title"), [
      {
        field: { dropdown: { value: dropdownDevices[0].id, items: dropdownDevices } },
        id: "choice",
        label: i18all("setup.configuration.configured_devices")
      },
      {
        field: { dropdown: { value: dropdownActions[0].id, items: dropdownActions } },
        id: "action",
        label: i18all("setup.configuration.action")
      }
    ]);
  } else {
    // clear the config
    // configuredDevices.clear();
    // Initial setup, make sure we have a clean configuration
    config.devices.clear(); // triggers device instance removal
  }

  setupStep = SetupSteps.DISCOVER;
  return await handleDiscovery(msg);
}

/**
 * Process user data response from the configuration mode screen.
 *
 * User input data:
 * - `choice` contains identifier of selected device
 * - `action` contains the selected action identifier
 *
 * @param {UserDataResponse} msg user input data from the configuration mode screen.
 * @return {Promise<RequestUserInput | SetupComplete | SetupError>} the setup action on how to continue
 */
async function handleConfigurationMode(msg) {
  const action = msg.inputValues.action;

  // workaround for web-configurator not picking up first response
  await new Promise((resolve) => setTimeout(resolve, 500));

  switch (action) {
    case "add":
      cfgAddDevice = true;
      break;
    case "remove": {
      const choice = msg.inputValues.choice;
      if (!config.devices.remove(choice)) {
        log.warn("Could not remove device from configuration: %s", choice);
        return new uc.setup.SetupError(uc.setup.IntegrationSetupError.OTHER);
      }
      config.devices.store();
      return new uc.setup.SetupComplete();
    }
    case "reset":
      config.devices.clear(); // triggers device instance removal
      break;
    default:
      log.error("Invalid configuration action: %s", action);
      return new uc.setup.SetupError(uc.setup.IntegrationSetupError.OTHER);
  }

  setupStep = SetupSteps.DISCOVER;

  const userInputDiscovery = new uc.setup.RequestUserInput(i18all("setup.discovery.title"), [
    {
      id: "info",
      label: i18all("setup.discovery.info"),
      field: {
        label: {
          value: i18all("setup.discovery.description")
        }
      }
    },
    {
      field: { text: { value: "" } },
      id: "address",
      label: i18all("setup.discovery.address")
    }
  ]);

  return userInputDiscovery;
}

/**
 * @param {uc.setup.DriverSetupRequest | UserConfirmationResponse | UserDataResponse} msg value(s) of input fields in the first setup screen.
 * @return {Promise<SetupAction>}
 */
async function handleDiscovery(msg) {
  // await uc.driverSetupProgress(wsHandle); // TODO do we need add an event to send async progress notifications?
  manualAddress = false;
  const checkBoxes = [];

  if (msg instanceof uc.setup.UserDataResponse && msg.inputValues.address) {
    if (msg.inputValues.address.length > 0) {
      log.debug("Starting manual driver setup for: %s", msg.inputValues.address);
      manualAddress = true;
      try {
        const deviceInfo = await retrieveDeviceInfo(msg.inputValues.address);
        const id = `${deviceInfo.productFamily}_${deviceInfo.host.replaceAll(".", "")}`;
        discoveredDevices.clear();
        discoveredDevices.set(
          id,
          new Map([
            ["UUID", id],
            ["address", deviceInfo.host]
          ])
        );
        if (cfgAddDevice && config.devices.contains(id)) {
          log.debug("Skipping manual device %s: already configured", id);
        }
        checkBoxes.push({
          field: { checkbox: { value: true } },
          id,
          label: {
            en: `${deviceInfo.productFamily} ${deviceInfo.version} (${deviceInfo.host})`
          }
        });
      } catch (e) {
        log.warn("Failed to connect to device", e);
        return new uc.setup.SetupError(uc.setup.SetupError.CONNECTION_REFUSED); // no better error at the moment :-(
      }
    }
  }

  if (!manualAddress) {
    log.info("Discovering devices on the network");
    discoveredDevices = await discover(35000);

    discoveredDevices.forEach((item) => {
      const id = item.get("UUID");
      if (id === undefined) {
        log.warn("Ignoring discovered device: missing UUID.", item);
      } else if (cfgAddDevice && config.devices.contains(id)) {
        log.info("Skipping found device %s: already configured", id);
      } else if (item.get("Make") === "Unfolded Circle") {
        log.debug("Ignoring UC dock: %s", id);
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
  }

  if (checkBoxes.length === 0) {
    log.info("Could not discover any new devices");
    return new uc.setup.RequestUserConfirmation(
      i18all("setup.discovery_failed.title"),
      i18all("setup.discovery_failed.header")
    );
  }

  setupStep = SetupSteps.DEVICE_CHOICE;
  return new uc.setup.RequestUserInput("Select your Global Caché products", checkBoxes);
}

/**
 *
 * @param {uc.setup.UserDataResponse} msg
 * @return {Promise<uc.setup.SetupAction>} the setup action on how to continue
 */
async function handleUserDataResponse(msg) {
  log.debug("Received user input for driver setup.", msg);

  for (const uuid in msg.inputValues) {
    // selected by user?
    if (msg.inputValues[uuid] === "true") {
      const device = discoveredDevices.get(uuid);
      if (device === undefined) {
        continue;
      }
      try {
        const deviceInfo = await retrieveDeviceInfo(device.get("address"));
        log.info("Device information %s:", uuid, deviceInfo);
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
        log.error("Failed to retrieve device information for %s.", uuid, e);
        return new uc.setup.SetupError(uc.setup.SetupError.OTHER);
      }
    }
  }

  return new uc.setup.SetupComplete();
}

export { driverSetupHandler };
