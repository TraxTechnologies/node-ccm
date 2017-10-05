node-ccm
============
A node interface for [Cassandra Cluster Manager (CCM)](https://github.com/pcmanus/ccm), used for managing instances of Cassandra clusters and nodes from Node.

Requirements
------------
- [CCM](https://github.com/pcmanus/ccm) and all of its [requirements](https://github.com/pcmanus/ccm#requirements)
  - Install with `brew install ccm` or `pip install ccm`

### Notes
To support multiple node clusters in OS X, you'll need to setup loopback aliases for as many nodes as you'll be using. This is done using the following commands:

```bash
sudo ifconfig lo0 alias 127.0.0.2 up
sudo ifconfig lo0 alias 127.0.0.3 up
...
```

See [the CCM Requirements documentation](https://github.com/pcmanus/ccm#requirements) for more information.
