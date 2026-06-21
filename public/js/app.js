// app.js

// State
let instances = [];
let games = [];
let activeSession = null;
let instancePollInterval = null;
let sessionPollInterval = null;

// DOM Elements
const els = {
  instName: document.getElementById('instName'),
  instBadge: document.getElementById('instBadge'),
  instIp: document.getElementById('instIp'),
  instStartBtn: document.getElementById('instStartBtn'),
  instStopBtn: document.getElementById('instStopBtn'),
  gamesGrid: document.getElementById('gamesGrid'),
  searchInput: document.getElementById('searchInput'),
  toastContainer: document.getElementById('toastContainer'),
  loadingOverlay: document.getElementById('loadingOverlay'),
  loadingStateText: document.getElementById('loadingStateText'),
  loadingDetailText: document.getElementById('loadingDetailText'),
  cancelSessionBtn: document.getElementById('cancelSessionBtn'),
  sessionBanner: document.getElementById('sessionBanner'),
  sessionGameTitle: document.getElementById('sessionGameTitle'),
  sessionStopBtn: document.getElementById('sessionStopBtn'),
};

// Initialization
async function init() {
  bindEvents();
  await fetchGames();
  await pollInstances();
  await pollSession();
  startPolling();
}

// Toast Notifications
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '❌';

  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  els.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('hiding');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Polling Management
function startPolling() {
  if (!instancePollInterval) instancePollInterval = setInterval(pollInstances, 3000);
  if (!sessionPollInterval) sessionPollInterval = setInterval(pollSession, 3000);
}

function stopPolling() {
  if (instancePollInterval) { clearInterval(instancePollInterval); instancePollInterval = null; }
  if (sessionPollInterval) { clearInterval(sessionPollInterval); sessionPollInterval = null; }
}

window.addEventListener('focus', startPolling);
window.addEventListener('blur', stopPolling);

// Instances API
async function pollInstances() {
  try {
    const res = await fetch('/api/instances');
    if (!res.ok) throw new Error('Failed to fetch instances');
    instances = await res.json();
    renderInstancePanel();
  } catch (err) {
    console.error(err);
  }
}

function renderInstancePanel() {
  if (instances.length === 0) {
    els.instName.textContent = 'No Instances';
    els.instBadge.className = 'status-badge status-stopped';
    els.instBadge.textContent = 'Offline';
    els.instIp.style.display = 'none';
    els.instStartBtn.disabled = true;
    els.instStopBtn.disabled = true;
    return;
  }

  // Assuming single-user, pick the first instance
  const inst = instances[0];
  els.instName.textContent = inst.name;
  
  // Status mapping
  const statusClassMap = {
    'running': 'status-running',
    'stopped': 'status-stopped',
    'starting': 'status-starting',
    'stopping': 'status-stopping',
    'error': 'status-error'
  };
  const displayStatus = inst.status.charAt(0).toUpperCase() + inst.status.slice(1);
  els.instBadge.className = `status-badge ${statusClassMap[inst.status] || 'status-stopped'}`;
  els.instBadge.textContent = displayStatus;

  if (inst.status === 'running' && inst.publicIp) {
    els.instIp.textContent = inst.publicIp;
    els.instIp.style.display = 'block';
  } else {
    els.instIp.style.display = 'none';
  }

  els.instStartBtn.disabled = inst.status !== 'stopped';
  els.instStopBtn.disabled = inst.status !== 'running';
}

// Instance Actions
async function handleInstanceAction(action) {
  if (instances.length === 0) return;
  const instName = instances[0].name;
  try {
    els.instStartBtn.disabled = true;
    els.instStopBtn.disabled = true;
    
    const res = await fetch(`/api/instances/${instName}/${action}`, { method: 'POST' });
    const data = await res.json();
    if (data.ok) {
      showToast(`Instance ${action} command sent`, 'success');
      pollInstances();
    } else {
      showToast(`Failed to ${action} instance`, 'error');
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

// Games API
async function fetchGames() {
  try {
    const res = await fetch('/api/games');
    if (!res.ok) throw new Error('Failed to fetch games');
    games = await res.json();
    renderGames();
  } catch (err) {
    console.error(err);
    showToast('Failed to load games', 'error');
  }
}

function renderGames(filterText = '') {
  els.gamesGrid.innerHTML = '';
  const filtered = games.filter(g => g.title.toLowerCase().includes(filterText.toLowerCase()));
  
  filtered.forEach(game => {
    const card = document.createElement('div');
    card.className = 'game-card';
    card.innerHTML = `
      <div class="cover" style="background-image: url('${game.cover || ''}')"></div>
      <div class="info">
        <h3>${game.title}</h3>
        <button class="play-btn" data-id="${game.id}">PLAY</button>
      </div>
    `;
    els.gamesGrid.appendChild(card);
  });
}

// Sessions API
async function pollSession() {
  try {
    const res = await fetch('/api/session');
    if (!res.ok) return;
    const sessions = await res.json();
    
    if (sessions.length > 0) {
      const session = sessions[0];
      
      // If we just became ready while the overlay is showing
      if (session.state === 'ready' && activeSession?.state !== 'ready' && els.loadingOverlay.style.display === 'flex') {
        launchMoonlight(session);
      }
      
      activeSession = session;
      updateSessionUI();
    } else {
      // Session ended
      activeSession = null;
      updateSessionUI();
      if (els.loadingOverlay.style.display === 'flex') {
        hideLoadingOverlay();
      }
    }
  } catch (err) {
    console.error(err);
  }
}

function updateSessionUI() {
  if (activeSession) {
    els.sessionBanner.style.display = 'flex';
    els.sessionGameTitle.textContent = activeSession.gameTitle || 'Game';
    
    if (els.loadingOverlay.style.display === 'flex') {
      els.loadingDetailText.textContent = `State: ${activeSession.state}`;
      if (activeSession.state === 'ready') {
        hideLoadingOverlay();
      }
    }
  } else {
    els.sessionBanner.style.display = 'none';
  }
}

async function startGameSession(gameId) {
  if (instances.length === 0 || instances[0].status !== 'running') {
    showToast('인스턴스를 먼저 시작해주세요 (Instance must be running)', 'error');
    return;
  }

  try {
    showLoadingOverlay('게이밍 PC 준비 중...', 'allocating');
    const res = await fetch('/api/session/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId })
    });
    
    const data = await res.json();
    if (!data.ok) {
      hideLoadingOverlay();
      showToast('Failed to start session', 'error');
      return;
    }
    
    // Poll immediately
    pollSession();
  } catch (err) {
    hideLoadingOverlay();
    showToast(`Error: ${err.message}`, 'error');
  }
}

async function stopSession() {
  if (!activeSession) return;
  try {
    const res = await fetch('/api/session/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instanceName: activeSession.instanceName })
    });
    if (res.ok) {
      showToast('Session stopped', 'success');
      hideLoadingOverlay();
      pollSession();
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

// Moonlight Launch
function launchMoonlight(session) {
  hideLoadingOverlay();
  
  if (window.streaming && typeof window.streaming.launch === 'function') {
    window.streaming.launch({
      host: session.host,
      appName: session.gameTitle,
      instanceName: session.instanceName
    });
    showToast(`Launching ${session.gameTitle} via Moonlight...`, 'success');
  } else {
    console.warn('window.streaming is not available. Browser test mode.');
    showToast(`[Browser Test] Moonlight would launch for ${session.gameTitle} at ${session.host}`, 'info');
  }
}

// UI Helpers
function showLoadingOverlay(title, detail) {
  els.loadingStateText.textContent = title;
  els.loadingDetailText.textContent = detail;
  els.loadingOverlay.style.display = 'flex';
}

function hideLoadingOverlay() {
  els.loadingOverlay.style.display = 'none';
}

// Events Binding
function bindEvents() {
  els.instStartBtn.addEventListener('click', () => handleInstanceAction('start'));
  els.instStopBtn.addEventListener('click', () => handleInstanceAction('stop'));
  
  els.searchInput.addEventListener('input', (e) => {
    renderGames(e.target.value);
  });

  els.gamesGrid.addEventListener('click', (e) => {
    if (e.target.classList.contains('play-btn')) {
      const gameId = e.target.getAttribute('data-id');
      startGameSession(gameId);
    }
  });

  els.cancelSessionBtn.addEventListener('click', () => {
    stopSession();
  });

  els.sessionStopBtn.addEventListener('click', () => {
    stopSession();
  });
}

// Run
document.addEventListener('DOMContentLoaded', init);
