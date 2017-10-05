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
        this.emit('error', error);
      };

      this.process.once('exit', checkForBadExit);
      this.process.once('error', reject);
      // this.once('start', (result) => {
      //   this.process.removeListener('error', reject);
      //   this.process.removeListener('exit', checkForBadExit);
      //   resolve(result);
      // });
    });
  }

  // initializeInstance(resolvedPath) {
  //   const options = _.defaults({
  //     path: resolvedPath,
  //   }, this.options);
  //   const instance = new Instance(options);
  //   return instance.start();
  // }

  // install() {
  //   return install(this.options);
  // }

  // start() {
  //   const { purge: purgeData, log } = this.options;
  //   let resolvedPath;
  //
  //   return resolvePath(this.options)
  //     .then((_resolvedPath) => { resolvedPath = _resolvedPath; })
  //     .then(() => {
  //       const dataPath = path.join(resolvedPath, 'data');
  //
  //       if (purgeData) log('INFO', `Purging ${dataPath}`);
  //       return purgeData && purge(dataPath);
  //     })
  //     .then(() => this.initializeInstance(resolvedPath));
  // }
}
