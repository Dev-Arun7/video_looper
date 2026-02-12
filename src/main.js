// Import Electron modules
const { app, BrowserWindow } = require('electron');
const path = require('path');

// Import remote module to allow renderer to access dialog
require('@electron/remote/main').initialize();

// Function to create the main application window
function createWindow() {
    const win = new BrowserWindow({
        width: 1000,           // Window width in pixels
        height: 700,           // Window height in pixels
        webPreferences: {
            nodeIntegration: true,      // Allow Node.js in renderer (lets us run Python from UI)
            contextIsolation: false,    // Allow direct access between main and renderer
            enableRemoteModule: true    // Enable remote module for file dialogs
        }
    });
    
    // Enable remote for this window (allows renderer.js to use dialog)
    require('@electron/remote/main').enable(win.webContents);
    
    // Load the HTML file into the window
    win.loadFile(path.join(__dirname, 'index.html'));
}

// When Electron is ready, create the window
app.whenReady().then(createWindow);

// Quit app when all windows are closed (except on Mac)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();  // darwin = macOS
});