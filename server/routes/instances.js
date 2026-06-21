const express = require('express');
const router = express.Router();
const provider = require('../../lib/providers');

router.get('/', async (req, res) => {
  try {
    const instances = await provider.listInstances();
    res.json(instances);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:name', async (req, res) => {
  try {
    const instance = await provider.getInstance(req.params.name);
    if (!instance) return res.status(404).json({ error: "Not found" });
    res.json(instance);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:name/start', async (req, res) => {
  try {
    const result = await provider.startInstance(req.params.name);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:name/stop', async (req, res) => {
  try {
    const result = await provider.stopInstance(req.params.name);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:name/restart', async (req, res) => {
  try {
    const result = await provider.restartInstance(req.params.name);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:name/destroy', async (req, res) => {
  try {
    const result = await provider.destroyInstance(req.params.name);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:name/update', async (req, res) => {
  try {
    const { 
      rootDiskSize = 30,
      diskSize = 100,
      spot = false,
      autostop = true,
      timeout = 600
    } = req.body;

    const options = [
      '--root-disk-size', rootDiskSize.toString(),
      '--data-disk-size', diskSize.toString(),
      '--spot', spot ? 'true' : 'false'
    ];

    if (autostop) {
      options.push('--autostop', '--autostop-timeout', timeout.toString());
    } else {
      options.push('--autostop', 'false');
    }

    const result = await provider.updateInstance(req.params.name, options);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
