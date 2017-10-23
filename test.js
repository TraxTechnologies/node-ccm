const readline = require('readline');

const ccm = require('./dist');

const cluster = ccm.createCluster({
  clusterConfig: { enable_user_defined_functions: true },
  // configureLoopbackAliases: false,
  nodes: 2,
  startAddress: '127.0.0.2',
  jmxPort: 7101,
  purge: true,
  version: 3.8,
  // verbose: true,
});

const timeout = (t = 1000) => new Promise(resolve => setTimeout(resolve, t));

cluster.initialize()
  // .then(() => timeout())
  .then(() => cluster.populateNodes())
  // .then(() => timeout())
  .then(() => cluster.configureNodes())
  // .then(() => timeout())
  .then(() => cluster.start())
  // .then(() => timeout())
  .then(() => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    return new Promise((resolve) => {
      rl.question('Press [r] to remove, [s] to stop, and enter to leave it up... ', (response) => {
        let p = Promise.resolve();
        switch (response) {
          case 'r':
            p = cluster.remove();
            break;
          case 's':
            p = cluster.shutdown();
            break;
          default:
            break;
        }
        rl.close();
        p.then(resolve);
      });
    });
  })
  .catch(e => console.log(e));
