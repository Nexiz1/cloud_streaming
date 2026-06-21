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
      const stdout = await this.runCommand(['list']);
      
      // Best-effort parsing:
      // Try JSON first if cloudypad supports it
      try {
        const data = JSON.parse(stdout);
        return Array.isArray(data) ? data : [data];
      } catch (e) {
        // Fallback to text parsing
        const lines = stdout.split('\n').filter(l => l.trim().length > 0);
        // Skip header if it exists
        if (lines.length > 0 && lines[0].toLowerCase().includes('name')) {
            lines.shift();
        }
        
        return lines.map(line => {
          const parts = line.split(/\s+/);
          return {
            name: parts[0] || 'unknown',
            provider: parts[1] || 'aws',
            status: parts[2] || 'stopped',
            instanceType: parts[3] || 'g4dn.xlarge',
            region: parts[4] || 'ap-northeast-2',
            publicIp: parts[5] || '',
            streamingServer: 'sunshine'
          };
        });
      }
    } catch (err) {
      console.error("listInstances failed:", err);
      // Return empty instead of crashing
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
    await this.runCommand(['start', name, '--wait', '--timeout', '180']);
    return { ok: true, status: 'running' };
  }

  async stopInstance(name) {
    await this.runCommand(['stop', name, '--wait']);
    return { ok: true, status: 'stopped' };
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
