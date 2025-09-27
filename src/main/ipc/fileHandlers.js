const { ipcMain, dialog } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const { detectFileEncoding, buildFileTree, searchInDirectory, FILE_SIZE_LIMIT } = require('../utils/fileUtils');

/**
 * Setup all IPC handlers for file operations
 * @param {BrowserWindow} mainWindow - Main window reference
 */
function setupFileHandlers(mainWindow) {
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
}

module.exports = { setupFileHandlers };