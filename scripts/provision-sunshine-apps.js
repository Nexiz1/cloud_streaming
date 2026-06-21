const { NodeSSH } = require('node-ssh');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { writeAppsJson } = require('../lib/sunshine');

async function provisionApps() {
  const host = process.env.INSTANCE_HOST;
  const username = process.env.SSH_USER || 'ubuntu';
  const privateKey = process.env.SSH_KEY;
  const appsPath = process.env.SUNSHINE_APPS_PATH || '~/.config/sunshine/apps.json';

  if (!host || !privateKey) {
    console.error("Error: INSTANCE_HOST and SSH_KEY environment variables are required.");
    console.error("Usage: INSTANCE_HOST=<ip> SSH_KEY=</path/to/key.pem> npm run provision:apps");
    process.exit(1);
  }

  const localGamesPath = path.join(__dirname, '../data/games.json');
  const localAppsPath = path.join(os.tmpdir(), 'apps.json');

  console.log(`[1] Generating apps.json from ${localGamesPath}...`);
  try {
    writeAppsJson(localGamesPath, localAppsPath);
    console.log(`[1] Successfully generated local apps.json at ${localAppsPath}`);
  } catch (err) {
    console.error(`[1] Failed to generate apps.json: ${err.message}`);
    process.exit(1);
  }

  const ssh = new NodeSSH();

  console.log(`[2] Connecting to ${username}@${host} via SSH...`);
  try {
    await ssh.connect({
      host: host,
      username: username,
      privateKey: privateKey
    });
    console.log(`[2] SSH connected successfully.`);
  } catch (err) {
    console.error(`[2] SSH connection failed: ${err.message}`);
    process.exit(1);
  }

  console.log(`[3] Uploading apps.json to ${appsPath}...`);
  try {
    await ssh.putFile(localAppsPath, appsPath);
    console.log(`[3] Upload successful.`);
  } catch (err) {
    console.error(`[3] Failed to upload apps.json: ${err.message}`);
    ssh.dispose();
    process.exit(1);
  }

  console.log(`[4] Restarting Sunshine service...`);
  try {
    const result = await ssh.execCommand('systemctl --user restart sunshine || sudo systemctl restart sunshine');
    if (result.code !== 0 && result.stderr) {
      console.warn(`[4] Warning during restart (code ${result.code}): ${result.stderr}`);
    } else {
      console.log(`[4] Sunshine restarted successfully.`);
    }
  } catch (err) {
    console.error(`[4] Failed to execute restart command: ${err.message}`);
  }

  ssh.dispose();
  console.log("Provisioning complete.");
}

provisionApps();
