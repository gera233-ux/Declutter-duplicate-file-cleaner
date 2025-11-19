// Handler for the "Select Folders" button.
// Uses the preload-exposed `electronAPI.selectDirectories()` to open a dialog
// and then updates the UI (`#foldersList`) and enables the Start Scan button.

let selectFoldersBtn;
let rendererStartScanBtn;
let foldersList;

async function selectFolders() {
  try {
    console.log('selectFolders() called');
    if (!window.electronAPI || !window.electronAPI.selectDirectories) {
      console.error('electronAPI.selectDirectories is not available');
      alert('Platform API not available. Are you running inside Electron?');
      return;
    }
    // Preload exposes `selectDirectories` which returns an array of folder paths
    const folders = await window.electronAPI.selectDirectories();

    // Clear existing list
    foldersList.innerHTML = '';

    if (!folders || folders.length === 0) {
      // No selection or canceled
      const p = document.createElement('p');
      p.className = 'empty-message';
      p.textContent = 'No folders selected yet';
      foldersList.appendChild(p);
  if (rendererStartScanBtn) rendererStartScanBtn.disabled = true;
      // keep any previously stored selection cleared
      window.selectedFolders = [];
      return;
    }

    // Populate folder list in the UI
    folders.forEach(folderPath => {
      const item = document.createElement('div');
      item.className = 'folder-item';
      item.textContent = folderPath;
      foldersList.appendChild(item);
    });

    // Enable scanning now that we have at least one folder
  if (rendererStartScanBtn) rendererStartScanBtn.disabled = false;

    // Store selection on the window for other scripts (scanner.js) to pick up
    window.selectedFolders = folders;
  } catch (err) {
    console.error('Error selecting folders:', err);
  }
}

// Wire the button
document.addEventListener('DOMContentLoaded', () => {
  selectFoldersBtn = document.getElementById('selectFoldersBtn');
  rendererStartScanBtn = document.getElementById('startScanBtn');
  foldersList = document.getElementById('foldersList');

  if (selectFoldersBtn) {
    selectFoldersBtn.addEventListener('click', (e) => {
      e.preventDefault();
      selectFolders();
    });
  }
});

// Export for potential unit tests or other modules (optional)
window.appSelectFolders = selectFolders;

// Dev-only: quick reload test marker (will change when testing electron-reload)
console.log('dev-reload-ready');
