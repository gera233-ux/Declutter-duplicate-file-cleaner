const { contextBridge, ipcRenderer } = require('electron');

// Create a safe connection between our app and computer files
contextBridge.exposeInMainWorld('electronAPI', {
  // Let the app select folders
  selectDirectories: () => ipcRenderer.invoke('select-directories'),
  
  // Let the app delete files (with safety checks)
  deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath),
  
  // Let the app show where files are located
  showItemInFolder: (filePath) => ipcRenderer.invoke('show-item-in-folder', filePath),
  
  // Scan directories for duplicate files (returns array of duplicate groups)
  scanDirectories: (folders) => ipcRenderer.invoke('scan-directories', folders),
  // New cancellable scan flow with progress events
  startScan: (folders, mode = 'exact') => ipcRenderer.send('start-scan', { folders, mode }),
  // Register for progress/done events and return an unsubscribe function
  onScanProgress: (cb) => {
    const listener = (event, data) => cb(data);
    ipcRenderer.on('scan-progress', listener);
    return () => ipcRenderer.removeListener('scan-progress', listener);
  },
  onScanDone: (cb) => {
    const listener = (event, data) => cb(data);
    ipcRenderer.on('scan-done', listener);
    return () => ipcRenderer.removeListener('scan-done', listener);
  },
  cancelScan: () => ipcRenderer.send('cancel-scan')
});
