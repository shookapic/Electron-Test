const { app, BrowserWindow, nativeImage, ipcMain } = require('electron');
const { exec } = require('child_process');
const path = require('path');

function createWindow () {
  const iconPath = path.join(__dirname, '../assets/ctrace.png');
  const iconApp = nativeImage.createFromPath(iconPath);

  const win = new BrowserWindow({
    width: 800,
    height: 600,
    icon: iconApp,
    webPreferences: {
      nodeIntegration: true,      // allows require() in renderer
      contextIsolation: false     // disables security isolation
    }
  });

  win.loadFile('src/index.html');
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

// IPC listener
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

app.whenReady().then(() => {
  createWindow();
});
