// settings.js

// DOM Elements
const els = {
  toastContainer: document.getElementById('toastContainer'),
  
  // Navigation
  navItems: document.querySelectorAll('.nav-item'),
  tabContents: document.querySelectorAll('.tab-content'),

  // Tab 3: AWS Config
  cloudypadStatus: document.getElementById('cloudypadStatus'),
  cloudypadHelp: document.getElementById('cloudypadHelp'),
  refreshStatusBtn: document.getElementById('refreshStatusBtn'),
  btnOpenAwsModal: document.getElementById('btnOpenAwsModal'),
  awsModal: document.getElementById('awsModal'),
  btnCloseAwsModal: document.getElementById('btnCloseAwsModal'),
  awsTableBody: document.getElementById('awsTableBody'),
  awsAuthForm: document.getElementById('awsAuthForm'),
  awsProfileName: document.getElementById('awsProfileName'),
  accessKeyId: document.getElementById('accessKeyId'),
  secretAccessKey: document.getElementById('secretAccessKey'),
  region: document.getElementById('region'),
  sessionToken: document.getElementById('sessionToken'),
  awsInlineError: document.getElementById('awsInlineError'),
  awsInlineSuccess: document.getElementById('awsInlineSuccess'),

  // Tab 1: Instances
  instancesTableBody: document.getElementById('instancesTableBody'),
  btnOpenCreateModal: document.getElementById('btnOpenCreateModal'),

  // Tab 2: Profiles
  profilesTableBody: document.getElementById('profilesTableBody'),
  profileForm: document.getElementById('profileForm'),
  profName: document.getElementById('profName'),
  profType: document.getElementById('profType'),
  profRegion: document.getElementById('profRegion'),
  profZone: document.getElementById('profZone'),
  profRootDisk: document.getElementById('profRootDisk'),
  profDisk: document.getElementById('profDisk'),
  profCost: document.getElementById('profCost'),
  profTimeout: document.getElementById('profTimeout'),
  profSpot: document.getElementById('profSpot'),
  profAutoStop: document.getElementById('profAutoStop'),
  profVpc: document.getElementById('profVpc'),

  // Modals
  configModal: document.getElementById('configModal'),
  btnCloseConfigModal: document.getElementById('btnCloseConfigModal'),
  configModalTitle: document.getElementById('configModalTitle'),
  createInstanceForm: document.getElementById('createInstanceForm'),
  configMode: document.getElementById('configMode'),
  profileSelectorGroup: document.getElementById('profileSelectorGroup'),
  createProfileSelect: document.getElementById('createProfileSelect'),
  
  createInstName: document.getElementById('createInstName'),
  configInstType: document.getElementById('configInstType'),
  configRegion: document.getElementById('configRegion'),
  configZone: document.getElementById('configZone'),
  configRootDisk: document.getElementById('configRootDisk'),
  configDataDisk: document.getElementById('configDataDisk'),
  configTimeout: document.getElementById('configTimeout'),
  configCost: document.getElementById('configCost'),
  configSpot: document.getElementById('configSpot'),
  configAutoStop: document.getElementById('configAutoStop'),
  configVpcGroup: document.getElementById('configVpcGroup'),
  configVpc: document.getElementById('configVpc'),
  configSubmitBtn: document.getElementById('configSubmitBtn'),

  // Logs Modal
  logsModal: document.getElementById('logsModal'),
  creationLogs: document.getElementById('creationLogs'),
  closeLogsBtn: document.getElementById('closeLogsBtn'),
};

let profiles = [];
let currentInstances = [];

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

// Initialization
async function init() {
  bindEvents();
  await Promise.all([
    loadStatus(),
    loadInstances(),
    loadProfiles(),
    loadAwsProfiles()
  ]);
}

// Tab Switching
function switchTab(targetId) {
  els.navItems.forEach(item => {
    if (item.getAttribute('data-target') === targetId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  els.tabContents.forEach(content => {
    if (content.id === targetId) {
      content.classList.add('active');
    } else {
      content.classList.remove('active');
    }
  });
}

// Prereqs & AWS Config
async function loadStatus() {
  try {
    const res = await fetch('/api/setup/prereqs');
    if (!res.ok) throw new Error('Failed to fetch status');
    const data = await res.json();
    
    if (data.cloudypad) {
      els.cloudypadStatus.innerHTML = '✅ CLI Installed';
      els.cloudypadStatus.style.color = 'var(--success-color)';
      els.cloudypadHelp.style.display = 'none';
    } else {
      els.cloudypadStatus.innerHTML = '❌ CLI Not Found';
      els.cloudypadStatus.style.color = 'var(--error-color)';
      els.cloudypadHelp.style.display = 'block';
    }
  } catch (err) {
    showToast('Failed to load prerequisite status', 'error');
  }
}

async function loadAwsProfiles() {
  try {
    const res = await fetch('/api/setup/aws-profiles');
    const profiles = await res.json();
    els.awsTableBody.innerHTML = '';
    
    if (profiles.length === 0) {
      els.awsTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No credentials found. Add one!</td></tr>';
      return;
    }

    profiles.forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${p.profileName}</td>
        <td>${p.accessKeyId.substring(0, 4)}...</td>
        <td>${p.region}</td>
        <td>${p.isActive ? '<span class="status-badge running">Active</span>' : '<span class="status-badge stopped">Inactive</span>'}</td>
        <td class="action-buttons">
          <button class="btn btn-sm btn-start" onclick="setAwsProfileActive('${p.profileName}')" ${p.isActive ? 'disabled' : ''}>Set Active</button>
          <button class="btn btn-sm btn-destroy" onclick="deleteAwsProfile('${p.profileName}')">Delete</button>
        </td>
      `;
      els.awsTableBody.appendChild(tr);
    });
  } catch (err) {
    els.awsTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: red;">Failed to load credentials</td></tr>';
  }
}

async function setAwsProfileActive(name) {
  try {
    const res = await fetch(`/api/setup/aws-profiles/${name}/active`, { method: 'POST' });
    const data = await res.json();
    if (data.ok) {
      showToast('AWS Credential Activated', 'success');
      loadAwsProfiles();
    } else {
      showToast('Error: ' + data.error, 'error');
    }
  } catch (err) {
    showToast('Failed to set active', 'error');
  }
}

async function deleteAwsProfile(name) {
  if (!confirm(`Are you sure you want to delete credential '${name}'?`)) return;
  try {
    const res = await fetch(`/api/setup/aws-profiles/${name}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.ok) {
      showToast('AWS Credential Deleted', 'success');
      loadAwsProfiles();
    } else {
      showToast('Error: ' + data.error, 'error');
    }
  } catch (err) {
    showToast('Failed to delete', 'error');
  }
}

async function handleAwsSubmit(e) {
  e.preventDefault();
  els.awsInlineError.style.display = 'none';
  els.awsInlineSuccess.style.display = 'none';
  
  const payload = {
    profileName: els.awsProfileName.value.trim(),
    accessKeyId: els.accessKeyId.value.trim(),
    secretAccessKey: els.secretAccessKey.value.trim(),
    region: els.region.value,
    sessionToken: els.sessionToken.value.trim()
  };

  try {
    const submitBtn = els.awsAuthForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Testing & Adding...';

    const res = await fetch('/api/setup/aws-profiles/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    
    submitBtn.disabled = false;
    submitBtn.textContent = 'Verify & Add';

    if (data.ok) {
      els.awsInlineSuccess.innerHTML = `✅ ${data.profile.arn} 등록 성공!`;
      els.awsInlineSuccess.style.display = 'block';
      setTimeout(() => {
        closeAwsModal();
        loadAwsProfiles();
      }, 1000);
    } else {
      els.awsInlineError.innerHTML = '❌ ' + (data.error || 'Verification failed');
      els.awsInlineError.style.display = 'block';
    }
  } catch (err) {
    els.awsInlineError.textContent = `Error: ${err.message}`;
    els.awsInlineError.style.display = 'block';
    els.awsAuthForm.querySelector('button[type="submit"]').disabled = false;
  }
}

// Instances
async function loadInstances() {
  try {
    const res = await fetch('/api/instances');
    if (!res.ok) throw new Error('Failed to fetch instances');
    currentInstances = await res.json();
    
    els.instancesTableBody.innerHTML = '';
    
    if (currentInstances.length === 0) {
      els.instancesTableBody.innerHTML = '<tr><td colspan="5">No instances found</td></tr>';
      return;
    }

    currentInstances.forEach(inst => {
      const tr = document.createElement('tr');
      const startDisabled = inst.status !== 'stopped' ? 'disabled' : '';
      const stopDisabled = inst.status !== 'running' ? 'disabled' : '';
      
      tr.innerHTML = `
        <td><strong>${inst.name}</strong></td>
        <td>${inst.instanceType || '-'}</td>
        <td>${inst.region || '-'}</td>
        <td><span class="status-badge status-${inst.status}">${inst.status}</span></td>
        <td>
          <button class="btn btn-start" style="padding: 4px 8px; font-size: 0.8rem; margin-right: 5px;" data-action="start" data-name="${inst.name}" ${startDisabled}>Start</button>
          <button class="btn btn-stop" style="padding: 4px 8px; font-size: 0.8rem; margin-right: 5px;" data-action="stop" data-name="${inst.name}" ${stopDisabled}>Stop</button>
          <button class="btn btn-primary" style="padding: 4px 8px; font-size: 0.8rem; margin-right: 5px;" data-action="edit" data-name="${inst.name}">Edit</button>
          <button class="btn btn-stop" style="padding: 4px 8px; font-size: 0.8rem; background: var(--error-color);" data-action="destroy" data-name="${inst.name}">🗑️</button>
        </td>
      `;
      els.instancesTableBody.appendChild(tr);
    });
  } catch (err) {
    els.instancesTableBody.innerHTML = '<tr><td colspan="5" style="color: var(--error-color);">Failed to load instances</td></tr>';
  }
}

async function handleTableAction(e) {
  if (e.target.tagName !== 'BUTTON') return;
  const action = e.target.getAttribute('data-action');
  const name = e.target.getAttribute('data-name');
  if (!action || !name) return;

  if (action === 'edit') {
    openEditModal(name);
    return;
  }

  if (action === 'destroy') {
    if (!confirm(`Are you sure you want to completely DELETE instance '${name}'? This cannot be undone.`)) {
      return;
    }
  }

  try {
    e.target.disabled = true;
    const res = await fetch(`/api/instances/${name}/${action}`, { method: 'POST' });
    const data = await res.json();
    if (data.ok) {
      showToast(`${action} command sent for ${name}`, 'success');
      setTimeout(loadInstances, 1500);
    } else {
      showToast(`Failed to ${action} ${name}`, 'error');
      e.target.disabled = false;
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
    e.target.disabled = false;
  }
}

// Profiles API
async function loadProfiles() {
  try {
    const res = await fetch('/api/setup/profiles');
    if (!res.ok) throw new Error('Failed to fetch profiles');
    profiles = await res.json();
    renderProfiles();
  } catch (err) {
    els.profilesTableBody.innerHTML = '<tr><td colspan="5" style="color: var(--error-color);">Failed to load profiles</td></tr>';
  }
}

async function saveProfiles() {
  try {
    const res = await fetch('/api/setup/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profiles)
    });
    if (!res.ok) throw new Error('Failed to save profiles');
    renderProfiles();
    showToast('Profiles updated', 'success');
  } catch (err) {
    showToast(`Error saving profiles: ${err.message}`, 'error');
  }
}

function renderProfiles() {
  els.profilesTableBody.innerHTML = '';
  els.createProfileSelect.innerHTML = '<option value="" disabled selected>Select a profile to autofill...</option>';

  if (profiles.length === 0) {
    els.profilesTableBody.innerHTML = '<tr><td colspan="5">No profiles saved. Add one below.</td></tr>';
    return;
  }

  profiles.forEach((p, index) => {
    // Add to table
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${p.name}</strong></td>
      <td>${p.type}<br><small style="color:var(--text-muted)">${p.region}</small></td>
      <td>${p.disk}</td>
      <td>$${p.costLimit}</td>
      <td>
        <button class="btn btn-stop" style="padding: 4px 8px; font-size: 0.8rem;" data-index="${index}">Delete</button>
      </td>
    `;
    els.profilesTableBody.appendChild(tr);

    // Add to dropdown
    const opt = document.createElement('option');
    opt.value = index;
    opt.textContent = `${p.name} (${p.type}, ${p.region})`;
    els.createProfileSelect.appendChild(opt);
  });
}

function handleAddProfile(e) {
  e.preventDefault();
  const newProfile = {
    name: els.profName.value.trim(),
    type: els.profType.value.trim(),
    region: els.profRegion.value,
    zone: els.profZone.value.trim(),
    rootDisk: parseInt(els.profRootDisk.value, 10) || 30,
    disk: parseInt(els.profDisk.value, 10),
    costLimit: parseInt(els.profCost.value, 10),
    timeout: parseInt(els.profTimeout.value, 10) || 600,
    spot: els.profSpot.checked,
    autostop: els.profAutoStop.checked,
    vpc: els.profVpc.checked
  };

  profiles.push(newProfile);
  saveProfiles();
  els.profileForm.reset();
  
  // reset defaults
  els.profType.value = 'g4dn.xlarge';
  els.profRegion.value = 'ap-northeast-2';
  els.profRootDisk.value = '30';
  els.profDisk.value = '100';
  els.profCost.value = '40';
  els.profTimeout.value = '600';
  els.profSpot.checked = false;
  els.profAutoStop.checked = true;
  els.profVpc.checked = true;
}

function handleDeleteProfile(e) {
  if (e.target.tagName !== 'BUTTON') return;
  const index = e.target.getAttribute('data-index');
  if (index !== null) {
    profiles.splice(index, 1);
    saveProfiles();
  }
}

// Unified Config Modal (Create & Edit)
function openCreateModal() {
  els.createInstanceForm.reset();
  els.configMode.value = 'create';
  els.configModalTitle.textContent = 'Deploy New Instance';
  els.configSubmitBtn.textContent = 'Deploy';
  
  // Enable fields
  els.createInstName.disabled = false;
  els.configRegion.disabled = false;
  els.configInstType.disabled = false;
  els.configZone.disabled = false;
  els.configVpc.disabled = false;
  
  els.profileSelectorGroup.style.display = 'flex';
  els.configVpcGroup.style.display = 'flex';
  
  // Defaults
  els.configInstType.value = 'g4dn.xlarge';
  els.configRootDisk.value = '30';
  els.configDataDisk.value = '100';
  els.configTimeout.value = '600';
  els.configCost.value = '40';
  els.configAutoStop.checked = true;
  els.configVpc.checked = true;
  els.configSpot.checked = false;

  els.configModal.style.display = 'flex';
}

function openEditModal(instanceName) {
  els.createInstanceForm.reset();
  els.configMode.value = 'edit';
  els.configModalTitle.textContent = `Edit Instance: ${instanceName}`;
  els.configSubmitBtn.textContent = 'Update Instance';
  
  // Find instance info
  const inst = currentInstances.find(i => i.name === instanceName);
  if (!inst) return;

  // Pre-fill
  els.createInstName.value = inst.name;
  els.configRegion.value = inst.region || 'ap-northeast-2';
  els.configInstType.value = inst.instanceType || 'g4dn.xlarge';
  
  // Disable fields that shouldn't be edited
  els.createInstName.disabled = true;
  els.configRegion.disabled = true;
  els.configInstType.disabled = true; // Instance type change might require special logic, disabled for safety
  els.configZone.disabled = true;
  
  els.profileSelectorGroup.style.display = 'none'; // Don't show profile selector when editing
  els.configVpcGroup.style.display = 'none'; // VPC can't be changed easily

  // Default values for editable fields (CloudyPad doesn't expose all config, so we assume typical defaults or what they had)
  els.configRootDisk.value = '30';
  els.configDataDisk.value = '100';
  els.configTimeout.value = '600';
  els.configCost.value = '40';
  els.configSpot.checked = false;
  els.configAutoStop.checked = true;

  els.configModal.style.display = 'flex';
}

function handleProfileSelectChange() {
  const profileIndex = els.createProfileSelect.value;
  if (profileIndex === "") return;
  const profile = profiles[profileIndex];
  
  els.configInstType.value = profile.type;
  els.configRegion.value = profile.region;
  els.configZone.value = profile.zone || '';
  els.configRootDisk.value = profile.rootDisk || 30;
  els.configDataDisk.value = profile.disk;
  els.configCost.value = profile.costLimit;
  els.configTimeout.value = profile.timeout || 600;
  els.configSpot.checked = profile.spot || false;
  els.configAutoStop.checked = profile.autostop !== undefined ? profile.autostop : true;
  els.configVpc.checked = profile.vpc !== undefined ? profile.vpc : true;
}

async function handleConfigSubmit(e) {
  e.preventDefault();
  
  const mode = els.configMode.value;
  const name = els.createInstName.value.trim();
  
  if (!name) return;

  const payload = {
    name: name,
    region: els.configRegion.value,
    zone: els.configZone.value.trim(),
    instanceType: els.configInstType.value.trim(),
    rootDiskSize: parseInt(els.configRootDisk.value, 10),
    diskSize: parseInt(els.configDataDisk.value, 10),
    costLimit: parseInt(els.configCost.value, 10),
    timeout: parseInt(els.configTimeout.value, 10),
    spot: els.configSpot.checked,
    autostop: els.configAutoStop.checked,
    vpc: els.configVpc.checked
  };

  els.configModal.style.display = 'none';

  if (mode === 'create') {
    // Open Logs Modal for streaming creation logs
    els.logsModal.style.display = 'flex';
    els.creationLogs.innerHTML = 'Connecting to server...\n';
    els.closeLogsBtn.disabled = true;

    try {
      const res = await fetch('/api/setup/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      const ansiUp = new AnsiUp();
      let rawLogs = 'Connecting to server...\n';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        rawLogs += chunk;
        els.creationLogs.innerHTML = ansiUp.ansi_to_html(rawLogs);
        els.creationLogs.scrollTop = els.creationLogs.scrollHeight;
      }

      els.creationLogs.innerHTML += '\n\n--- DONE ---';
      els.closeLogsBtn.disabled = false;
      loadInstances();

    } catch (err) {
      els.creationLogs.innerHTML += `\nError: ${err.message}\n`;
      els.closeLogsBtn.disabled = false;
    }
  } else if (mode === 'edit') {
    // Edit sends standard JSON
    try {
      showToast(`Updating instance ${name}...`, 'info');
      const res = await fetch(`/api/instances/${name}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.ok) {
        showToast(`Instance ${name} updated successfully!`, 'success');
      } else {
        showToast(`Failed to update ${name}: ${data.error}`, 'error');
      }
    } catch (err) {
      showToast(`Error updating instance: ${err.message}`, 'error');
    }
  }
}

// Bind Events
function closeAwsModal() {
  els.awsModal.style.display = 'none';
}

function bindEvents() {
  els.navItems.forEach(item => {
    item.addEventListener('click', () => switchTab(item.getAttribute('data-target')));
  });

  els.refreshStatusBtn.addEventListener('click', () => {
    loadStatus();
    loadInstances();
  });
  els.awsAuthForm.addEventListener('submit', handleAwsSubmit);
  els.instancesTableBody.addEventListener('click', handleTableAction);

  // AWS Modal
  els.btnOpenAwsModal.addEventListener('click', () => {
    els.awsAuthForm.reset();
    els.awsInlineError.style.display = 'none';
    els.awsInlineSuccess.style.display = 'none';
    els.awsModal.style.display = 'flex';
  });

  els.btnCloseAwsModal.addEventListener('click', closeAwsModal);
  els.awsModal.addEventListener('click', e => {
    if (e.target === els.awsModal) closeAwsModal();
  });

  // Instances list -> modal

  // Profile Events
  els.profileForm.addEventListener('submit', handleAddProfile);
  els.profilesTableBody.addEventListener('click', handleDeleteProfile);

  // Config Modal Events
  els.btnOpenCreateModal.addEventListener('click', openCreateModal);
  els.btnCloseConfigModal.addEventListener('click', () => {
    els.configModal.style.display = 'none';
  });
  els.createProfileSelect.addEventListener('change', handleProfileSelectChange);
  els.createInstanceForm.addEventListener('submit', handleConfigSubmit);
  
  els.closeLogsBtn.addEventListener('click', () => {
    els.logsModal.style.display = 'none';
  });
}

// Run
document.addEventListener('DOMContentLoaded', init);
