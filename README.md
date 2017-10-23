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

* `clusterName`   *(String)* - The name of the cluster *(default: `'node-ccm'`)*
* `configureLoopbackAliases` *(Boolean)* - If true, system loopback aliases will be configured automatically if needed. *NOTE* `sudo` privileges are require for this action. *(default: `true`)*
* `jmxPort`       *(Number)* - The port to use for JMX debugging for the first node in the cluster. You should only need to change this if port `7100` if already taken on the host machine (like if Cassandra is already running externally). Subsequent nodes will increment this number accordingly. *(default: `7100`)*
* `nodes`         *(Integer)* - The number of nodes to create for the cluster *(default: `1`)*
* `purge`         *(Boolean)* - If true and the specified cluster already exists, remove the cluster and purge its data before initializing the new cluster *(default: `false`)*
* `startAddress`  *(String|Number)* - The address to assign for your first node. Subsequent nodes will increment the last part of the address. Specifying a number instead of a string will define the last part of the address instead, resulting in an address like `127.0.0.{startAddress}`. *(default: `'127.0.0.1'`)*
* `verbose`       *(Boolean)* - Log all errors and messages from CCM *(default: `false`)*
* `version`       *(String)* - The version of Cassandra to use for this cluster *(default: `'3.9'`)*

### Notes
To support multiple node clusters in OS X, you'll need to setup loopback aliases for as many nodes as you'll be using. This is done using the following commands:

```bash
sudo ifconfig lo0 alias 127.0.0.2 up
sudo ifconfig lo0 alias 127.0.0.3 up
...
```

See [the CCM Requirements documentation](https://github.com/pcmanus/ccm#requirements) for more information.
