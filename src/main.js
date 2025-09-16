const { app, BrowserWindow, nativeImage, ipcMain, dialog } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

// File size limit for initial display (1MB)
const FILE_SIZE_LIMIT = 1024 * 1024;

// Function to check if file is UTF-8 encoded
function isValidUTF8(buffer) {
  // If file is empty, consider it UTF-8
  if (buffer.length === 0) {
    return true;
  }
  
  // Check for excessive null bytes (binary indicator)
  let nullCount = 0;
  const sampleSize = Math.min(buffer.length, 1024); // Check first 1KB
  
  for (let i = 0; i < sampleSize; i++) {
    if (buffer[i] === 0) {
      nullCount++;
    }
  }
  
  // If more than 1% null bytes, likely binary
  if (nullCount / sampleSize > 0.01) {
    console.log(`Detected binary file: ${nullCount}/${sampleSize} null bytes`);
    return false;
  }
  
  // Try to convert to UTF-8 and check for replacement characters
  const text = buffer.toString('utf8');
  const replacementCount = (text.match(/\uFFFD/g) || []).length;
  
  // If more than 1% replacement characters, likely binary/non-UTF8
  if (replacementCount / text.length > 0.01) {
    console.log(`Detected non-UTF8: ${replacementCount}/${text.length} replacement chars`);
    return false;
  }
  
  // Check for font file signatures
  if (text.includes('FFTM') || text.includes('GDEF') || text.includes('glyf') || 
      text.includes('cmap') || text.includes('fpgm') || text.includes('gasp') ||
      text.includes('DSIG') || text.includes('GSUB') || text.includes('GPOS')) {
    console.log('Detected font file by signature');
    return false;
  }
  
  // Check for high percentage of non-printable characters
  let nonPrintableCount = 0;
  const checkLength = Math.min(text.length, 1000);
  
  for (let i = 0; i < checkLength; i++) {
    const code = text.charCodeAt(i);
    // Count chars that are not printable ASCII, common whitespace, or extended ASCII
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
      nonPrintableCount++;
    }
  }
  
  // If more than 10% non-printable characters, likely binary
  if (nonPrintableCount / checkLength > 0.1) {
    console.log(`Detected binary: ${nonPrintableCount}/${checkLength} non-printable chars`);
    return false;
  }
  
  return true;
}

// Function to detect file encoding
async function detectFileEncoding(filePath) {
  try {
    const buffer = await fs.readFile(filePath);
    const isUTF8 = isValidUTF8(buffer);
    console.log(`File: ${filePath}, Size: ${buffer.length}, IsUTF8: ${isUTF8}`);
    console.log(`First 100 bytes:`, buffer.slice(0, 100).toString('hex'));
    return {
      isUTF8,
      size: buffer.length,
      buffer
    };
  } catch (error) {
    throw error;
  }
}

function createWindow () {
  const iconPath = path.join(__dirname, '../assets/ctrace.png');
  const iconApp = nativeImage.createFromPath(iconPath);

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: iconApp,
    webPreferences: {
      nodeIntegration: true,      // allows require() in renderer
      contextIsolation: false     // disables security isolation
    }
  });

  win.loadFile('src/index.html');
  // Remove default menu bar
  win.setMenuBarVisibility(false);
  win.removeMenu();
  
  return win;
}

//hot reload
try {
  require('electron-reload')(__dirname, {
  electron: require(path.join(__dirname, '../node_modules/electron')),
  hardResetMethod: 'exit'
  });
} catch (e) {
  console.log("electron-reload not active");
}

// IPC handlers
let mainWindow;

// Open folder dialog
ipcMain.handle('open-folder-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    const folderPath = result.filePaths[0];
    try {
      const fileTree = await buildFileTree(folderPath);
      return {
        success: true,
        folderPath,
        fileTree
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  return { success: false, canceled: true };
});

// Open file dialog
ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'All Files', extensions: ['*'] },
      { name: 'Text Files', extensions: ['txt', 'md', 'json', 'js', 'ts', 'html', 'css', 'py', 'cpp', 'c', 'h'] }
    ]
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    try {
      const fileInfo = await detectFileEncoding(filePath);
      
      if (!fileInfo.isUTF8) {
        // File is not UTF-8, return warning info
        return {
          success: true,
          warning: 'encoding',
          filePath,
          fileName: path.basename(filePath),
          message: 'This file appears to contain non-UTF8 characters. Opening it may cause display issues or data corruption.'
        };
      }
      
      let content;
      let isPartial = false;
      
      if (fileInfo.size > FILE_SIZE_LIMIT) {
        // File is large, load only first part
        const partialBuffer = fileInfo.buffer.slice(0, FILE_SIZE_LIMIT);
        content = partialBuffer.toString('utf8');
        isPartial = true;
      } else {
        // File is small enough, load entirely
        content = fileInfo.buffer.toString('utf8');
      }
      
      return {
        success: true,
        filePath,
        content,
        fileName: path.basename(filePath),
        isPartial,
        totalSize: fileInfo.size,
        loadedSize: isPartial ? FILE_SIZE_LIMIT : fileInfo.size
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  return { success: false, canceled: true };
});

// Save file
ipcMain.handle('save-file', async (event, filePath, content) => {
  try {
    await fs.writeFile(filePath, content, 'utf8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Save file as
ipcMain.handle('save-file-as', async (event, content) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [
      { name: 'All Files', extensions: ['*'] },
      { name: 'Text Files', extensions: ['txt'] },
      { name: 'JavaScript', extensions: ['js'] },
      { name: 'TypeScript', extensions: ['ts'] },
      { name: 'HTML', extensions: ['html'] },
      { name: 'CSS', extensions: ['css'] }
    ]
  });
  
  if (!result.canceled) {
    try {
      await fs.writeFile(result.filePath, content, 'utf8');
      return {
        success: true,
        filePath: result.filePath,
        fileName: path.basename(result.filePath)
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  
  return { success: false, canceled: true };
});

// Read file content
// Read file content
ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const fileInfo = await detectFileEncoding(filePath);
    
    if (!fileInfo.isUTF8) {
      // File is not UTF-8, return warning info
      return {
        success: true,
        warning: 'encoding',
        filePath,
        fileName: path.basename(filePath),
        message: 'This file appears to contain non-UTF8 characters. Opening it may cause display issues or data corruption.'
      };
    }
    
    let content;
    let isPartial = false;
    
    if (fileInfo.size > FILE_SIZE_LIMIT) {
      // File is large, load only first part
      const partialBuffer = fileInfo.buffer.slice(0, FILE_SIZE_LIMIT);
      content = partialBuffer.toString('utf8');
      isPartial = true;
    } else {
      // File is small enough, load entirely
      content = fileInfo.buffer.toString('utf8');
    }
    
    return {
      success: true,
      content,
      fileName: path.basename(filePath),
      isPartial,
      totalSize: fileInfo.size,
      loadedSize: isPartial ? FILE_SIZE_LIMIT : fileInfo.size
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Load complete file (for large files that were partially loaded)
ipcMain.handle('load-complete-file', async (event, filePath) => {
  try {
    const fileInfo = await detectFileEncoding(filePath);
    
    if (!fileInfo.isUTF8) {
      return {
        success: false,
        error: 'File contains non-UTF8 characters and cannot be safely loaded.'
      };
    }
    
    const content = fileInfo.buffer.toString('utf8');
    
    return {
      success: true,
      content,
      fileName: path.basename(filePath),
      isPartial: false,
      totalSize: fileInfo.size,
      loadedSize: fileInfo.size
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Force open file (ignore encoding warnings)
ipcMain.handle('force-open-file', async (event, filePath) => {
  try {
    const fileInfo = await detectFileEncoding(filePath);
    
    let content;
    let isPartial = false;
    
    // Try to read as UTF-8, may have some garbled characters
    if (fileInfo.size > FILE_SIZE_LIMIT) {
      const partialBuffer = fileInfo.buffer.slice(0, FILE_SIZE_LIMIT);
      try {
        content = partialBuffer.toString('utf8');
      } catch (error) {
        // If UTF-8 fails, try latin1 as fallback
        content = partialBuffer.toString('latin1');
      }
      isPartial = true;
    } else {
      try {
        content = fileInfo.buffer.toString('utf8');
      } catch (error) {
        // If UTF-8 fails, try latin1 as fallback
        content = fileInfo.buffer.toString('latin1');
      }
    }
    
    return {
      success: true,
      content,
      fileName: path.basename(filePath),
      isPartial,
      totalSize: fileInfo.size,
      loadedSize: isPartial ? FILE_SIZE_LIMIT : fileInfo.size,
      encodingWarning: !fileInfo.isUTF8
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Search in files
ipcMain.handle('search-in-files', async (event, searchTerm, folderPath) => {
  try {
    const results = await searchInDirectory(folderPath, searchTerm);
    return { success: true, results };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Helper function to build file tree
async function buildFileTree(dirPath, maxDepth = 3, currentDepth = 0) {
  if (currentDepth > maxDepth) return null;
  
  try {
    const items = await fs.readdir(dirPath);
    const tree = [];
    
    for (const item of items) {
      // Skip hidden files and common build directories
      if (item.startsWith('.') || ['node_modules', 'dist', 'build', '.git'].includes(item)) {
        continue;
      }
      
      const itemPath = path.join(dirPath, item);
      const stats = await fs.stat(itemPath);
      
      if (stats.isDirectory()) {
        const children = await buildFileTree(itemPath, maxDepth, currentDepth + 1);
        tree.push({
          name: item,
          path: itemPath,
          type: 'directory',
          children: children || []
        });
      } else {
        tree.push({
          name: item,
          path: itemPath,
          type: 'file'
        });
      }
    }
    
    return tree.sort((a, b) => {
      // Directories first, then files
      if (a.type === 'directory' && b.type === 'file') return -1;
      if (a.type === 'file' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });
  } catch (error) {
    console.error('Error building file tree:', error);
    return [];
  }
}

// Helper function to search in files
async function searchInDirectory(dirPath, searchTerm, maxResults = 100) {
  const results = [];
  const searchRegex = new RegExp(searchTerm, 'gi');
  
  async function searchRecursively(currentPath, depth = 0) {
    if (depth > 5 || results.length >= maxResults) return;
    
    try {
      const items = await fs.readdir(currentPath);
      
      for (const item of items) {
        if (results.length >= maxResults) break;
        
        // Skip hidden files and common build directories
        if (item.startsWith('.') || ['node_modules', 'dist', 'build', '.git'].includes(item)) {
          continue;
        }
        
        const itemPath = path.join(currentPath, item);
        const stats = await fs.stat(itemPath);
        
        if (stats.isDirectory()) {
          await searchRecursively(itemPath, depth + 1);
        } else if (stats.isFile()) {
          // Only search in text files
          const ext = path.extname(item).toLowerCase();
          const textExtensions = ['.txt', '.js', '.ts', '.html', '.css', '.json', '.md', '.py', '.cpp', '.c', '.h', '.java', '.php', '.rb', '.go', '.rs'];
          
          if (textExtensions.includes(ext) || !ext) {
            try {
              const content = await fs.readFile(itemPath, 'utf8');
              const lines = content.split('\n');
              
              lines.forEach((line, lineNumber) => {
                const matches = line.match(searchRegex);
                if (matches) {
                  results.push({
                    file: itemPath,
                    fileName: item,
                    line: lineNumber + 1,
                    content: line.trim(),
                    matches: matches.length
                  });
                }
              });
            } catch (error) {
              // Skip files that can't be read as text
            }
          }
        }
      }
    } catch (error) {
      console.error('Error searching directory:', error);
    }
  }
  
  await searchRecursively(dirPath);
  return results;
}

// IPC listener (existing)
ipcMain.on('open-editor', () => {
  console.log("button clicked !");
  let command;

  switch (process.platform) {
    case 'win32': // Windows
      command = 'notepad';
      break;
    case 'darwin': // macOS
      command = 'open -a TextEdit';
      break;
    case 'linux': // Linux
      command = 'x-terminal-emulator -e nano'; // or just 'nano' if terminal already open
      break;
    default:
      console.log('Unsupported OS');
      return;
  }

  exec(command, (err) => {
    if (err) {
      console.error('Failed to open editor:', err);
    }
  });
});

// Handler to force load full file (bypass size limits)
ipcMain.handle('force-load-full-file', async (event, filePath) => {
  try {
    const buffer = await fs.readFile(filePath);
    const content = buffer.toString('utf8');
    
    return {
      success: true,
      content,
      totalSize: buffer.length,
      fileName: path.basename(filePath)
    };
  } catch (error) {
    console.error('Error force loading full file:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

app.whenReady().then(() => {
  mainWindow = createWindow();
});
