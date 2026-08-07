const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const port = process.env.PORT || 7070;

// Serve MYCONFIG.json from project root so the frontend can auto-load it
app.get('/api/config', (req, res) => {
    const preferredPath = path.join(__dirname, 'myConfig.json');
    const fallbackPath = path.join(__dirname, 'MYCONFIG.json');
    if (fs.existsSync(preferredPath)) {
        res.sendFile(preferredPath);
    } else if (fs.existsSync(fallbackPath)) {
        res.sendFile(fallbackPath);
    } else {
        res.status(404).json({ error: 'MYCONFIG.json not found' });
    }
});

app.use(express.static(path.join(__dirname, 'webroot'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.m3u8') || filePath.endsWith('.ts')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));

app.listen(port, '0.0.0.0', () => {
    console.log("IntelliSTAR 1 by Mist Weather Media");
    console.log(`Webroot serving on 127.0.0.1:${port}`);
});
