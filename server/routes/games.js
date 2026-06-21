const express = require('express');
const router = express.Router();
const path = require('node:path');
const fs = require('node:fs');

router.get('/', (req, res) => {
  const dataPath = path.join(__dirname, '../../data/games.json');
  fs.readFile(dataPath, 'utf8', (err, data) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to read games catalog' });
    }
    res.json(JSON.parse(data));
  });
});

module.exports = router;
