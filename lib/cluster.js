import { spawn } from 'child_process';
import fs from 'fs-extra';
import _ from 'lodash';
import path from 'path';
import split from 'split';

const JAVA_WARNING_REG = /^\[\w+ ERROR\] .*: Class JavaLaunchHelper is implemented in both/;
const DOWNLOAD_STARTED_REG = /ccm INFO (Downloading http:.* \((\d{0,5}.\d{0,5})([KMG]B)\))/;
const DOWNLOAD_DONE_REG = /ccm INFO (Extracting.*)/;
const DOWNLOAD_PROGRESS_REG = / *(\d{5,10}) *\[(\d{0,3}(?:\.\d{0,3})?)%]/;

const defaultDir = '/.ccm';
const defaultPort = '9042';

export default class Cluster {
  constructor(options) {
    this.options = _.defaults(options || {}, {
      clusterName: 'node-ccm',
      purge: false,
      log: console.log, // eslint-disable-line no-console
      nodes: 1,
      version: '3.9',
      verbose: false,
    });
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
      .then(() => this.spawn(create))
      .then(() => this.log('info', 'Initializing Cluster... Done!'));
  }

  resolveConfigDir() {
    const { clusterName } = this.options;
    return path.join(process.env.HOME, defaultDir, clusterName);
  }

  verifyCCM() {
    return this.spawn(['list'], true)
      .catch(() => {
        this.log('error', 'CCM not found. Refer to https://github.com/pcmanus/ccm for installation instructions');
        return Promise.reject(new Error('CCM not found'));
      });
  }

  verifyPortOpen() {
    const grep = spawn('grep', ['LISTEN']);
    const lsof = spawn('lsof', ['-n', `-i:${defaultPort}`]);

    lsof.stdout.pipe(grep.stdin);

    let isOpen = true;
    grep.stdout.pipe(split())
      .on('data', (line) => {
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
    })
      .catch(() => {
        this.log('error', `Port ${defaultPort} is not available. Cassandra may already be running externally.`);
        return Promise.reject(new Error('Port not available'));
      });
  }

  verifyClusterDir() {
    const { clusterName, purge } = this.options;
    const resolvedPath = this.resolveConfigDir();
    return fs.pathExists(resolvedPath)
      .then((exists) => {
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
    const { nodes } = this.options;
    this.log('info', 'Populating Nodes...');
    const populate = ['populate', '-n', nodes];

    return this.spawn(populate)
      .then(() => this.log('info', 'Populating Nodes... Done!'));
  }

  remove() {
    this.log('info', 'Removing Cluster...');
    const { clusterName } = this.options;
    const shutdown = ['remove', clusterName];

    return this.spawn(shutdown)
      .then(() => this.log('info', 'Removing Cluster... Done!'));
  }

  shutdown() {
    this.log('info', 'Shutting down Cluster...');
    const { clusterName } = this.options;
    const shutdown = ['stop', clusterName];

    return this.spawn(shutdown)
      .then(() => this.log('info', 'Shutting down Cluster... Done!'));
  }

  start() {
    this.log('info', 'Starting Cluster...');
    const { clusterName } = this.options;
    const start = ['start', clusterName];

    return this.spawn(start)
      .then(() => this.log('info', 'Starting Cluster... Done!'));
  }

  spawn(params, skipLogs = false) {
    const { verbose } = this.options;
    this.process = spawn('ccm', params);

    this.process.stdout
      .on('data', (b) => {
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
    this.process.stderr
      .on('data', (b) => {
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
          case 'KB': formattedSize = size / 1024; break;
          case 'MB': formattedSize = size / (1024 ** 2); break;
          case 'GB': formattedSize = size / (1024 ** 3); break;
          default: formattedSize = size; break;
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
