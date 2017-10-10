import { spawn } from 'child_process';
import _ from 'lodash';
import path from 'path';

export default class Cluster {
  constructor(options) {
    this.options = _.defaults(options || {}, {
      clusterName: 'node-ccm',
      directory: path.join(__dirname, '..', '.releases'),
      fresh: false,
      log: console.log, // eslint-disable-line no-console
      nodes: 1,
      version: '3.9',
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

    return this.spawn(create)
        .then(() => this.log('info', 'Initializing Cluster... Done!'));
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

  spawn(params) {
    this.process = spawn('ccm', params);

    this.process.stdout.pipe(process.stdout);
    this.process.stderr.pipe(process.stderr);

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
