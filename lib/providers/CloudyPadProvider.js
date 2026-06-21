const { execFile } = require('node:child_process');
const util = require('node:util');
const execFileAsync = util.promisify(execFile);

class CloudyPadProvider {
  constructor() {
    const os = require('node:os');
    const path = require('node:path');
    this.bin = process.env.CLOUDYPAD_BIN || path.join(os.homedir(), '.cloudypad', 'bin', 'cloudypad');
  }

  async runCommand(args) {
    try {
      const { stdout } = await execFileAsync(this.bin, args, { env: { ...process.env, CLOUDYPAD_CONTAINER_NO_TTY: 'true' } });
      return stdout.trim();
    } catch (err) {
      console.error(`[CloudyPad] Error running ${args.join(' ')}:`, err.message);
      // Throw formatted error so frontend can catch it
      throw new Error(`CLI Error: ${err.message}`);
    }
  }

  async listInstances() {
    try {
      const fs = require('node:fs/promises');
      const os = require('node:os');
      const path = require('node:path');
      
      const instancesDir = path.join(os.homedir(), '.cloudypad', 'instances');
      
      let names = [];
      try {
        const dirents = await fs.readdir(instancesDir, { withFileTypes: true });
        names = dirents.filter(d => d.isDirectory()).map(d => d.name);
      } catch (e) {
        // Directory might not exist yet
      }
      
      const instances = [];
      for (const name of names) {
        try {
          const statePath = path.join(os.homedir(), '.cloudypad', 'instances', name, 'state.yml');
          const content = await fs.readFile(statePath, 'utf8');
          
          const typeMatch = content.match(/instanceType:\s*(.+)/);
          const regionMatch = content.match(/region:\s*(.+)/);
          const stateMatch = content.match(/instanceServerState:\s*(.+)/);
          const ipMatch = content.match(/publicIPv4:\s*(.+)/);
          
          const serverState = stateMatch ? stateMatch[1].trim() : 'absent';
          
          instances.push({
            name,
            provider: 'aws',
            status: serverState === 'present' ? 'running' : 'stopped',
            instanceType: typeMatch ? typeMatch[1].trim() : 'g4dn.xlarge',
            region: regionMatch ? regionMatch[1].trim() : 'ap-northeast-2',
            publicIp: ipMatch ? ipMatch[1].trim() : '',
            streamingServer: 'sunshine'
          });
        } catch (e) {
          instances.push({
            name,
            provider: 'aws',
            status: 'stopped',
            instanceType: 'unknown',
            region: 'unknown',
            publicIp: '',
            streamingServer: 'sunshine'
          });
        }
      }
      return instances;
    } catch (err) {
      console.error("listInstances failed:", err);
      return [];
    }
  }

  async getInstance(name) {
    try {
      // cloudypad get <name>
      // For now, we reuse listInstances and filter it
      const list = await this.listInstances();
      return list.find(i => i.name === name) || null;
    } catch (err) {
      console.error(`getInstance failed for ${name}:`, err);
      return null;
    }
  }

  async startInstance(name) {
    // Run start in background so the UI doesn't freeze for 3 minutes
    await this.runCommand(['start', name]);
    return { ok: true, status: 'starting' };
  }

  async stopInstance(name) {
    await this.runCommand(['stop', name]);
    return { ok: true, status: 'stopping' };
  }

  async restartInstance(name) {
    await this.runCommand(['restart', name, '--wait']);
    return { ok: true, status: 'restarting' };
  }

  async destroyInstance(name) {
    await this.runCommand(['destroy', name, '--yes']);
    return { ok: true, status: 'destroyed' };
  }

  async updateInstance(name, options) {
    // options is an array of args like ['--disk-size', '200', '--autostop-timeout', '1800']
    const args = ['update', 'aws', '--name', name, '--yes', ...options];
    await this.runCommand(args);
    return { ok: true, status: 'updated' };
  }
}

module.exports = CloudyPadProvider;
