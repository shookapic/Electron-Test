/**
 * @fileoverview Main entry point for the CTrace GUI Electron application.
 * 
 * This file initializes the Electron app, creates the main window, and sets up
 * all IPC handlers for communication between the main and renderer processes.
 * 
 * @author CTrace GUI Team
 * @version 1.0.0
 */

const { app, BrowserWindow, nativeImage } = require('electron');
const path = require('path');

// Import IPC handlers
const { setupFileHandlers } = require('./main/ipc/fileHandlers');
const { setupEditorHandlers } = require('./main/ipc/editorHandlers');
const { setupCtraceHandlers } = require('./main/ipc/ctraceHandlers');

/**
 * Creates and configures the main application window.
 * 
 * This function sets up the BrowserWindow with appropriate dimensions,
 * icon, and security settings. It loads the main HTML file and configures
 * the window appearance.
 * 
 * @function createWindow
 * @returns {BrowserWindow} The created main window instance
 * 
 * @example
 * const mainWindow = createWindow();
 */
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

// Global reference to main window
let mainWindow;

app.whenReady().then(() => {
  mainWindow = createWindow();
  
  // Setup IPC handlers
  setupFileHandlers(mainWindow);
  setupEditorHandlers();
  setupCtraceHandlers();
});
