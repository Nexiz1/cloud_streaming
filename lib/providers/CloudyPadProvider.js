const { exec } = require('node:child_process');
const util = require('node:util');
const execAsync = util.promisify(exec);

class CloudyPadProvider {
  constructor() {
    const os = require('node:os');
    const path = require('node:path');
    this.bin = process.env.CLOUDYPAD_BIN || path.join(os.homedir(), '.cloudypad', 'bin', 'cloudypad');

    // --- Status cache (stale-while-revalidate) ---
    // The CloudyPad CLI spins up a container on every call, so each `list`/`get`
    // takes seconds. We cache the parsed result and serve it instantly while
    // refreshing in the background, so the 3s UI polling never blocks.
    this._cache = null;        // last successful instances array
    this._cacheTime = 0;       // when _cache was last refreshed (ms)
    this._inflight = null;     // in-progress refresh promise (single-flight)
    this.CACHE_TTL = 3000;     // ms a cached result is considered "fresh"

    // Persist the last-known state to disk so a fresh app/server start can show
    // it INSTANTLY (then refresh in the background) instead of blocking on the
    // slow first CLI call.
    this._cacheFile = path.join(os.tmpdir(), 'cloudypad_instances_cache.json');
    try {
      const fs = require('node:fs');
      this._cache = JSON.parse(fs.readFileSync(this._cacheFile, 'utf8'));
      this._cacheTime = 0; // serve immediately but mark stale so it refreshes
    } catch (_) { /* no cache file yet — first ever run */ }
  }

  _invalidateCache() {
    this._cacheTime = 0;       // force the next listInstances() to refresh
  }

  async runCommand(args) {
    try {
      const { stdout } = await execAsync(`"${this.bin}" ${args.join(' ')}`, { env: { ...process.env, CLOUDYPAD_CONTAINER_NO_TTY: 'true' } });
      return stdout.trim();
    } catch (err) {
      console.error(`[CloudyPad] Error running ${args.join(' ')}:`, err.message);
      // Throw formatted error so frontend can catch it
      throw new Error(`CLI Error: ${err.message}`);
    }
  }

  spawnCommand(args) {
    const { spawn } = require('node:child_process');
    // Any state-changing command should bust the cache so the next poll is fresh.
    const mutating = ['start', 'stop', 'restart', 'destroy', 'create', 'update'];
    if (args.length && mutating.includes(args[0])) this._invalidateCache();
    return spawn(this.bin, args, {
      env: { ...process.env, CLOUDYPAD_CONTAINER_NO_TTY: 'true' }
    });
  }

  async listInstances() {
    const age = Date.now() - this._cacheTime;

    // Fresh cache: return instantly.
    if (this._cache && age < this.CACHE_TTL) {
      return this._cache;
    }

    // Stale cache: serve it immediately and refresh in the background.
    if (this._cache) {
      this._refreshInstances(); // fire-and-forget (single-flight inside)
      return this._cache;
    }

    // No cache yet (first load): must wait for the fetch to complete.
    return this._refreshInstances();
  }

  _refreshInstances() {
    // Single-flight: if a refresh is already running, reuse it so overlapping
    // polls don't spawn multiple concurrent CLI runs.
    if (this._inflight) return this._inflight;

    this._inflight = this._fetchAllInstances()
      .then((list) => {
        this._cache = list;
        this._cacheTime = Date.now();
        return list;
      })
      .catch((err) => {
        console.error('listInstances refresh failed:', err);
        return this._cache || []; // keep serving the old cache on error
      })
      .finally(() => { this._inflight = null; });

    return this._inflight;
  }

  async _fetchAllInstances() {
    const listStdout = await this.runCommand(['list']);
    const names = listStdout.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.toLowerCase().includes('name') && !l.toLowerCase().includes('error'));

    // Fetch every instance's state in parallel instead of one-by-one.
    return Promise.all(names.map(name => this._getOne(name)));
  }

  async _getOne(name) {
    try {
      // cloudypad get <name> returns the full accurate JSON state
      const stdout = await this.runCommand(['get', name]);

      // Extract JSON part in case there are log prefixes
      const jsonStart = stdout.indexOf('{');
      const jsonEnd = stdout.lastIndexOf('}');
      if (jsonStart === -1 || jsonEnd === -1) throw new Error('No JSON output');

      const data = JSON.parse(stdout.substring(jsonStart, jsonEnd + 1));

      let serverStatus = data.status?.serverStatus || 'stopped';
      // Map absent or pending to stopped so the start button enables
      if (serverStatus === 'absent') serverStatus = 'stopped';

      return {
        name,
        provider: data.provision?.provider || 'aws',
        status: serverStatus,
        ready: data.status?.ready || false,
        configured: data.status?.configured || false,
        provisioned: data.status?.provisioned || false,
        instanceType: data.provision?.input?.instanceType || 'unknown',
        region: data.provision?.input?.region || 'unknown',
        publicIp: data.provision?.output?.publicIPv4 || '',
        streamingServer: data.configuration?.input?.sunshine ? 'sunshine' : 'unknown'
      };
    } catch (e) {
      console.warn(`[CloudyPad] Failed to parse CLI state for ${name}, falling back to default. Error: ${e.message}`);
      return {
        name,
        provider: 'aws',
        status: 'stopped',
        ready: false,
        instanceType: 'unknown',
        region: 'unknown',
        publicIp: '',
        streamingServer: 'sunshine'
      };
    }
  }

  async getInstance(name) {
    try {
      // Query a single instance directly instead of listing everything.
      return await this._getOne(name);
    } catch (err) {
      console.error(`getInstance failed for ${name}:`, err);
      return null;
    }
  }

  async startInstance(name) {
    this._invalidateCache();
    // Run start in background so the UI doesn't freeze for 3 minutes
    await this.runCommand(['start', name]);
    this._invalidateCache();
    return { ok: true, status: 'starting' };
  }

  async stopInstance(name) {
    this._invalidateCache();
    await this.runCommand(['stop', name]);
    this._invalidateCache();
    return { ok: true, status: 'stopping' };
  }

  async pairInstance(name) {
    // cloudypad pair uses an interactive inquirer prompt (manual vs automatic).
    // We must use spawn with stdin to programmatically select "manual" mode,
    // which outputs the moonlight pair command for the user to run.
    const { spawn } = require('node:child_process');
    
    return new Promise((resolve, reject) => {
      let output = '';
      let hasSelectedOption = false;
      
      const child = spawn(this.bin, ['pair', name], {
        env: { ...process.env, CLOUDYPAD_CONTAINER_NO_TTY: 'true' },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      child.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        
        // When we see the interactive prompt, send arrow-up to select "manual" then Enter
        if (!hasSelectedOption && text.includes('automatic')) {
          hasSelectedOption = true;
          // Small delay to let the prompt fully render before sending input
          setTimeout(() => {
            child.stdin.write('\x1b[A'); // Arrow Up to move to "manual"
            setTimeout(() => {
              child.stdin.write('\n');   // Enter to confirm selection
            }, 200);
          }, 300);
        }
      });

      child.stderr.on('data', (data) => {
        output += data.toString();
      });

      child.on('close', (code) => {
        // Strip ANSI escape codes for clean display
        const cleanOutput = output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b\[\?[0-9]*[a-zA-Z]/g, '').trim();
        
        if (code === 0) {
          resolve({ ok: true, output: cleanOutput });
        } else {
          // Even on non-zero exit, the output may contain useful pairing info
          // (e.g. the moonlight pair command was shown before an unrelated error)
          const pairCommandMatch = cleanOutput.match(/moonlight\s+pair\s+[\d.]+\s+--pin\s+\d+/);
          if (pairCommandMatch) {
            resolve({ ok: true, output: cleanOutput });
          } else {
            reject(new Error(`Pair failed (exit code ${code}): ${cleanOutput.substring(0, 500)}`));
          }
        }
      });

      child.on('error', (err) => {
        reject(new Error(`Failed to start pair process: ${err.message}`));
      });
      
      // Safety timeout: if nothing happens in 60 seconds, kill the process
      setTimeout(() => {
        if (!child.killed) {
          child.kill();
          reject(new Error('Pair process timed out after 60 seconds'));
        }
      }, 60000);
    });
  }

  async restartInstance(name) {
    this._invalidateCache();
    await this.runCommand(['restart', name, '--wait']);
    this._invalidateCache();
    return { ok: true, status: 'restarting' };
  }

  async destroyInstance(name) {
    await this.runCommand(['destroy', name, '--yes']);
    this._invalidateCache();
    return { ok: true, status: 'destroyed' };
  }

  async updateInstance(name, options) {
    // options is an array of args like ['--disk-size', '200', '--autostop-timeout', '1800']
    const args = ['update', 'aws', '--name', name, '--yes', ...options];
    await this.runCommand(args);
    this._invalidateCache();
    return { ok: true, status: 'updated' };
  }
}

module.exports = CloudyPadProvider;
