# Global Caché integration for Unfolded Circle Remotes

Unfolded Circle Remote integration driver for Global Caché devices.

Supported devices using the [Unified TCP API](https://www.globalcache.com/files/docs/api-gc-unifiedtcp.pdf):
- GC-100
- iTach
- Flex
- Global Connect

Supported features:
- IR sending

Relay control and serial features are planned.

This integration driver is included in the Unfolded Circle Remote firmware and does not need to be run as external
integration to use Global Caché devices as IR emitters. A standalone driver can be used for development or custom
functionality.

The integration implements the UC Remote [Integration-API](https://github.com/unfoldedcircle/core-api) which
communicates with JSON messages over WebSocket.

## Standalone usage
### Setup

Requirements:
- Remote Two firmware 1.9.3 or newer with support for new IR-emitter entity.
- Install [nvm](https://github.com/nvm-sh/nvm) (Node.js version manager) for local development.
- Node.js v20.16 or newer (older versions are not tested).
- Install required libraries:

```shell
npm install
```

For running a separate integration driver on your network for UC Remotes, the configuration in file
[driver.json](driver.json) needs to be changed:

- Set `driver_id` to a unique value, `uc_gc_driver` is already used for the embedded driver in the firmware.
- Change `name` to easily identify the driver in discovery & setup with the Remote or the web-configurator.
- Optionally add a `"port": 8090` field for the WebSocket server listening port.
  - Default port: `9090`
  - Also overrideable with environment variable `UC_INTEGRATION_HTTP_PORT`

### Run

Run as external integration driver: 
```shell
UC_CONFIG_HOME=. UC_INTEGRATION_HTTP_PORT=8079 node src/driver.js
```

The configuration file is loaded & saved from the path specified in the environment variable `UC_CONFIG_HOME`.

### Logging

Logging any kind of output is directed to the [debug](https://www.npmjs.com/package/debug) module.
To let the integration driver output anything, run the driver with the `DEBUG` environment variable set like:

```shell
DEBUG=uc_gc:* node src/driver.js
```

The driver exposes the following log-levels:

Log namespaces:
- `uc_gc:debug`: debugging messages
- `uc_gc:info`: informational messages like server up and running, device connected or disconnected
- `uc_gc:warn`: warnings
- `uc_gc:error`: errors

If you only want to get errors and warnings reported:

```shell
DEBUG=uc_gc:warn,uc_gc:error node src/driver.js
```

The [Global Caché communication library](https://github.com/zehnm/gc-unified-lib) and the 
[Unfolded Circle Integration-API library](https://github.com/unfoldedcircle/integration-node-library) are also using the
`debug` module for logging:

- [gc-unified-lib log namespaces](https://github.com/zehnm/gc-unified-lib/blob/main/README.md#logging)
  - Enable device socket message trace: `gclib:msg`
- [Node.js API wrapper log namespaces](https://github.com/unfoldedcircle/integration-node-library?tab=readme-ov-file#logging)
  - Enable WebSocket message trace: `ucapi:msg`

## Gotchas

- Don't use DHCP for Global Caché devices, since they frequently get a new IP address after power loss!
  - Configure a static IP address to improve connectivity issues.
- GC-100 only allows one TCP connection!
  - iTach, Flex and Global Connect devices support 8 TCP connections.
- GC-100 doesn't seem to support TCP keep-alive option. 

## Versioning

We use [SemVer](http://semver.org/) for versioning. For the versions available, see the
[tags and releases in this repository](https://github.com/unfoldedcircle/integration-appletv/releases).

## Changelog

The major changes found in each new release are listed in the [changelog](CHANGELOG.md)
and under the GitHub [releases](https://github.com/unfoldedcircle/integration-globalcache/releases).

## Contributions

Please read our [contribution guidelines](CONTRIBUTING.md) before opening a pull request.

## License

This project is licensed under the [**Mozilla Public License 2.0**](https://choosealicense.com/licenses/mpl-2.0/).
See the [LICENSE](LICENSE) file for details.
