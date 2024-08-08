# Global Caché integration for Unfolded Circle Remotes

Unfolded Circle Remote integration driver for Global Caché devices.

Supported devices using the [Unified TCP API](https://www.globalcache.com/files/docs/api-gc-unifiedtcp.pdf):
- GC-100
- iTach
- Flex
- Global Connect

Supported features:
- IR sending

The integration implements the UC Remote [Integration-API](https://github.com/unfoldedcircle/core-api) which
communicates with JSON messages over WebSocket.

## Usage
### Setup

- Requires Node.js v20.x (older versions not tested).
- Install required libraries:

```shell
npm install
```

### Run

Run as external integration driver: 
```shell
UC_CONFIG_HOME=. UC_INTEGRATION_HTTP_PORT=8079 node src/driver.js
```

The configuration file is loaded & saved from the path specified in the environment variable `UC_CONFIG_HOME`.

_TODO package as a custom integration driver._

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
