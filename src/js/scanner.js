// Scanner UI wiring: start scan button -> ask main process to scan selected folders
let startScanBtn;
let progressSection;
let resultsSection;
let progressMessage;
let fileCountEl;
let resultsContainer;
let resultsSummary;
let spaceSavedEl;
let selectAllBtn;
let deleteSelectedBtn;
let startAgainBtn;
let cancelScanBtn;
let progressBar;
let scanCountsEl;
let scanModeSelect;
let _unsubProgress = null;
let _unsubDone = null;
let _isCancelling = false;
let scanNotificationEl = null;

async function startScan() {
  console.log('startScan() called');
  try {
    if (!window.electronAPI || !window.electronAPI.scanDirectories) {
      console.error('electronAPI.scanDirectories is not available');
      alert('Platform API not available. Are you running inside Electron?');
      return;
    }

    const folders = window.selectedFolders || [];
    if (!folders || folders.length === 0) {
      alert('Please select one or more folders to scan.');
      return;
    }

    startScanBtn.disabled = true;
    startScanBtn.classList.add('scanning');
    progressSection.style.display = '';
    resultsSection.style.display = 'none';
    progressMessage.textContent = 'Scanning folders...';
    fileCountEl.textContent = 'Scanning...';
    scanCountsEl.textContent = 'Hashed: 0 / 0';
    if (progressBar) progressBar.style.width = '0%';
    resultsContainer.innerHTML = '';

    // Subscribe to progress and done events
    const onProgress = (data) => {
      // data: { totalFilesFound, totalToHash, hashed, currentFile }
      const { totalFilesFound = 0, totalToHash = 0, hashed = 0, currentFile = null } = data || {};
      fileCountEl.textContent = `${totalFilesFound} files found`;
      const left = Math.max(0, totalToHash - hashed);
      const pct = totalToHash > 0 ? Math.round((hashed / totalToHash) * 100) : 0;
      scanCountsEl.textContent = `Scanned: ${hashed} — Left: ${left} — ${pct}%`;
      if (progressBar) progressBar.style.width = `${pct}%`;
      if (currentFile) progressMessage.textContent = `Scanning: ${currentFile}`; else progressMessage.textContent = 'Scanning...';
    };

    const onDone = (res) => {
      // Unsubscribe listeners if we have unsubscribe functions
      try {
        if (typeof _unsubProgress === 'function') _unsubProgress();
      } catch (e) {}
      try {
        if (typeof _unsubDone === 'function') _unsubDone();
      } catch (e) {}

      if (!res || !res.success) {
        progressMessage.textContent = 'Scan failed: ' + (res && res.error ? res.error : 'Unknown error');
        startScanBtn.disabled = false;
        startScanBtn.classList.remove('scanning');
        if (cancelScanBtn) { cancelScanBtn.style.display = 'none'; cancelScanBtn.disabled = false; }
        if (scanNotificationEl) scanNotificationEl.style.display = 'none';
        return;
      }
      if (res.cancelled) {
        // If user already triggered cancellation and we navigated, just clean up.
        if (_isCancelling) {
          // reset cancelling flag and hide cancel button
          _isCancelling = false;
          if (cancelScanBtn) { cancelScanBtn.style.display = 'none'; cancelScanBtn.disabled = false; }
          return;
        }
        // Otherwise, navigate back to main board and hide progress UI
        try { onStartAgainClicked(); } catch (e) { /* fallback */ }
        if (cancelScanBtn) { cancelScanBtn.style.display = 'none'; cancelScanBtn.disabled = false; }
        if (scanNotificationEl) scanNotificationEl.style.display = 'none';
        return;
      }
      const groups = res.duplicates || [];
      progressMessage.textContent = `Scan complete. Found ${groups.length} duplicate group(s).`;
      fileCountEl.textContent = `${groups.reduce((acc, g) => acc + g.files.length, 0)} files considered`;
      renderResults(groups);
      resultsSection.style.display = '';
      startScanBtn.disabled = false;
      startScanBtn.classList.remove('scanning');
      if (cancelScanBtn) { cancelScanBtn.style.display = 'none'; cancelScanBtn.disabled = false; }
      if (scanNotificationEl) {
        scanNotificationEl.textContent = 'Scanning complete';
        scanNotificationEl.style.color = '#27ae60'; // green for complete
      }
    };

    // Attach listeners
    // Subscribe and capture unsubscribe functions
    try {
      _isCancelling = false;
      _unsubProgress = window.electronAPI.onScanProgress(onProgress);
    } catch (e) {
      console.warn('Failed to subscribe to scan-progress', e);
      _unsubProgress = null;
    }
    try {
      _unsubDone = window.electronAPI.onScanDone(onDone);
    } catch (e) {
      console.warn('Failed to subscribe to scan-done', e);
      _unsubDone = null;
    }

    // Start scan in main
    const mode = scanModeSelect ? scanModeSelect.value : 'exact';
    window.electronAPI.startScan(folders, mode);
    // show a small notification on the bar indicating scanning started
    if (scanNotificationEl) {
      scanNotificationEl.style.display = '';
      scanNotificationEl.textContent = 'Scanning started';
      scanNotificationEl.style.color = '#e67e22'; // orange for started
    }
    // show cancel button while scanning
    if (cancelScanBtn) {
      cancelScanBtn.style.display = '';
      cancelScanBtn.disabled = false;
    }
  } catch (err) {
    console.error('Scan error', err);
    if (progressMessage) progressMessage.textContent = 'Scan failed: ' + err.message;
  } finally {
    if (startScanBtn) {
      startScanBtn.disabled = false;
      startScanBtn.classList.remove('scanning');
    }
  }
}

function renderResults(groups) {
  resultsContainer.innerHTML = '';
  let totalSpace = 0;
  let totalFiles = 0;

  groups.forEach((group, idx) => {
    const groupEl = document.createElement('div');
    groupEl.className = 'duplicate-group';
    groupEl.dataset.size = String(group.size || 0);

    const header = document.createElement('div');
    header.className = 'group-header';
    header.textContent = `Group ${idx + 1} — ${group.files.length} duplicates — ${formatBytes(group.size)}`;
    groupEl.appendChild(header);

  const list = document.createElement('ul');
    list.className = 'group-files';

    // Keep first file as the "original" and others as candidates to delete
    group.files.forEach((filePath, i) => {
      const li = document.createElement('li');
      li.className = 'file-entry';
      li.dataset.path = filePath;

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'file-select';
      cb.dataset.path = filePath;
      cb.style.marginRight = '8px';

      const span = document.createElement('span');
      span.className = 'file-path';
      span.textContent = filePath;

      const actions = document.createElement('div');
      actions.className = 'file-actions';

      const openBtn = document.createElement('button');
      openBtn.textContent = 'Show in folder';
      openBtn.className = 'btn btn-sm';
      openBtn.addEventListener('click', () => window.electronAPI.showItemInFolder(filePath));

      const delBtn = document.createElement('button');
      delBtn.textContent = 'Delete';
      delBtn.className = 'btn btn-sm btn-danger';
      delBtn.addEventListener('click', async () => {
        const ok = confirm(`Delete file?\n${filePath}`);
        if (!ok) return;
        const r = await window.electronAPI.deleteFile(filePath);
        if (r && r.success) {
          li.remove();
        } else {
          alert('Could not delete file: ' + (r && r.error ? r.error : 'unknown'));
        }
      });

      actions.appendChild(openBtn);
      actions.appendChild(delBtn);

      li.appendChild(cb);
      li.appendChild(span);
      li.appendChild(actions);
      list.appendChild(li);
    });

    // For space saved calculation: (files.length - 1) * size
    totalFiles += group.files.length;
    totalSpace += (group.files.length - 1) * group.size;

    groupEl.appendChild(list);
    resultsContainer.appendChild(groupEl);
  });

  resultsSummary.textContent = `Found ${totalFiles} duplicate files in ${groups.length} groups`;
  spaceSavedEl.textContent = `Can free up: ${formatBytes(totalSpace)}`;

  // Update select-all button state
  updateSelectAllButton();
  // Show action buttons when results are present
  if (selectAllBtn) selectAllBtn.style.display = groups.length > 0 ? '' : 'none';
  if (deleteSelectedBtn) deleteSelectedBtn.style.display = groups.length > 0 ? '' : 'none';
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

if (startScanBtn) {
  startScanBtn.addEventListener('click', startScan);
}

// Wire after DOM ready
document.addEventListener('DOMContentLoaded', () => {
  startScanBtn = document.getElementById('startScanBtn');
  progressSection = document.getElementById('progressSection');
  resultsSection = document.getElementById('resultsSection');
  progressMessage = document.getElementById('progressMessage');
  fileCountEl = document.getElementById('fileCount');
  resultsContainer = document.getElementById('resultsContainer');
  resultsSummary = document.getElementById('resultsSummary');
  spaceSavedEl = document.getElementById('spaceSaved');
  selectAllBtn = document.getElementById('selectAllBtn');
  deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
  startAgainBtn = document.getElementById('startAgainBtn');
  cancelScanBtn = document.getElementById('cancelScanBtn');
  progressBar = document.getElementById('progressBar');
  scanCountsEl = document.getElementById('scanCounts');
  scanModeSelect = document.getElementById('scanMode');

  if (startScanBtn) startScanBtn.addEventListener('click', startScan);
  if (selectAllBtn) selectAllBtn.addEventListener('click', onSelectAllClicked);
  if (deleteSelectedBtn) deleteSelectedBtn.addEventListener('click', onDeleteSelectedClicked);
  if (resultsContainer) {
    resultsContainer.addEventListener('change', (e) => {
      if (e.target && e.target.classList && e.target.classList.contains('file-select')) {
        updateSelectAllButton();
      }
    });
  }
  // get startAgain button and hide action buttons by default
  if (startAgainBtn) startAgainBtn.addEventListener('click', onStartAgainClicked);
  if (selectAllBtn) selectAllBtn.style.display = 'none';
  if (deleteSelectedBtn) deleteSelectedBtn.style.display = 'none';

  // Cancel scan button setup
  if (cancelScanBtn) {
    cancelScanBtn.style.display = 'none';
    cancelScanBtn.addEventListener('click', () => {
      try { window.electronAPI.cancelScan(); } catch (e) { console.warn('cancelScan not available'); }
      // Immediately navigate back to the main folder selection so the UI isn't stuck
      _isCancelling = true;
      try { onStartAgainClicked(); } catch (e) { /* ignore */ }
      // Unsubscribe progress/done listeners to avoid duplicate UI updates
      try { if (typeof _unsubProgress === 'function') _unsubProgress(); } catch (e) {}
      try { if (typeof _unsubDone === 'function') _unsubDone(); } catch (e) {}
      // update UI state
      cancelScanBtn.disabled = true;
      if (progressMessage) progressMessage.textContent = 'Cancelling...';
      if (scanNotificationEl) scanNotificationEl.style.display = 'none';
    });
  }
  // scan notification element
  scanNotificationEl = document.getElementById('scanNotification');
});

function getAllFileCheckboxes() {
  if (!resultsContainer) return [];
  return Array.from(resultsContainer.querySelectorAll('input.file-select'));
}

function updateSelectAllButton() {
  if (!selectAllBtn) return;
  const boxes = getAllFileCheckboxes();
  if (boxes.length === 0) {
    selectAllBtn.disabled = true;
    selectAllBtn.textContent = '✓ Select All';
    return;
  }
  selectAllBtn.disabled = false;
  const anyUnchecked = boxes.some(cb => !cb.checked);
  selectAllBtn.textContent = anyUnchecked ? '✓ Select All' : '✕ Unselect All';
}

function onSelectAllClicked() {
  const boxes = getAllFileCheckboxes();
  if (boxes.length === 0) return;
  const anyUnchecked = boxes.some(cb => !cb.checked);
  boxes.forEach(cb => cb.checked = anyUnchecked);
  updateSelectAllButton();
}

function recalcTotals() {
  if (!resultsContainer) return;
  const groupEls = Array.from(resultsContainer.querySelectorAll('.duplicate-group'));
  let totalSpace = 0;
  let totalFiles = 0;
  let groupsCount = 0;

  groupEls.forEach(groupEl => {
    const size = parseInt(groupEl.dataset.size || '0', 10) || 0;
    const files = Array.from(groupEl.querySelectorAll('li.file-entry'));
    if (files.length === 0) {
      groupEl.remove();
      return;
    }
    groupsCount += 1;
    totalFiles += files.length;
    totalSpace += (files.length - 1) * size;
  });

  resultsSummary.textContent = `Found ${totalFiles} duplicate files in ${groupsCount} groups`;
  spaceSavedEl.textContent = `Can free up: ${formatBytes(totalSpace)}`;
  updateSelectAllButton();
}

async function onDeleteSelectedClicked() {
  const boxes = getAllFileCheckboxes().filter(cb => cb.checked);
  if (boxes.length === 0) {
    alert('No files selected');
    return;
  }

  const confirmOk = confirm(`Delete ${boxes.length} selected file(s)? This cannot be undone.`);
  if (!confirmOk) return;

  if (deleteSelectedBtn) deleteSelectedBtn.disabled = true;

  // Delete sequentially to avoid overwhelming the main process
  for (const cb of boxes) {
    const filePath = cb.dataset.path;
    try {
      const res = await window.electronAPI.deleteFile(filePath);
      if (res && res.success) {
        // remove the corresponding li
        const lis = Array.from(resultsContainer.querySelectorAll('li.file-entry'));
        const li = lis.find(l => l.dataset.path === filePath);
        if (li) li.remove();
      } else {
        console.error('Failed to delete', filePath, res && res.error);
        alert(`Could not delete ${filePath}: ${res && res.error ? res.error : 'unknown'}`);
      }
    } catch (err) {
      console.error('Error deleting file', filePath, err);
      alert(`Error deleting ${filePath}: ${err.message}`);
    }
  }

  // Recalculate totals and update UI
  recalcTotals();

  if (deleteSelectedBtn) deleteSelectedBtn.disabled = false;
}

// Expose for debugging/testing
window.appStartScan = startScan;

function onStartAgainClicked() {
  // Return UI to folder selection / home state
  const setup = document.querySelector('.setup-section');
  if (setup) setup.style.display = '';
  if (progressSection) progressSection.style.display = 'none';
  if (resultsSection) resultsSection.style.display = 'none';
  if (resultsContainer) resultsContainer.innerHTML = '';
  if (progressMessage) progressMessage.textContent = 'Preparing to scan...';
  if (fileCountEl) fileCountEl.textContent = '0 files found';
  if (scanCountsEl) scanCountsEl.textContent = '';
  if (progressBar) progressBar.style.width = '0%';
  if (cancelScanBtn) { cancelScanBtn.style.display = 'none'; cancelScanBtn.disabled = false; }
  if (startScanBtn) startScanBtn.disabled = true; // require re-selecting folders
  // Clear selected folders and UI list (the renderer manages enabling the button)
  try {
    window.selectedFolders = [];
    const foldersList = document.getElementById('foldersList');
    if (foldersList) {
      foldersList.innerHTML = '';
      const p = document.createElement('p');
      p.className = 'empty-message';
      p.textContent = 'No folders selected yet';
      foldersList.appendChild(p);
    }
  } catch (e) {
    console.warn('Could not clear folders list:', e);
  }
  // Reset action buttons
  if (selectAllBtn) {
    selectAllBtn.disabled = true;
    selectAllBtn.textContent = '✓ Select All';
    selectAllBtn.style.display = 'none';
  }
  if (deleteSelectedBtn) {
    deleteSelectedBtn.disabled = true;
    deleteSelectedBtn.style.display = 'none';
  }
  if (scanNotificationEl) scanNotificationEl.style.display = 'none';
  // scroll to top so user sees folder selection
  try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { window.scrollTo(0,0); }
}
