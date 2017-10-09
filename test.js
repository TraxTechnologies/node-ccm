const readline = require('readline');

const ccm = require('./dist');

const cluster = ccm.createCluster({
  nodes: 2,
  version: 3.8,
});

cluster.initialize()
  .then(() => cluster.populateNodes())
  .then(() => cluster.start())
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
