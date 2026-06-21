const provider = require('./providers');

const MAX_SLOTS = parseInt(process.env.MAX_SLOTS || "1", 10);
const IDLE_TIMEOUT_MIN = parseInt(process.env.IDLE_TIMEOUT_MIN || "10", 10);
const MAX_SESSION_MIN = parseInt(process.env.MAX_SESSION_MIN || "120", 10);

const sessions = new Map();
const inFlightStarts = new Set();

class SessionManager {
  async getAvailableSlot() {
    const instances = await provider.listInstances();
    const available = instances.find(inst => 
      (inst.status === 'stopped' || inst.status === 'running') && 
      !sessions.has(inst.name) && 
      !inFlightStarts.has(inst.name)
    );
    return available;
  }

  getSessions() {
    return Array.from(sessions.values()).map(s => ({
      instanceName: s.instanceName,
      gameId: s.gameId,
      state: s.state,
      startedAt: s.startedAt,
      gameTitle: s.gameTitle,
      host: s.host
    }));
  }

  async startSession(gameId, gameTitle) {
    if (sessions.size >= MAX_SLOTS) {
      throw new Error('NO_CAPACITY');
    }

    const slot = await this.getAvailableSlot();
    if (!slot) {
      throw new Error('NO_CAPACITY');
    }

    const instanceName = slot.name;
    
    // Prevent race conditions between the async listInstances check and now
    if (inFlightStarts.has(instanceName) || sessions.has(instanceName)) {
      throw new Error('NO_CAPACITY');
    }
    
    inFlightStarts.add(instanceName);

    const session = {
      instanceName,
      gameId,
      gameTitle,
      state: 'allocating',
      startedAt: Date.now(),
      timers: {},
      host: null
    };

    sessions.set(instanceName, session);

    // Run async lifecycle
    this._runSessionLifecycle(session).catch(err => {
      console.error(`[SessionManager] Error in session lifecycle for ${instanceName}:`, err);
      this.stopSession(instanceName);
    });

    return session;
  }

  async _runSessionLifecycle(session) {
    const { instanceName, gameId, gameTitle } = session;
    
    try {
      const inst = await provider.getInstance(instanceName);
      
      // Only start if it's currently stopped
      if (inst && inst.status === 'stopped') {
        session.state = 'starting';
        await provider.startInstance(instanceName);
      } else {
        session.state = 'starting'; // Will quickly transition to ready in the polling loop
      }

      // Poll until ready
      let isReady = false;
      const startTime = Date.now();
      const maxWait = 5 * 60 * 1000;
      
      while (!isReady) {
        if (Date.now() - startTime > maxWait) {
          throw new Error('Timeout waiting for instance to start');
        }
        
        const currentInst = await provider.getInstance(instanceName);
        if (!currentInst) throw new Error('Instance disappeared during start');
        
        if (currentInst.status === 'running' && currentInst.ready === true) {
          isReady = true;
          session.host = currentInst.publicIp; // Save the host IP
        } else if (currentInst.status === 'error') {
          throw new Error('Instance entered error state');
        } else {
          await new Promise(r => setTimeout(r, 3000));
        }
      }

      session.state = 'ready';

      // Schedule timers (idle backstop)
      const idleMs = IDLE_TIMEOUT_MIN * 60 * 1000;
      const maxMs = MAX_SESSION_MIN * 60 * 1000;

      session.timers.idle = setTimeout(() => {
        console.log(`[SessionManager] Idle timeout reached for ${instanceName}.`);
        this.stopSession(instanceName);
      }, idleMs);

      session.timers.max = setTimeout(() => {
        console.log(`[SessionManager] Max session limit reached for ${instanceName}.`);
        this.stopSession(instanceName);
      }, maxMs);

    } finally {
      inFlightStarts.delete(instanceName);
    }
  }

  async stopSession(instanceName) {
    const session = sessions.get(instanceName);
    if (!session) return;

    session.state = 'stopping';
    
    if (session.timers) {
      if (session.timers.idle) clearTimeout(session.timers.idle);
      if (session.timers.max) clearTimeout(session.timers.max);
    }

    try {
      await provider.stopInstance(instanceName);
    } catch (err) {
      console.error(`[SessionManager] Failed to stop instance ${instanceName}:`, err);
    }

    sessions.delete(instanceName);
    inFlightStarts.delete(instanceName);
    console.log(`[SessionManager] Session for ${instanceName} stopped.`);
  }
}

module.exports = new SessionManager();
