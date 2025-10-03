const { ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

/**
 * Setup IPC handlers for running the ctrace binary
 */
function setupCtraceHandlers() {
  ipcMain.handle('run-ctrace', async (event, args = []) => {
    // Resolve binary in dev and production (packaged) locations
    // __dirname is .../src/main/ipc, so project root bin is ../../bin/ctrace
    const devPath = path.join(__dirname, '../../../bin/ctrace');
    const prodPath = path.join(process.resourcesPath || '', 'bin', 'ctrace');

    async function resolveBinary() {
      try {
        await fs.access(devPath);
        return devPath;
      } catch (_) {
        try {
          await fs.access(prodPath);
          return prodPath;
        } catch (__) {
          return null;
        }
      }
    }

    try {
      const binPath = await resolveBinary();
      if (!binPath) {
        return { success: false, error: `ctrace binary not found at: ${devPath} or ${prodPath}` };
      }

      return await new Promise((resolve) => {
        console.log('args',args);
        const child = spawn(binPath, Array.isArray(args) ? args : [], {
          stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        child.on('error', (err) => {
          resolve({ success: false, error: err.message });
        });

        child.on('close', (code) => {
          if (code === 0) {
            resolve({ success: true, output: stdout, exitCode: code });
          } else {
            resolve({ success: false, error: `ctrace exited with code ${code}`, stderr, output: stdout, exitCode: code });
          }
        });
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

module.exports = { setupCtraceHandlers };
