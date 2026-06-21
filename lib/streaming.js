const { spawn } = require('node:child_process');
const provider = require('./providers');

async function playStream({ instanceName, gameId }) {
  const instance = await provider.getInstance(instanceName);
  if (!instance) {
    throw new Error('Instance not found');
  }

  if (instance.status !== 'running' && instance.status !== 'ready') {
    throw new Error('Instance is not running');
  }

  const games = JSON.parse(require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../data/games.json'), 'utf-8'));
  const game = games.find(x => x.id === gameId);
  if (!game) throw new Error('Game not found in catalog');

  const hostIp = instance.publicIp;
  const appName = game.title; // Sunshine apps.json의 name과 일치해야 함
  
  // Windows 환경(WSL)에서 윈도우용 문라이트를 켜기 위한 설정
  const moonlightBin = process.env.MOONLIGHT_BIN || 'Moonlight.exe';

  try {
    // Spawn moonlight as a detached child process in borderless fullscreen
    const child = spawn(moonlightBin, ['stream', hostIp, appName, '--fullscreen'], {
      detached: true,
      stdio: 'ignore'
    });

    child.unref();

    return { status: 'streaming', game: game.title, pid: child.pid, child: child };
  } catch (error) {
    console.error("Failed to start Moonlight:", error);
    throw new Error("Failed to start streaming client");
  }
}

module.exports = { playStream };
