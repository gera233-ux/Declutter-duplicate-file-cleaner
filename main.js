const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage, Menu } = require('electron');
const path = require('path');
const os = require('os');

let mainWindow;

function createWindow() {
  // Create the main application window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'iconapp.png'),
    show: false
  });

  // Load our app interface
  mainWindow.loadFile('src/index.html');

  // Show window when ready (prevents visual flash)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
}

// Start the app when ready
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
});

// Quit app when all windows are closed
app.on('window-all-closed', () => {
  app.quit();
});

// Handle folder selection requests
ipcMain.handle('select-directories', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'multiSelections'],
    title: 'Choose folders to scan for duplicate files'
  });

  if (!result.canceled) {
    return result.filePaths;
  }
  return [];
});

// Handle file deletion requests safely
ipcMain.handle('delete-file', async (event, filePath) => {
  const fs = require('fs').promises;
  try {
    await fs.unlink(filePath);
    return { success: true, message: 'File deleted successfully' };
  } catch (error) {
    return { success: false, error: `Could not delete file: ${error.message}` };
  }
});

// Open file location in Windows Explorer
ipcMain.handle('show-item-in-folder', async (event, filePath) => {
  shell.showItemInFolder(filePath);
});

// Global scan state map so start/cancel handlers work when registered at startup
const scanState = new Map();

// Start a cancellable scan that streams progress back to the renderer
ipcMain.on('start-scan', async (event, data) => {
  const { folders, mode = 'exact' } = data;
  const fs = require('fs').promises;
  const fsSync = require('fs');
  const path = require('path');
  const crypto = require('crypto');

  const senderId = event.sender.id;
  scanState.set(senderId, { cancelled: false });
  const state = scanState.get(senderId);

  try {
    // Collect all files first so we can report totals
    async function collectFiles(dir) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const files = [];
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          try {
            const nested = await collectFiles(full);
            files.push(...nested);
          } catch (e) {
            // ignore unreadable folders
          }
        } else if (entry.isFile()) {
          files.push(full);
        }
      }
      return files;
    }

    const allFiles = [];
    for (const folder of folders || []) {
      try {
        const files = await collectFiles(folder);
        allFiles.push(...files);
      } catch (e) {
        // ignore
      }
    }

    // Group by size and initially pick files where size appears more than once
    const sizeMap = new Map();
    for (const filePath of allFiles) {
      try {
        const st = await fs.stat(filePath);
        if (!st.isFile()) continue;
        const size = st.size;
        const arr = sizeMap.get(size) || [];
        arr.push(filePath);
        sizeMap.set(size, arr);
      } catch (e) {
        // ignore stat errors
      }
    }

    const totalFilesFound = allFiles.length;
    let duplicates = [];
    let candidates = [];

    if (mode === 'exact' || mode === 'content') {
      // Group by size first
      const sizeMap = new Map();
      for (const filePath of allFiles) {
        try {
          const st = await fs.stat(filePath);
          if (!st.isFile()) continue;
          const size = st.size;
          const arr = sizeMap.get(size) || [];
          arr.push(filePath);
          sizeMap.set(size, arr);
        } catch (e) {
          // ignore stat errors
        }
      }
      candidates = [];
      for (const [size, files] of sizeMap.entries()) {
        if (files.length > 1) candidates.push({ size, files });
      }
    } else if (mode === 'sizeOnly') {
      // Group by size
      const sizeMap = new Map();
      for (const filePath of allFiles) {
        try {
          const st = await fs.stat(filePath);
          if (!st.isFile()) continue;
          const size = st.size;
          const arr = sizeMap.get(size) || [];
          arr.push(filePath);
          sizeMap.set(size, arr);
        } catch (e) {
          // ignore stat errors
        }
      }
      candidates = [];
      for (const [size, files] of sizeMap.entries()) {
        if (files.length > 1) candidates.push({ size, files });
      }
      duplicates = candidates.map(grp => ({ hash: grp.size.toString(), size: grp.size, files: grp.files }));
      try { event.sender.send('scan-done', { success: true, cancelled: !!state.cancelled, duplicates }); } catch (e) {}
      scanState.delete(senderId);
      return;
    } else if (mode === 'filename') {
      // Group by filename
      const nameMap = new Map();
      for (const filePath of allFiles) {
        const name = path.basename(filePath);
        const arr = nameMap.get(name) || [];
        arr.push(filePath);
        nameMap.set(name, arr);
      }
      candidates = [];
      for (const [name, files] of nameMap.entries()) {
        if (files.length > 1) candidates.push({ name, files });
      }
      duplicates = candidates.map(grp => ({ hash: grp.name, size: 0, files: grp.files }));
      try { event.sender.send('scan-done', { success: true, cancelled: !!state.cancelled, duplicates }); } catch (e) {}
      scanState.delete(senderId);
      return;
    } else if (mode === 'date') {
      // Group by modification date (day)
      const dateMap = new Map();
      for (const filePath of allFiles) {
        try {
          const st = await fs.stat(filePath);
          if (!st.isFile()) continue;
          const date = new Date(st.mtime).setHours(0, 0, 0, 0);
          const arr = dateMap.get(date) || [];
          arr.push(filePath);
          dateMap.set(date, arr);
        } catch (e) {}
      }
      candidates = [];
      for (const [date, files] of dateMap.entries()) {
        if (files.length > 1) candidates.push({ date, files });
      }
      duplicates = candidates.map(grp => ({ hash: new Date(grp.date).toISOString().slice(0, 10), size: 0, files: grp.files }));
      try { event.sender.send('scan-done', { success: true, cancelled: !!state.cancelled, duplicates }); } catch (e) {}
      scanState.delete(senderId);
      return;
    }

    // If there are no candidate groups, finish early
    if (candidates.length === 0) {
      try { event.sender.send('scan-done', { success: true, cancelled: !!state.cancelled, duplicates: [] }); } catch (e) {}
      scanState.delete(senderId);
      return;
    }

    // For 'exact' and 'content' modes: full hashing
    const filesToHash = [];
    for (const grp of candidates) {
      filesToHash.push(...grp.files);
    }

    const totalToHash = filesToHash.length;

    // Notify renderer of totals
    try { event.sender.send('scan-progress', { totalFilesFound, totalToHash, hashed: 0, currentFile: null }); } catch (e) {}

    // helper to compute hash
    const hashAlgo = mode === 'content' ? 'md5' : 'md5'; // can change for content
    function hashFile(filePath) {
      return new Promise((resolve, reject) => {
        const hash = crypto.createHash(hashAlgo);
        const stream = fsSync.createReadStream(filePath);
        stream.on('error', (err) => reject(err));
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
      });
    }

    // Concurrent full hashing
    const hashMap = new Map();
    let hashed = 0;
    let index = 0;
    const concurrency = Math.max(4, Math.min(16, os.cpus().length * 2));

    async function worker() {
      while (true) {
        if (state.cancelled) break;
        let f;
        if (index >= filesToHash.length) break;
        f = filesToHash[index];
        index += 1;
        try {
          const h = await hashFile(f);
          const arr = hashMap.get(h) || [];
          arr.push(f);
          hashMap.set(h, arr);
        } catch (e) {
          // skip unreadable
        }
        hashed += 1;
        try { event.sender.send('scan-progress', { totalFilesFound, totalToHash, hashed, currentFile: f }); } catch (e) {}
      }
    }

    const workers = [];
    for (let i = 0; i < concurrency; i++) workers.push(worker());
    await Promise.all(workers);

    // For content mode, additional check: if text files, group by actual content comparison
    if (mode === 'content') {
      const textExtensions = ['.txt', '.js', '.json', '.html', '.css', '.xml', '.md', '.py', '.java', '.c', '.cpp', '.h', '.cs'];
      const contentMap = new Map();
      for (const [h, files] of hashMap.entries()) {
        if (files.length <= 1) continue;
        // Check if all are text files
        const allText = files.every(f => textExtensions.includes(path.extname(f).toLowerCase()));
        if (allText && files.length > 1) {
          // Compare content
          const contentGroups = new Map();
          for (const f of files) {
            try {
              const content = await fs.readFile(f, 'utf8');
              const key = content;
              const arr = contentGroups.get(key) || [];
              arr.push(f);
              contentGroups.set(key, arr);
            } catch (e) {
              // if encoding error, treat as non-text
            }
          }
          // Replace hash groups with content groups
          contentMap.set(h, contentGroups);
        } else {
          contentMap.set(h, new Map([[h, files]]));
        }
      }
      // Flatten to duplicates
      for (const [hashKey, contentGrp] of contentMap.entries()) {
        for (const [contentKey, files] of contentGrp.entries()) {
          if (files.length > 1) {
            let size = 0;
            try { size = (await fs.stat(files[0])).size; } catch (e) {}
            duplicates.push({ hash: contentKey.slice(0, 32), size, files });
          }
        }
      }
    } else {
      for (const [h, group] of hashMap.entries()) {
        if (group.length > 1) {
          let size = 0;
          try { size = (await fs.stat(group[0])).size; } catch (e) {}
          duplicates.push({ hash: h, size, files: group });
        }
      }
    }

    // Send final result
    event.sender.send('scan-done', { success: true, cancelled: !!state.cancelled, duplicates });
  } catch (err) {
    event.sender.send('scan-done', { success: false, error: err.message });
  } finally {
    scanState.delete(senderId);
  }
});

ipcMain.on('cancel-scan', (event) => {
  const senderId = event.sender.id;
  const state = scanState.get(senderId);
  if (state) state.cancelled = true;
});

// Scan directories (legacy synchronous invoke) — returns duplicate groups
ipcMain.handle('scan-directories', async (event, folders) => {
  const fs = require('fs').promises;
  const fsSync = require('fs');
  const path = require('path');
  const crypto = require('crypto');

  async function collectFiles(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        try {
          const nested = await collectFiles(full);
          files.push(...nested);
        } catch (e) {
          // ignore unreadable folders
        }
      } else if (entry.isFile()) {
        files.push(full);
      }
    }
    return files;
  }

  function hashFile(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha1');
      const stream = fsSync.createReadStream(filePath);
      stream.on('error', (err) => reject(err));
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
    });
  }

  try {
    const allFiles = [];
    for (const folder of folders || []) {
      try {
        const files = await collectFiles(folder);
        allFiles.push(...files);
      } catch (e) {}
    }

    const sizeMap = new Map();
    for (const filePath of allFiles) {
      try {
        const st = await fs.stat(filePath);
        if (!st.isFile()) continue;
        const size = st.size;
        const arr = sizeMap.get(size) || [];
        arr.push(filePath);
        sizeMap.set(size, arr);
      } catch (e) {}
    }

    const duplicates = [];
    for (const [size, files] of sizeMap.entries()) {
      if (files.length < 2) continue;
      const hashMap = new Map();
      for (const f of files) {
        try {
          const h = await hashFile(f);
          const arr = hashMap.get(h) || [];
          arr.push(f);
          hashMap.set(h, arr);
        } catch (e) {}
      }
      for (const [h, group] of hashMap.entries()) {
        if (group.length > 1) duplicates.push({ hash: h, size, files: group });
      }
    }

    return { success: true, duplicates };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
