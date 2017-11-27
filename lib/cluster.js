import { spawn } from 'child_process';
import fs from 'fs-extra';
import _ from 'lodash';
import path from 'path';
import split from 'split';

const JAVA_WARNING_REG = /^\[\w+ ERROR\] .*: Class JavaLaunchHelper is implemented in both/;
const DOWNLOAD_STARTED_REG = /ccm INFO (Downloading http:.* \((\d{0,5}.\d{0,5})([KMG]B)\))/;
const DOWNLOAD_DONE_REG = /ccm INFO (Extracting.*)/;
const DOWNLOAD_PROGRESS_REG = / *(\d{5,10}) *\[(\d{0,3}(?:\.\d{0,3})?)%]/;

const ADDRESS_REPLACEMENT_REG = /(127\.0\.0\.\d{1,3})/g;
const JMX_PORT_REPLACEMENT_REG = /JMX_PORT="(\d{4})"/g;

const LOOPBACK_IF_UP_REG = {
  Darwin: /lo0: flags=.*\WUP\W.*/,
  Linux: /lo: <LOOPBACK,UP,LOWER_UP>/
};

const LOOPBACK_ALIAS_REG = {
  Darwin: /inet (127\.\d{1,3}\.\d{1,3}\.\d{1,3}) netmask/,
  Linux: /inet (127\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,3}) scope host/
};

const CHECK_MACHINE_CMD = 'uname';
const CHECK_INTERFACE_CMD = {
  Darwin: {
    cmd: 'ifconfig',
    params: ['lo0']
  },
  Linux: {
    cmd: 'ip',
    params: ['addr', 'show', 'lo']
  }
};

const UP_LOOPBACK_INTERFACE_CMD = {
  Darwin: ['ifconfig', 'lo0', 'up'],
  Linux: ['ip', 'link', 'set', 'lo', 'up']
}

const UP_LOOPBACK_ADDR_CMD = (machine, address) => {
  const commands = {
    Darwin: ['ifconfig', 'lo0', 'alias', address, 'up'],
    Linux: ['ip', 'addr', 'add', address, 'dev', 'lo']
  }
  return commands[machine] || [];
}

const defaultDir = '/.ccm';
const defaultPort = '9042';

const MATCH_LAST_DOT_REG = /\.(?=[^.]*$)/;

export default class Cluster {
  constructor(options) {
    this.options = _.defaults(options || {}, {
      clusterConfig: null,
      clusterName: 'node-ccm',
      configureLoopbackAliases: true,
      jmxPort: 7100, // Array or Number
      log: console.log, // eslint-disable-line no-console
      nodes: 1,
      purge: false,
      startAddress: null,
      version: '3.9',
      verbose: false
    });
  }

  getAddresses() {
    const { nodes, startAddress = 1 } = this.options;
    if (_.isInteger(startAddress)) {
      return _.times(nodes, i => `127.0.0.${startAddress + i}`);
    }
    const [prefix, start] = startAddress.split(MATCH_LAST_DOT_REG);
    return _.times(nodes, i => `${prefix}.${+start + i}`);
  }

  getJMXPorts() {
    const { nodes, jmxPort } = this.options;
    return _.times(nodes, i => i + jmxPort);
  }

  log(level, message) {
    const { log } = this.options;
    if (level === 'progress') {
      process.stdout.cursorTo(0);
      process.stdout.write(`[${level.toUpperCase()}] ${message}`);
      process.stdout.clearLine(1);
    } else {
      log(`[${level.toUpperCase()}]`, message);
    }
  }

  initialize() {
    this.log('info', 'Initializing Cluster...');
    const { clusterName, version } = this.options;
    const create = ['create', clusterName, '-v', version];

    return this.verifyCCM()
      .then(() => this.verifyClusterDir())
      .then(() => this.verifyPortOpen())
      .then(() => this.verifyLoopbackAliases())
      .then(() => this.spawn(create))
      .then(() => this.log('info', 'Initializing Cluster... Done!'));
  }

  resolveConfigDir() {
    const { clusterName } = this.options;
    return path.join(process.env.HOME, defaultDir, clusterName);
  }

  verifyCCM() {
    return this.spawn(['list'], true).catch(() => {
      this.log(
        'error',
        'CCM not found. Refer to https://github.com/pcmanus/ccm for installation instructions',
      );
      return Promise.reject(new Error('CCM not found'));
    });
  }

  verifyLoopbackAliases() {
    const addresses = this.getAddresses();
    const { configureLoopbackAliases } = this.options;

    let machine;
    let interfaceConfig;
    const checkMachine = spawn(CHECK_MACHINE_CMD);
    checkMachine.stdout.on('data', (data) => {
      machine = data.toString().trim();
      const checkInterface = CHECK_INTERFACE_CMD[machine];
      interfaceConfig = spawn(checkInterface.cmd, checkInterface.params);
    });

    return new Promise((resolve, reject) => {
      checkMachine.once('exit', () => {
        const configuredAliases = [];
        let loopbackUp = false;
        interfaceConfig.stdout.pipe(split()).on('data', (line) => {
          if (line.match(LOOPBACK_IF_UP_REG[machine])) {
            loopbackUp = true;
          } else if (line.match(LOOPBACK_ALIAS_REG[machine])) {
            const [, loopbackAddress] = LOOPBACK_ALIAS_REG[machine].exec(line);
            configuredAliases.push(loopbackAddress.split('/').shift());
          }
        });

        interfaceConfig.once('exit', () => {
          const missingAliases = _.difference(addresses, configuredAliases, ['127.0.0.1']);
          if (!loopbackUp && !_.some(missingAliases)) {
            if (configureLoopbackAliases) {
              this.log('warning', 'Loopback interface down. Bringing it back up will require sudo privileges.');
              const loopback = spawn('sudo', UP_LOOPBACK_INTERFACE_CMD[machine]);
              loopback.on('exit', (code) => {
                if (code === 0) {
                  resolve();
                } else {
                  reject();
                }
              });
            } else {
              reject();
            }
          } else if (_.some(missingAliases)) {
            if (configureLoopbackAliases) {
              this.log('warning', `Loopback address not configured for [${missingAliases.join(', ')}]. Configuring it will require sudo privileges.`);
              _.reduce(
                missingAliases,
                (p, address) =>
                  p.then(() => {
                    const loopback = spawn('sudo', UP_LOOPBACK_ADDR_CMD(machine, address));
                    return new Promise((resolveLoopback, rejectLoopback) => {
                      loopback.on('exit', (code) => {
                        if (code === 0) {
                          resolveLoopback();
                        } else {
                          rejectLoopback();
                        }
                      });
                    });
                  }),
                Promise.resolve(),
              )
                .then(resolve, reject);
            } else {
              reject();
            }
          } else {
            resolve();
          }
        });
      });
    })
      .catch(() => {
        this.log('error', 'Loopback aliases not configured properly. View the README to configure them manually or set `configureLoopbackAliases` to true to configure it automatically. (Requires sudo privileges)');
        return Promise.reject(new Error('Loopback aliases not configured'));
      });
  }

  verifyPortOpen() {
    const addresses = this.getAddresses();

    return addresses.reduce((address) => {
      const grep = spawn('grep', ['LISTEN']);
      const lsof = spawn('lsof', ['-n', `-i@${address}:${defaultPort}`]);

      lsof.stdout.pipe(grep.stdin);

      let isOpen = true;
      grep.stdout.pipe(split()).on('data', (line) => {
        isOpen = isOpen && !line.match(new RegExp(`:${defaultPort}`));
      });

      return new Promise((resolve, reject) => {
        grep.once('exit', () => {
          if (isOpen) {
            resolve();
          } else {
            reject();
          }
        });
      }).catch(() => {
        this.log(
          'error',
          `Address ${address}:${defaultPort} is not available. Cassandra may already be running externally.`,
        );
        return Promise.reject(new Error('Port not available'));
      });
    }, Promise.resolve());
  }

  verifyClusterDir() {
    const { clusterName, purge } = this.options;
    const resolvedPath = this.resolveConfigDir();
    return fs.pathExists(resolvedPath).then((exists) => {
      if (exists) {
        if (purge) {
          this.log('info', 'Cluster config already exists. Purging...');
          const activate = ['switch', clusterName];
          const remove = ['remove'];
          return this.spawn(activate)
            .then(() => this.spawn(remove))
            .then(() => this.log('info', 'Cluster config already exists. Purging Done!'));
        }
        const msg = `Cluster config directory already exists: ${resolvedPath}.\n\tUse the \`purge\` option to remove it automatically or remove it manually with \`ccm switch ${clusterName}; ccm remove;\``;
        return Promise.reject(new Error(msg));
      }
      return Promise.resolve();
    });
  }

  populateNodes() {
    this.log('info', 'Populating Nodes...');
    const { nodes } = this.options;

    const populate = ['populate', '-n', nodes];

    return (
      this.spawn(populate)
        // .then(() => this.configureNodes())
        .then(() => this.log('info', 'Populating Nodes... Done!'))
    );
  }

  configureNodes() {
    this.log('info', 'Configuring Nodes...');
    return this.configurePortsAndAddresses()
      .then(() => this.updateClusterConfig())
      .then(() => this.log('info', 'Configuring Nodes... Done!'));
  }

  configurePortsAndAddresses() {
    const resolvedPath = this.resolveConfigDir();
    const addresses = this.getAddresses();
    const jmxPorts = this.getJMXPorts();
    const { nodes } = this.options;

    return Promise.all(_.times(nodes).map((number) => {
      /* Update configured IP address for nodes */
      const nodeName = `node${number + 1}`;
      const yamlPath = `${resolvedPath}/${nodeName}/conf/cassandra.yaml`;
      const addressUpdate = fs.readFile(yamlPath).then((data) => {
        const address = addresses[number];
        const [, oldAddress] = ADDRESS_REPLACEMENT_REG.exec(data);
        const newContent = data.toString().replace(ADDRESS_REPLACEMENT_REG, address);
        return fs.writeFile(yamlPath, newContent)
          .then(() => [oldAddress, address]);
      });

      /* Update configured jmx port for nodes */
      const shPath = `${resolvedPath}/${nodeName}/conf/cassandra-env.sh`;
      const jmxPortUpdate = fs.readFile(shPath).then((data) => {
        const port = jmxPorts[number];
        const [, oldPort] = JMX_PORT_REPLACEMENT_REG.exec(data);
        const newContent = data
          .toString()
          .replace(JMX_PORT_REPLACEMENT_REG, `JMX_PORT="${port}"`);
        return fs.writeFile(shPath, newContent)
          .then(() => [oldPort, port]);
      });
      return Promise.all([addressUpdate, jmxPortUpdate])
        .then(([address, port]) => ({ node: nodeName, address, port }));
    }))
      .then((replacementDefinitions) => {
        const clusterConfPath = `${resolvedPath}/cluster.conf`;
        const clusterConfP = fs.readFile(clusterConfPath)
          .then((data) => {
            const newContent = _.reduce(
              // reverse the array so we don't update addresses that have already been changed
              replacementDefinitions.slice().reverse(),
              (c, { address: [oldAddress, newAddress] }) =>
                c.replace(new RegExp(_.escapeRegExp(oldAddress), 'g'), newAddress),
              data.toString(),
            );
            return fs.writeFile(clusterConfPath, newContent);
          });

        const nodeConfP = _.map(
          replacementDefinitions,
          ({ node, address: [oldAddress, newAddress], port: [oldPort, newPort] }) => {
            const nodeConfPath = `${resolvedPath}/${node}/node.conf`;
            return fs.readFile(nodeConfPath)
              .then(data =>
                fs.writeFile(
                  nodeConfPath,
                  data.toString()
                    .replace(new RegExp(_.escapeRegExp(oldAddress), 'g'), newAddress)
                    .replace(new RegExp(_.escapeRegExp(oldPort), 'g'), newPort),
                ));
          },
        );

        return Promise.all([clusterConfP, ...nodeConfP]);
      });
  }

  updateClusterConfig() {
    const { clusterConfig } = this.options;

    return _.reduce(
      clusterConfig,
      (p, value, key) => p.then(() => this.spawn(['updateconf', `${key}: ${value}`])),
      Promise.resolve(),
    );
  }

  remove() {
    this.log('info', 'Removing Cluster...');
    const { clusterName } = this.options;
    const shutdown = ['remove', clusterName];

    return this.spawn(shutdown).then(() => this.log('info', 'Removing Cluster... Done!'));
  }

  shutdown() {
    this.log('info', 'Shutting down Cluster...');
    const { clusterName } = this.options;
    const shutdown = ['stop', clusterName];

    return this.spawn(shutdown).then(() => this.log('info', 'Shutting down Cluster... Done!'));
  }

  start() {
    this.log('info', 'Starting Cluster...');
    const { clusterName } = this.options;
    const start = ['start', '--no-wait', clusterName];

    return this.spawn(start).then(() => this.log('info', 'Starting Cluster... Done!'));
  }

  spawn(params, skipLogs = false) {
    const { verbose } = this.options;
    this.process = spawn('ccm', params);

    this.process.stdout.on('data', (b) => {
      const line = b.toString().trim();
      if (line) {
        if (line.match(JAVA_WARNING_REG)) {
          if (verbose) {
            this.log('verbose', line);
          }
          return;
        }

        if (!skipLogs || verbose) {
          if (!this.handleDownloadMessage(line)) {
            this.log('info', line);
          }
        }
      }
    });
    this.process.stderr.on('data', (b) => {
      const line = b.toString().trim();
      if (line && (!skipLogs || verbose)) {
        if (!this.handleDownloadMessage(line)) {
          this.log('error', line);
        }
      }
    });

    return new Promise((resolve, reject) => {
      const checkForBadExit = (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        const error = new Error(`Server exitted with the non-zero exit code ${code}`);
        reject(error);
      };

      this.process.once('exit', checkForBadExit);
      this.process.once('error', reject);
    });
  }

  handleDownloadMessage(line) {
    if (line.match(DOWNLOAD_STARTED_REG)) {
      const [, message, size, unit] = DOWNLOAD_STARTED_REG.exec(line);
      this.download = {
        size,
        unit,
      };
      this.log('info', message);
      this.log('progress', `Downloading... 0% (0/${size}${unit})`);
      return true;
    } else if (line.match(DOWNLOAD_PROGRESS_REG)) {
      if (this.download) {
        const { size: total, unit } = this.download;
        const [, size, percent] = DOWNLOAD_PROGRESS_REG.exec(line);
        let formattedSize;
        switch (unit) {
          case 'KB':
            formattedSize = size / 1024;
            break;
          case 'MB':
            formattedSize = size / (1024 ** 2);
            break;
          case 'GB':
            formattedSize = size / (1024 ** 3);
            break;
          default:
            formattedSize = size;
            break;
        }
        formattedSize = _.round(formattedSize, 2);
        this.log('progress', `Downloading... ${percent}% (${formattedSize}/${total}${unit})`);
      }
      return true;
    } else if (line.match(DOWNLOAD_DONE_REG)) {
      const { size: total, unit } = this.download;
      delete this.download;
      this.log('progress', `Downloading... 100% (${total}/${total}${unit})`);
      process.stdout.write('\n');
      const [, message] = DOWNLOAD_DONE_REG.exec(line);
      this.log('info', message);
      return true;
    }

    return false;
  }
}
