const { app, BrowserWindow } = require('electron');
const path = require('path');
const express = require('express');

let mainWindow;

// Initialize Express app
const expressApp = express();

// Serve frontend static files
expressApp.use(express.static(path.join(__dirname, 'public')));

// Sample API route
expressApp.get('/api/message', (req, res) => {
  res.json({ message: '✅ Hello from Express API inside Electron!' });
});

// Start Express server
const server = expressApp.listen(3000, () => {
  console.log('🚀 Express server running at http://localhost:3000');
});

// Create the Electron window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Load the local server page
  mainWindow.loadURL('http://localhost:3000');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App ready
app.whenReady().then(createWindow);

// Handle app close
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    server.close(); // stop Express
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
