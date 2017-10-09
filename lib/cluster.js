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

  initialize() {
    const { clusterName, version } = this.options;
    const create = ['create', clusterName, '-v', version];

    return this.spawn(create);
  }

  populateNodes() {
    const { nodes } = this.options;
    const populate = ['populate', '-n', nodes];

    return this.spawn(populate);
  }

  remove() {
    const { clusterName } = this.options;
    const shutdown = ['remove', clusterName];

    return this.spawn(shutdown);
  }

  shutdown() {
    const { clusterName } = this.options;
    const shutdown = ['stop', clusterName];

    return this.spawn(shutdown);
  }

  start() {
    const { clusterName } = this.options;
    const start = ['start', clusterName, '--wait-for-binary-proto'];

    return this.spawn(start);
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
