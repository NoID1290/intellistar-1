const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const config = require('./stream-config');

async function isServerRunning(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}`, (res) => {
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.end();
  });
}

async function startServerIfNeeded() {
  const running = await isServerRunning(config.port);
  if (!running && config.autoStartServer) {
    console.log(`[IPTV] Starting server on port ${config.port}...`);
    const serverProcess = spawn('node', ['app.js'], {
      cwd: __dirname,
      stdio: 'inherit',
    });
    // Wait for server to boot
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (await isServerRunning(config.port)) break;
    }
  }
}

async function startStreaming() {
  await startServerIfNeeded();

  const targetUrl = `http://127.0.0.1:${config.port}?iptv`;
  console.log(`[IPTV] Launching Headless Renderer target: ${targetUrl}`);

  if (config.outputMode === 'hls') {
    const hlsDir = path.resolve(__dirname, config.hlsDirectory);
    if (!fs.existsSync(hlsDir)) {
      fs.mkdirSync(hlsDir, { recursive: true });
    }
  }

  // Build FFmpeg Arguments based on target output mode
  let ffmpegArgs = [
    '-y',
    '-f', 'image2pipe',
    '-vcodec', 'mjpeg',
    '-r', `${config.fps}`,
    '-i', '-', // video input from stdin
    '-f', 'lavfi',
    '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', // silent/loopback audio bed
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-tune', 'zerolatency',
    '-pix_fmt', 'yuv420p',
    '-b:v', config.videoBitrate,
    '-c:a', 'aac',
    '-b:a', config.audioBitrate,
    '-ar', '44100',
    '-ac', '2',
    '-g', `${config.fps * 2}`,
  ];

  let outputPath = '';
  if (config.outputMode === 'hls') {
    const hlsPath = path.resolve(__dirname, config.hlsDirectory, config.hlsPlaylistName);
    outputPath = hlsPath;
    ffmpegArgs.push(
      '-f', 'hls',
      '-hls_time', `${config.hlsSegmentTime}`,
      '-hls_list_size', `${config.hlsListSize}`,
      '-hls_flags', 'delete_segments',
      hlsPath
    );
  } else if (config.outputMode === 'rtmp') {
    outputPath = config.rtmpUrl;
    ffmpegArgs.push('-f', 'flv', config.rtmpUrl);
  } else if (config.outputMode === 'udp') {
    outputPath = config.udpUrl;
    ffmpegArgs.push('-f', 'mpegts', config.udpUrl);
  }

  console.log(`[IPTV] Starting FFmpeg process (${config.outputMode.toUpperCase()}) -> ${outputPath}`);
  const ffmpeg = spawn('ffmpeg', ffmpegArgs);

  ffmpeg.stderr.on('data', (data) => {
    const msg = data.toString();
    if (msg.includes('Error') || msg.includes('fail')) {
      console.error(`[FFmpeg Error] ${msg.trim()}`);
    }
  });

  ffmpeg.on('close', (code) => {
    console.log(`[IPTV] FFmpeg exited with code ${code}`);
  });

  const browser = await puppeteer.launch({
    headless: 'new',
    defaultViewport: {
      width: config.width,
      height: config.height,
    },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });

  const page = await browser.newPage();
  await page.goto(targetUrl, { waitUntil: 'networkidle2' });

  // Wait for IPTV auto-start to kick in (settings menu hidden, forecast running)
  console.log('[IPTV] Waiting for forecast to start...');
  await page.waitForFunction(() => {
    const menu = document.getElementById('settings-menu');
    return menu && (menu.style.display === 'none' || getComputedStyle(menu).display === 'none');
  }, { timeout: 60000 });
  // Small buffer to let the first slide render
  await new Promise(r => setTimeout(r, 2000));

  console.log('[IPTV] Live capture started. Press Ctrl+C to stop.');

  const frameInterval = 1000 / config.fps;
  let capturing = true;

  const captureLoop = async () => {
    while (capturing) {
      const startTime = Date.now();
      try {
        const screenshot = await page.screenshot({
          type: 'jpeg',
          quality: 85,
        });
        if (ffmpeg.stdin.writable) {
          ffmpeg.stdin.write(screenshot);
        }
      } catch (err) {
        if (!capturing) break;
        console.error('[IPTV Capture Error]', err.message);
      }
      const elapsed = Date.now() - startTime;
      const wait = Math.max(0, frameInterval - elapsed);
      await new Promise((r) => setTimeout(r, wait));
    }
  };

  captureLoop();

  const cleanup = async () => {
    console.log('\n[IPTV] Shutting down IPTV stream pipeline...');
    capturing = false;
    try {
      await browser.close();
    } catch (e) {}
    try {
      ffmpeg.stdin.end();
      ffmpeg.kill('SIGINT');
    } catch (e) {}
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

startStreaming().catch((err) => {
  console.error('[IPTV Fatal Error]', err);
  process.exit(1);
});
