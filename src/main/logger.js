const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const logFilePath = path.join(app.getPath('userData'), 'startup_log.txt');
const logDir = path.dirname(logFilePath);
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

function logToFile(message) {
  fs.appendFileSync(logFilePath, `${new Date().toISOString()} - ${message}\n`);
  console.log(message);
}

module.exports = { logToFile };