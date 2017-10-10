node-ccm
============
A node interface for [Cassandra Cluster Manager (CCM)](https://github.com/pcmanus/ccm), used for managing instances of Cassandra clusters and nodes from Node.

Requirements
------------
- [CCM](https://github.com/pcmanus/ccm) and all of its [requirements](https://github.com/pcmanus/ccm#requirements)
  - Install with `brew install ccm` or `pip install ccm`

## Usage

```javascript
import ccm from 'node-ccm';

const options = {
  clusterName: 'myCluster',
  nodes: 2,
  version: '3.9',
};
const cluster = ccm.createCluster(options);
cluster.initialize()
  .then(() => cluster.populateNodes())
  .then(() => cluster.start())
  .then(() => {
    // Cluster ready here

    /* ... */

    // Stop the cluster and purge its data...
    cluster.remove();

    // or just stop the cluster, leaving its data intact
    cluster.shutdown();
  });
```

## new Cluster(options)

This will create a new instance of a cluster.

#### Methods

* `cluster.initialize`    - creates a new cluster instance in CCM
* `cluster.populateNodes` - create the number of nodes specified in options within the cluster
* `cluster.remove`        - stop the cluster and purge its associated data
* `cluster.shutdown`      - shut down the cluster, leaving the associated data intact
* `cluster.start`         - start the created cluster instance and spin up any populated nodes

#### Options

* `clusterName` - The name of the cluster
* `nodes`       - The number of nodes to create for the cluster
* `version`     - The version of Cassandra to use for this cluster

### Notes
To support multiple node clusters in OS X, you'll need to setup loopback aliases for as many nodes as you'll be using. This is done using the following commands:

```bash
sudo ifconfig lo0 alias 127.0.0.2 up
sudo ifconfig lo0 alias 127.0.0.3 up
...
```

See [the CCM Requirements documentation](https://github.com/pcmanus/ccm#requirements) for more information.
