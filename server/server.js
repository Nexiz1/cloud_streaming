const express = require('express');
const path = require('node:path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const gamesRouter = require('./routes/games');
app.use('/api/games', gamesRouter);

const instancesRouter = require('./routes/instances');
app.use('/api/instances', instancesRouter);

const sessionRouter = require('./routes/session');
app.use('/api/session', sessionRouter);

const setupRouter = require('./routes/setup');
app.use('/api/setup', setupRouter);

app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from Express' });
});

app.post('/api/shutdown', (req, res) => {
  console.log('Shutdown signal received. Exiting process...');
  res.json({ ok: true });
  setTimeout(() => process.exit(0), 100);
});

function startServer() {
  return new Promise((resolve) => {
    const server = app.listen(PORT, () => {
      console.log(`Express server running on http://0.0.0.0:${PORT}`);
      resolve(`http://localhost:${PORT}`);
    });
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer, app };
