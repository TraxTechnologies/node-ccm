import { spawn } from 'child_process';
import fs from 'fs-extra';
import _ from 'lodash';
import path from 'path';
import split from 'split';

const JAVA_WARNING_REG = /^\[\w+ ERROR\] .*: Class JavaLaunchHelper is implemented in both/;

const defaultDir = '/.ccm';

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
    log(`[${level.toUpperCase()}]`, message);
  }

  initialize() {
    this.log('info', 'Initializing Cluster...');
    const { clusterName, version } = this.options;
    const create = ['create', clusterName, '-v', version];

    return this.verifyCCM()
      .then(() => this.verifyClusterDir())
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
      .pipe(split())
      .on('data', (line) => {
        if (line.trim()) {
          if (line.match(JAVA_WARNING_REG)) {
            if (verbose) {
              this.log('verbose', line);
            }
            return;
          }

          if (!skipLogs || verbose) {
            this.log('info', line);
          }
        }
      });
    this.process.stderr
      .pipe(split())
      .on('data', (line) => {
        if (line.trim() && (!skipLogs || verbose)) {
          this.log('error', line);
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
}
