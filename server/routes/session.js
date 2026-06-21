const express = require('express');
const router = express.Router();
const sessionManager = require('../../lib/sessionManager');
const fs = require('node:fs');
const path = require('node:path');

function getGameTitle(gameId) {
  const gamesPath = path.join(__dirname, '../../data/games.json');
  try {
    const games = JSON.parse(fs.readFileSync(gamesPath, 'utf8'));
    const game = games.find(g => g.id === gameId);
    return game ? game.title : 'Unknown Game';
  } catch (e) {
    return 'Unknown Game';
  }
}

router.get('/', (req, res) => {
  res.json(sessionManager.getSessions());
});

router.post('/start', async (req, res) => {
  try {
    const { gameId } = req.body;
    const gameTitle = getGameTitle(gameId);
    
    // Start session. Resolves immediately, lifecycle runs in background
    const session = await sessionManager.startSession(gameId, gameTitle);
    
    res.json({
      ok: true,
      state: session.state,
      instanceName: session.instanceName,
      game: session.gameTitle
    });
  } catch (err) {
    if (err.message === 'NO_CAPACITY') {
      res.status(423).json({ error: 'NO_CAPACITY', message: 'No capacity available.' });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

router.post('/stop', async (req, res) => {
  try {
    const { instanceName } = req.body;
    await sessionManager.stopSession(instanceName);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
