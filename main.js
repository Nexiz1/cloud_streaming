const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const { spawn, exec } = require('node:child_process');
const http = require('node:http');

let mainWindow;
let serverProc = null;
let backendShutDown = false;

function execPromise(command, statusTitle) {
  return new Promise((resolve) => {
    const child = exec(command);
    let output = '';
    let errorOutput = '';

    if (statusTitle) {
      child.stdout.on('data', (data) => {
        const text = data.toString().trim();
        if (text) {
          output += text + '\n';
          const lines = text.split('\n');
          updateProgress(statusTitle, lines[lines.length - 1].substring(0, 100));
        }
      });
      child.stderr.on('data', (data) => {
        const text = data.toString().trim();
        if (text) {
          errorOutput += text + '\n';
          const lines = text.split('\n');
          updateProgress(statusTitle, lines[lines.length - 1].substring(0, 100));
        }
      });
    } else {
      child.stdout.on('data', data => { output += data.toString(); });
      child.stderr.on('data', data => { errorOutput += data.toString(); });
    }

    child.on('exit', (code) => {
      if (code === 0) {
        resolve({ ok: true, output });
      } else {
        resolve({ ok: false, error: errorOutput || `Process failed with code ${code}` });
      }
    });

    child.on('error', (err) => {
      resolve({ ok: false, error: err.message });
    });
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function updateProgress(status, detail) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('setup-progress', { status, detail });
  }
  console.log(`[Setup] ${status} - ${detail}`);
}

async function runSetupSequence() {
  updateProgress('System Check', 'Checking if WSL is installed and ready...');
  const wslCheck = await execPromise('wsl echo "wsl-ok"');
  if (!wslCheck.ok || !wslCheck.output.includes('wsl-ok')) {
    updateProgress('CRITICAL ERROR', 'WSL is not installed or not set up. Please open PowerShell as Admin, run "wsl --install", and restart your PC.');
    return false;
  }

  updateProgress('Step 1/4: System Check', 'Checking if Node.js is installed in WSL...');
  const nodeCheck = await execPromise('wsl node -v');
  if (!nodeCheck.ok) {
    updateProgress('Step 1/4: System Check', 'Installing Node.js & npm in WSL (root)...');
    const res = await execPromise('wsl -u root apt-get update && wsl -u root apt-get install -y curl nodejs npm', 'Step 1/4: System Check');
    if (!res.ok) {
      updateProgress('CRITICAL ERROR', 'Failed to install Node.js: ' + res.error);
      return false;
    }
    // Verify installation
    const verifyNode = await execPromise('wsl node -v');
    if (!verifyNode.ok) {
      updateProgress('CRITICAL ERROR', 'Node.js installation completed but binary not found. Please install manually.');
      return false;
    }
  }

  updateProgress('Step 2/4: CloudyPad CLI', 'Checking if CloudyPad is installed...');
  const cpCheck = await execPromise('wsl bash -c "CLOUDYPAD_CONTAINER_NO_TTY=true ~/.cloudypad/bin/cloudypad --version"');
  if (!cpCheck.ok) {
    updateProgress('Step 2/4: CloudyPad CLI', 'Downloading and installing CloudyPad...');
    // Use bash -c to pipe curl to bash safely
    const res = await execPromise('wsl bash -c "curl -fsSL https://raw.githubusercontent.com/PierreBeucher/cloudypad/master/install.sh | bash"', 'Step 2/4: CloudyPad CLI');
    if (!res.ok) {
      updateProgress('CRITICAL ERROR', 'Failed to install CloudyPad: ' + res.error);
      return false;
    }
    // Verify installation (some scripts exit with 0 even if they fail internally)
    const verifyCp = await execPromise('wsl bash -c "CLOUDYPAD_CONTAINER_NO_TTY=true ~/.cloudypad/bin/cloudypad --version"');
    if (!verifyCp.ok) {
      updateProgress('CRITICAL ERROR', 'CloudyPad installation seemed to finish, but binary is missing. Check your network or install script.');
      return false;
    }
  }

  updateProgress('Step 3/4: Backend Modules', 'Checking dependencies...');
  const nmCheck = await execPromise('wsl test -d node_modules');
  if (!nmCheck.ok) {
    updateProgress('Step 3/4: Backend Modules', 'Running npm install in WSL...');
    const res = await execPromise('wsl npm install', 'Step 3/4: Backend Modules');
    if (!res.ok) {
      updateProgress('CRITICAL ERROR', 'Failed to install npm modules: ' + res.error);
      return false;
    }
  }

  updateProgress('Step 4/4: Booting Server', 'Starting Express on port 3000...');
  serverProc = spawn('wsl', ['node', 'server/server.js']);

  serverProc.stdout.on('data', data => console.log(`[Server] ${data.toString().trim()}`));
  serverProc.stderr.on('data', data => console.error(`[Server Error] ${data.toString().trim()}`));

  updateProgress('Waiting for Server...', 'Checking http://localhost:3000');
  
  // Poll until server is up
  for (let i = 0; i < 30; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get('http://localhost:3000/api/hello', (res) => {
          if (res.statusCode === 200) resolve();
          else reject();
        });
        req.on('error', reject);
      });
      console.log("Server is up!");
      return true;
    } catch (e) {
      await delay(1000);
    }
  }
  return false;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // 1. Load Loading Screen
  await mainWindow.loadFile('public/loading.html');

  // 2. Run Setup
  const setupOk = await runSetupSequence();

  // 3. Load Main App
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
  if (setupOk) {
    // Force clear cache so frontend updates are always loaded
    await mainWindow.webContents.session.clearCache();
    mainWindow.loadURL(backendUrl).catch(err => {
      console.error("Failed to load backend:", err.message);
    });
  } else {
    updateProgress('Error', 'Server failed to start. Check console logs.');
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

function shutdownBackend() {
  if (backendShutDown) return;
  backendShutDown = true;

  // 1. Graceful: ask the in-WSL node server to exit itself (process.exit in /api/shutdown)
  try {
    const req = http.request('http://localhost:3000/api/shutdown', { method: 'POST', timeout: 1000 });
    req.on('error', () => {});
    req.end();
  } catch (_) {}

  // 2. Force: kill the spawned WSL wrapper process tree
  if (serverProc && serverProc.pid && !serverProc.killed) {
    try {
      if (process.platform === 'win32') {
        exec(`taskkill /pid ${serverProc.pid} /T /F`, () => {});
      } else {
        serverProc.kill('SIGKILL');
      }
    } catch (_) {}
  }

  // 3. Belt-and-suspenders: kill any node still running the server inside WSL
  try {
    exec('wsl pkill -f "server/server.js"', () => {});
  } catch (_) {}

  serverProc = null;
}

app.on('window-all-closed', function () {
  shutdownBackend();
  if (process.platform !== 'darwin') {
    // give the graceful HTTP/kill calls a moment, then quit
    setTimeout(() => app.quit(), 500);
  }
});

// Catch every other exit path (Cmd+Q, app.quit(), process signals, crashes)
app.on('before-quit', shutdownBackend);
app.on('will-quit', shutdownBackend);
process.on('exit', shutdownBackend);
process.on('SIGINT', () => { shutdownBackend(); process.exit(0); });
process.on('SIGTERM', () => { shutdownBackend(); process.exit(0); });

ipcMain.handle('moonlight:launch', async (event, { host, appName, instanceName }) => {
  console.log(`[Electron Main] Launching Moonlight for "${appName}" on ${host} (${instanceName})`);

  const moonlightBin = process.env.MOONLIGHT_BIN || 'moonlight';

  try {
    const child = spawn(moonlightBin, ['stream', host, appName, '--fullscreen'], {
      detached: true,
      stdio: 'ignore'
    });

    child.on('exit', (code) => {
      console.log(`[Electron Main] Moonlight exited with code ${code}. Stopping session ${instanceName}...`);
      stopSession(instanceName);
    });

    child.on('error', (err) => {
      console.error(`[Electron Main] Failed to spawn moonlight:`, err);
    });

    child.unref();
    return { ok: true, pid: child.pid };
  } catch (error) {
    console.error("[Electron Main] Exception spawning moonlight:", error);
    throw new Error("Failed to start Moonlight");
  }
});

function stopSession(instanceName) {
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
  const req = http.request(`${backendUrl}/api/session/stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, (res) => {
    console.log(`[Electron Main] Auto-stop call returned status ${res.statusCode}`);
  });
  req.on('error', (e) => console.error("[Electron Main] Failed to call backend stopSession:", e));
  req.write(JSON.stringify({ instanceName }));
  req.end();
}
