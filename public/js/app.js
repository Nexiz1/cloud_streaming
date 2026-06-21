// app.js

// State
let instances = [];
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
  toastContainer: document.getElementById('toastContainer'),
  loadingOverlay: document.getElementById('loadingOverlay'),
  loadingStateText: document.getElementById('loadingStateText'),
  loadingDetailText: document.getElementById('loadingDetailText'),
  cancelSessionBtn: document.getElementById('cancelSessionBtn'),
  sessionBanner: document.getElementById('sessionBanner'),
  sessionGameTitle: document.getElementById('sessionGameTitle'),
  sessionStopBtn: document.getElementById('sessionStopBtn'),
  instPairBtn: document.getElementById('instPairBtn'),
  pairModal: document.getElementById('pairModal'),
  pairOutput: document.getElementById('pairOutput'),
  closePairModalBtn: document.getElementById('closePairModalBtn'),
  pairStage1: document.getElementById('pairStage1'),
  pairStage2: document.getElementById('pairStage2'),
  nextPairStageBtn: document.getElementById('nextPairStageBtn'),
  backPairStageBtn: document.getElementById('backPairStageBtn'),
  submitPairBtn: document.getElementById('submitPairBtn'),
  pairPinInput: document.getElementById('pairPinInput'),
  startLogsModal: document.getElementById('startLogsModal'),
  startLogsOutput: document.getElementById('startLogsOutput'),
  closeStartLogsBtn: document.getElementById('closeStartLogsBtn'),
};

// Initialization
async function init() {
  bindEvents();
  // Load instance status first so the main screen updates fast.
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
  
  if (inst.status === 'running') {
    els.instIp.style.display = inst.publicIp ? 'block' : 'none';
    els.instIp.textContent = inst.publicIp;
    
    if (inst.ready) {
      els.instBadge.className = 'status-badge status-running';
      els.instBadge.textContent = 'Running (Ready)';
      els.instPairBtn.disabled = false;
    } else {
      // Running but sunshine not deployed yet
      els.instBadge.className = 'status-badge status-starting';
      els.instBadge.textContent = 'Configuring...';
      els.instPairBtn.disabled = true;
    }
  } else {
    els.instBadge.className = `status-badge ${statusClassMap[inst.status] || 'status-stopped'}`;
    els.instBadge.textContent = displayStatus;
    els.instIp.style.display = 'none';
    els.instPairBtn.disabled = true;
  }

  const isTransitioning = ['starting', 'stopping', 'pending'].includes(inst.status);
  
  els.instStartBtn.disabled = isTransitioning || inst.status === 'running';
  els.instStopBtn.disabled = isTransitioning || inst.status === 'stopped' || inst.status === 'absent';
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

async function handlePairAction() {
  if (instances.length === 0) return;
  const inst = instances[0];
  
  // Show Stage 1
  els.pairOutput.textContent = inst.publicIp || inst.host || 'IP를 불러오는 중...';
  els.pairStage1.style.display = 'block';
  els.pairStage2.style.display = 'none';
  els.pairPinInput.value = '';
  els.pairModal.style.display = 'flex';
}

async function submitPairPin() {
  const pin = els.pairPinInput.value.trim();
  if (!pin || pin.length !== 4) {
    showToast('4자리 PIN 번호를 입력해주세요.', 'error');
    return;
  }

  const instName = instances[0].name;
  try {
    els.submitPairBtn.disabled = true;
    els.submitPairBtn.textContent = '페어링 진행 중...';
    
    const res = await fetch(`/api/instances/${instName}/pair`, { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });
    const data = await res.json();
    
    if (data.ok) {
      showToast('페어링이 성공적으로 완료되었습니다! 🎮', 'success');
      els.pairModal.style.display = 'none';
    } else {
      showToast(data.error || '페어링 실패', 'error');
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    els.submitPairBtn.disabled = false;
    els.submitPairBtn.textContent = '페어링 완료';
  }
}

async function handleActionStream(action) {
  if (instances.length === 0) return;
  const instName = instances[0].name;
  try {
    els.instStartBtn.disabled = true;
    els.instStopBtn.disabled = true;
    
    // Show modal and reset logs
    els.startLogsModal.style.display = 'flex';
    
    // Customize text based on action
    const actionText = action === 'start' ? '시작' : '종료';
    const actionDesc = action === 'start' ? '시작하고' : '종료하고';
    els.startLogsModal.querySelector('h2').textContent = `인스턴스 ${actionText} 중...`;
    els.startLogsModal.querySelector('p').textContent = `CloudyPad를 통해 인스턴스를 ${actionDesc} 있습니다. 완료될 때까지 기다려주세요.`;
    
    els.startLogsOutput.textContent = `${action === 'start' ? 'Starting' : 'Stopping'} instance ${instName}...\n`;
    els.closeStartLogsBtn.style.display = 'none';

    const res = await fetch(`/api/instances/${instName}/${action}`, { method: 'POST' });
    if (!res.body) {
      throw new Error('ReadableStream not supported in this browser.');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      let text = decoder.decode(value, { stream: true });
      
      // Remove ANSI escape codes (colors, formatting)
      text = text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
      
      els.startLogsOutput.textContent += text;
      // Auto-scroll to bottom
      els.startLogsOutput.scrollTop = els.startLogsOutput.scrollHeight;
    }

    showToast(`${action} process completed`, 'success');
  } catch (err) {
    els.startLogsOutput.textContent += `\nError: ${err.message}`;
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    els.closeStartLogsBtn.style.display = 'inline-block';
    pollInstances();
  }
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
  els.instStartBtn.addEventListener('click', () => handleActionStream('start'));
  els.instStopBtn.addEventListener('click', () => handleActionStream('stop'));
  els.instPairBtn.addEventListener('click', handlePairAction);
  
  els.closePairModalBtn.addEventListener('click', () => {
    els.pairModal.style.display = 'none';
  });

  els.nextPairStageBtn.addEventListener('click', () => {
    els.pairStage1.style.display = 'none';
    els.pairStage2.style.display = 'block';
    els.pairPinInput.focus();
  });

  els.backPairStageBtn.addEventListener('click', () => {
    els.pairStage2.style.display = 'none';
    els.pairStage1.style.display = 'block';
  });

  els.submitPairBtn.addEventListener('click', submitPairPin);
  
  els.pairPinInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      submitPairPin();
    }
  });

  els.closeStartLogsBtn.addEventListener('click', () => {
    els.startLogsModal.style.display = 'none';
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
