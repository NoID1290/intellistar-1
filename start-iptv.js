const puppeteer = require('puppeteer');
const { spawn, spawnSync } = require('child_process');
const { PassThrough } = require('stream');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const config = require('./stream-config');

const isArm = process.arch === 'arm64' || process.arch === 'arm';
const cpuCount = Math.max(1, os.cpus().length);

function getAvailableVideoEncoders() {
  try {
    const result = spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' });
    const output = `${result.stdout || ''}\n${result.stderr || ''}`;
    return output;
  } catch (e) {
    return '';
  }
}

function getWindowsDshowAudioDevices() {
  try {
    const result = spawnSync('ffmpeg', ['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'], { encoding: 'utf8' });
    const output = `${result.stdout || ''}\n${result.stderr || ''}`;
    const matches = [];
    const regex = /"([^"]+)"\s+\(audio\)/g;
    let m;
    while ((m = regex.exec(output)) !== null) {
      matches.push(m[1]);
    }
    return matches;
  } catch (e) {
    return [];
  }
}

function resolveVideoEncoder(preferredEncoder) {
  const encodersOutput = getAvailableVideoEncoders();
  const has = (name) => encodersOutput.includes(name);

  if (preferredEncoder && preferredEncoder !== 'auto') {
    if (has(preferredEncoder)) return preferredEncoder;
    console.warn(`[IPTV] Requested encoder '${preferredEncoder}' not found. Falling back to auto.`);
  }

  // The Pi 5 (BCM2712) dropped the H.264 encode block, so h264_v4l2m2m is
  // listed by Debian ffmpeg builds but will fail at runtime. Never auto-pick it.
  if (isArm) {
    if (has('h264_v4l2m2m')) {
      console.warn('[IPTV] Ignoring h264_v4l2m2m: no usable hardware H.264 encoder on Pi 5. Using libx264.');
    }
    return 'libx264';
  }

  if (has('h264_nvenc')) return 'h264_nvenc';
  if (has('h264_qsv')) return 'h264_qsv';
  if (has('h264_amf')) return 'h264_amf';
  return 'libx264';
}

function findExecutableOnPath(command) {
  const locator = process.platform === 'win32' ? 'where' : 'which';

  try {
    const result = spawnSync(locator, [command], { encoding: 'utf8' });
    if (result.status !== 0) return null;

    const match = `${result.stdout || ''}`
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .find(Boolean);

    return match && fs.existsSync(match) ? match : null;
  } catch (e) {
    return null;
  }
}

function resolveBrowserExecutablePath() {
  const configuredPath = config.browserExecutablePath;
  if (configuredPath) {
    const resolvedFromPath = path.isAbsolute(configuredPath)
      ? configuredPath
      : (findExecutableOnPath(configuredPath) || path.resolve(configuredPath));

    if (!fs.existsSync(resolvedFromPath)) {
      throw new Error(
        `[IPTV] Configured browser executable was not found: ${resolvedFromPath}. ` +
        'Set STREAM_BROWSER_PATH or PUPPETEER_EXECUTABLE_PATH to a valid Chromium/Chrome binary.'
      );
    }
    return resolvedFromPath;
  }

  const candidates = process.platform === 'linux'
    ? [
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/snap/bin/chromium',
        'chromium-browser',
        'chromium',
        'google-chrome',
        'google-chrome-stable',
      ]
    : process.platform === 'darwin'
      ? [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
          'google-chrome',
          'chromium',
        ]
      : [
          'chrome',
          'msedge',
        ];

  for (const candidate of candidates) {
    if (path.isAbsolute(candidate)) {
      if (fs.existsSync(candidate)) return candidate;
      continue;
    }

    const resolvedCandidate = findExecutableOnPath(candidate);
    if (resolvedCandidate) return resolvedCandidate;
  }

  if (process.platform === 'linux' && isArm) {
    throw new Error(
      '[IPTV] No system Chromium/Chrome binary was found on this Linux ARM host. ' +
      'Install chromium-browser (or chromium) and retry, or set STREAM_BROWSER_PATH to the browser binary.'
    );
  }

  return null;
}

function buildBrowserLaunchOptions(captureWidth, captureHeight) {
  const executablePath = resolveBrowserExecutablePath();
  if (executablePath) {
    console.log(`[IPTV] Using browser executable: ${executablePath}`);
  } else {
    console.log('[IPTV] Using Puppeteer managed browser executable.');
  }

  return {
    headless: 'new',
    executablePath: executablePath || undefined,
    defaultViewport: {
      width: captureWidth,
      height: captureHeight,
    },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--enable-gpu',
      '--ignore-gpu-blocklist',
      '--enable-accelerated-2d-canvas',
      '--enable-gpu-rasterization',
      '--enable-zero-copy',
      '--autoplay-policy=no-user-gesture-required',
      // Remove the 60fps/vsync ceiling and the throttling applied to non-visible renderers.
      '--disable-frame-rate-limit',
      '--disable-gpu-vsync',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling',
      '--force-device-scale-factor=1',
      `--window-size=${captureWidth},${captureHeight}`,
      // Pi 5 headless needs EGL to reach the V3D GPU; ANGLE/desktop GL is unavailable.
      ...(isArm ? ['--use-gl=egl', '--use-angle=gl'] : []),
    ],
  };
}

function attachPageDiagnostics(page) {
  page.on('console', (msg) => {
    const text = msg.text();
    if (!text) return;

    if (msg.type() === 'error') {
      console.error(`[Page Error] ${text}`);
      return;
    }

    if (/\[IPTV\]|\[Config\]|Weather grab done|Location Error|Failed to load|Auto-start mode detected|Data ready, starting forecast/i.test(text)) {
      console.log(`[Page] ${text}`);
    }
  });

  page.on('pageerror', (err) => {
    console.error(`[Page Crash] ${err.message}`);
  });

  page.on('requestfailed', (request) => {
    const failure = request.failure();
    const url = request.url();
    if (/api\.weather\.com|\/api\/config/i.test(url)) {
      console.error(`[Page Request Failed] ${request.method()} ${url} :: ${failure ? failure.errorText : 'unknown error'}`);
    }
  });
}

async function getPageStartupState(page) {
  return page.evaluate(() => {
    const menu = document.getElementById('settings-menu');
    const blackscreen = document.getElementById('blackscreen');
    const startButton = document.getElementById('startbutton');
    const getState = (el) => {
      if (!el) return null;
      const style = getComputedStyle(el);
      return {
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
      };
    };

    const visibleSlides = Array.from(document.querySelectorAll('.slides > div'))
      .filter((el) => {
        const style = getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || '1') > 0;
      })
      .map((el) => el.className);

    return {
      inSettings: typeof window.inSettings === 'undefined' ? null : window.inSettings,
      startButton: startButton ? {
        pointerEvents: startButton.style.pointerEvents,
        opacity: startButton.style.opacity,
        disabled: startButton.disabled === true,
      } : null,
      menu: getState(menu),
      blackscreen: getState(blackscreen),
      visibleSlides,
      locationText: document.querySelector('.loctext') ? document.querySelector('.loctext').textContent : '',
      dataUpdatedText: document.querySelector('.data-updated') ? document.querySelector('.data-updated').textContent : '',
      title: document.title,
    };
  });
}

async function waitForForecastReady(page, timeoutMs) {
  try {
    await page.waitForFunction(() => {
      const blackscreen = document.getElementById('blackscreen');
      const overlayHidden = !blackscreen || (() => {
        const style = getComputedStyle(blackscreen);
        return style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || '1') === 0;
      })();

      const visibleSlide = Array.from(document.querySelectorAll('.slides > div')).some((el) => {
        const style = getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || '1') > 0;
      });

      return overlayHidden && visibleSlide;
    }, { timeout: timeoutMs });
  } catch (err) {
    const startupState = await getPageStartupState(page).catch(() => null);
    const detail = startupState ? ` Startup state: ${JSON.stringify(startupState)}` : '';
    throw new Error(`Timed out waiting for visible forecast content.${detail}`);
  }
}

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
  const videoEncoder = resolveVideoEncoder(config.videoEncoder || 'auto');

  const captureWidth = config.captureWidth || config.width || 1280;
  const captureHeight = config.captureHeight || config.height || 720;
  const outputWidth = config.outputWidth || captureWidth;
  const outputHeight = config.outputHeight || captureHeight;

  const targetUrl = `http://127.0.0.1:${config.port}?iptv`;
  const browserLaunchOptions = buildBrowserLaunchOptions(captureWidth, captureHeight);
  console.log(`[IPTV] Launching Headless Renderer target: ${targetUrl}`);
  console.log(`[IPTV] Capture mode: ${config.captureMode}`);

  if (config.outputMode === 'hls') {
    const hlsDir = path.resolve(__dirname, config.hlsDirectory);
    if (!fs.existsSync(hlsDir)) {
      fs.mkdirSync(hlsDir, { recursive: true });
    }
    // Clear stale playlist/segments so FFmpeg does not churn on missing old indices.
    const hlsFiles = fs.readdirSync(hlsDir);
    for (const file of hlsFiles) {
      if (/^index.*\.(m3u8|ts)$/.test(file)) {
        try {
          fs.unlinkSync(path.join(hlsDir, file));
        } catch (e) {}
      }
    }
  }

  // Build FFmpeg Arguments based on target output mode
  let ffmpegArgs = [
    '-y',
    '-fflags', '+genpts',
    '-thread_queue_size', '1024',
    '-f', 'image2pipe',
    '-vcodec', 'mjpeg',
    // MJPEG decode is a real cost on ARM; spread it across all cores.
    '-threads', `${cpuCount}`,
    '-framerate', `${config.fps}`,
    '-i', '-', // video input from stdin
  ];

  let audioPipe = null;
  if (config.audioMode === 'browser') {
    audioPipe = new PassThrough();
    console.log('[IPTV] Audio mode: browser (live WebAudio capture)');
    ffmpegArgs.push(
      '-f', 'webm',
      '-i', 'pipe:3'
    );
  } else if (config.audioMode === 'file') {
    const audioFilePath = path.resolve(__dirname, config.audioFile);
    if (fs.existsSync(audioFilePath)) {
      ffmpegArgs.push(
        '-stream_loop', '-1',
        '-i', audioFilePath
      );
    } else {
      console.warn(`[IPTV] Audio file not found (${audioFilePath}); falling back to silent audio.`);
      ffmpegArgs.push(
        '-f', 'lavfi',
        '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100'
      );
    }
  } else if (config.audioMode === 'system') {
    if (process.platform === 'win32') {
      let audioDev = config.audioDevice;
      const available = getWindowsDshowAudioDevices();
      if (available.length > 0 && !available.includes(audioDev)) {
        console.log(`[IPTV] Configured audio device "${audioDev}" not found.`);
        // Exclude microphone devices to avoid capturing voice mics by mistake
        const nonMics = available.filter((d) => !/mic|microphone/i.test(d));
        const match = nonMics.find((d) => /virtual|stereo mix|wave out|cable|what u hear|stream/i.test(d));
        if (match) {
          console.log(`[IPTV] Auto-selected loopback audio capture device: "${match}"`);
          audioDev = match;
        } else {
          console.warn(`[IPTV] Available DirectShow devices:`, available);
          console.warn(`[IPTV] To capture live browser audio on Windows, set STREAM_AUDIO_DEVICE to your virtual audio cable or stereo mix device.`);
        }
      }
      console.log(`[IPTV] Using DirectShow audio device: "${audioDev}"`);
      ffmpegArgs.push('-f', 'dshow', '-i', `audio=${audioDev}`);
    } else {
      const linuxDevice = process.env.STREAM_AUDIO_DEVICE || config.linuxAudioDevice || 'default';
      ffmpegArgs.push('-f', config.linuxAudioBackend || 'alsa', '-i', linuxDevice);
    }
  } else {
    ffmpegArgs.push(
      '-f', 'lavfi',
      '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100'
    );
  }

  ffmpegArgs.push(
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-c:v', videoEncoder,
    '-pix_fmt', 'yuv420p',
    '-b:v', config.videoBitrate,
    '-maxrate', config.videoBitrate,
    '-bufsize', `${parseInt(config.videoBitrate, 10) * 2 || 5000}k`,
    '-c:a', 'aac',
    '-b:a', config.audioBitrate,
    '-ar', '44100',
    '-ac', '2',
    '-g', `${config.fps}`,
    '-keyint_min', `${Math.max(1, Math.floor(config.fps / 2))}`,
    '-sc_threshold', '0',
    '-bf', '0',
    '-r', `${config.fps}`,
    '-fps_mode', 'cfr',
  );

  if (videoEncoder === 'libx264') {
    const x264Preset = config.x264Preset || (isArm ? 'superfast' : 'ultrafast');
    ffmpegArgs.push(
      '-preset', x264Preset,
      '-tune', 'zerolatency',
      '-profile:v', 'high',
      '-level', '4.0',
      '-threads', `${cpuCount}`,
      // Frame-parallel threading buffers whole frames; sliced threads keep the
      // pipeline realtime, which is what matters on a 4-core Pi 5.
      '-x264-params',
      `sliced-threads=1:threads=${cpuCount}:rc-lookahead=0:sync-lookahead=0:ref=1:bframes=0:aq-mode=0:mbtree=0:scenecut=0`
    );
  } else if (videoEncoder === 'h264_nvenc') {
    ffmpegArgs.push('-preset', 'p1', '-tune', 'll', '-rc', 'cbr', '-delay', '0', '-zerolatency', '1', '-profile:v', 'high');
  } else if (videoEncoder === 'h264_qsv') {
    ffmpegArgs.push('-preset', 'veryfast', '-look_ahead', '0');
  } else if (videoEncoder === 'h264_amf') {
    ffmpegArgs.push('-quality', 'speed', '-usage', 'lowlatency');
  }

  // Screencast frames can drift in size, so always normalize to the exact output raster.
  ffmpegArgs.push(
    '-vf',
    `scale=${outputWidth}:${outputHeight}:flags=bicubic:force_original_aspect_ratio=decrease,` +
    `pad=${outputWidth}:${outputHeight}:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p`
  );

  let outputPath = '';
  if (config.outputMode === 'hls') {
    const hlsPath = path.resolve(__dirname, config.hlsDirectory, config.hlsPlaylistName).replace(/\\/g, '/');
    const hlsSegmentPattern = path.resolve(__dirname, config.hlsDirectory, 'index%d.ts').replace(/\\/g, '/');
    outputPath = hlsPath;
    ffmpegArgs.push(
      '-f', 'hls',
      '-hls_time', `${config.hlsSegmentTime}`,
      '-hls_list_size', `${config.hlsListSize}`,
      '-hls_segment_filename', hlsSegmentPattern,
      '-hls_flags', 'delete_segments+omit_endlist+independent_segments+program_date_time',
      '-hls_allow_cache', '0',
      hlsPath
    );
  } else if (config.outputMode === 'rtmp') {
    outputPath = config.rtmpUrl;
    ffmpegArgs.push('-f', 'flv', config.rtmpUrl);
  } else if (config.outputMode === 'udp') {
    outputPath = config.udpUrl;
    ffmpegArgs.push('-f', 'mpegts', config.udpUrl);
  }

  console.log(`[IPTV] Starting FFmpeg process (${config.outputMode.toUpperCase()}, ${videoEncoder}) -> ${outputPath}`);
  const ffmpegStdio = (config.audioMode === 'browser' && audioPipe)
    ? ['pipe', 'pipe', 'pipe', 'pipe']
    : ['pipe', 'pipe', 'pipe'];

  const ffmpeg = spawn('ffmpeg', ffmpegArgs, { stdio: ffmpegStdio });

  if (config.audioMode === 'browser' && audioPipe && ffmpeg.stdio[3]) {
    audioPipe.pipe(ffmpeg.stdio[3]);
  }

  ffmpeg.stderr.on('data', (data) => {
    const msg = data.toString();
    if ((msg.includes('Error') || msg.includes('fail')) && !msg.includes('failed to delete old segment')) {
      console.error(`[FFmpeg Error] ${msg.trim()}`);
    }
  });

  ffmpeg.on('close', (code) => {
    console.log(`[IPTV] FFmpeg exited with code ${code}`);
  });

  const browser = await puppeteer.launch(browserLaunchOptions);

  const page = await browser.newPage();
  attachPageDiagnostics(page);

  if (config.audioMode === 'browser' && audioPipe) {
    await page.exposeFunction('sendAudioChunk', (base64Data) => {
      if (audioPipe && !audioPipe.destroyed) {
        audioPipe.write(Buffer.from(base64Data, 'base64'));
      }
    });
  }
  await page.goto(targetUrl, { waitUntil: 'networkidle2' });

  // Wait for the first visible forecast slide instead of inferring readiness from menu state.
  console.log('[IPTV] Waiting for forecast to start...');
  await waitForForecastReady(page, 120000);
  // Small buffer to let the first visible slide render before capture begins.
  await new Promise(r => setTimeout(r, 2000));

  console.log('[IPTV] Live capture started. Press Ctrl+C to stop.');

  const frameInterval = 1000 / config.fps;
  let capturing = true;
  let shuttingDown = false;
  let framesCaptured = 0;
  const captureStartedAt = Date.now();
  let cdpSession = null;
  let latestFrameBuffer = null;
  let writerBusy = false;
  let screencastWriterTimer = null;
  let repeatedFrames = 0;
  let hasFreshFrame = false;

  const stopCapture = () => {
    capturing = false;
  };

  page.on('close', stopCapture);
  page.on('error', stopCapture);
  browser.on('disconnected', stopCapture);

  const writeFrame = async (buffer) => {
    if (!ffmpeg.stdin.writable) return;
    const canContinue = ffmpeg.stdin.write(buffer);
    if (!canContinue) {
      await new Promise((resolve) => ffmpeg.stdin.once('drain', resolve));
    }
  };

  const captureLoop = async () => {
    while (capturing) {
      const startTime = Date.now();
      try {
        const screenshot = await page.screenshot({
          type: 'jpeg',
          quality: config.screenshotQuality,
          optimizeForSpeed: config.screenshotOptimizeForSpeed,
        });
        await writeFrame(screenshot);
        framesCaptured++;
        if (framesCaptured % 300 === 0) {
          const elapsedSec = (Date.now() - captureStartedAt) / 1000;
          const actualFps = (framesCaptured / elapsedSec).toFixed(1);
          console.log(`[IPTV] Capture health: ${framesCaptured} frames, avg ${actualFps} fps`);
        }
      } catch (err) {
        if (!capturing) break;
        if (err && /Target closed|Session closed|Protocol error/i.test(err.message)) {
          console.error('[IPTV] Capture session ended; stopping capture loop.');
          capturing = false;
          break;
        }
        console.error('[IPTV Capture Error]', err.message);
      }
      const elapsed = Date.now() - startTime;
      const wait = Math.max(0, frameInterval - elapsed);
      await new Promise((r) => setTimeout(r, wait));
    }
  };

  const logCaptureHealth = () => {
    if (framesCaptured % 300 === 0) {
      const elapsedSec = (Date.now() - captureStartedAt) / 1000;
      const actualFps = (framesCaptured / elapsedSec).toFixed(1);
      const repeatPct = ((repeatedFrames / framesCaptured) * 100).toFixed(0);
      console.log(`[IPTV] Capture health: ${framesCaptured} frames, avg ${actualFps} fps, ${repeatPct}% repeated`);
    }
  };

  if (config.captureMode === 'screencast') {
    cdpSession = await page.target().createCDPSession();
    await cdpSession.send('Page.startScreencast', {
      format: 'jpeg',
      quality: config.screenshotQuality,
      maxWidth: captureWidth,
      maxHeight: captureHeight,
      everyNthFrame: 1,
    });

    cdpSession.on('Page.screencastFrame', async ({ data, sessionId }) => {
      try {
        // Ack immediately so Chrome is never blocked by encoder backpressure.
        await cdpSession.send('Page.screencastFrameAck', { sessionId });

        if (!capturing) {
          return;
        }

        latestFrameBuffer = Buffer.from(data, 'base64');
        hasFreshFrame = true;
      } catch (err) {
        if (capturing) {
          if (err && /Target closed|Session closed|Protocol error/i.test(err.message)) {
            console.error('[IPTV] Screencast session ended; stopping capture.');
            capturing = false;
            return;
          }
          console.error('[IPTV Screencast Error]', err.message);
        }
      }
    });

    // Constant-rate pacer: Chromium only emits frames on repaint, so idle ticks
    // re-send the last frame to keep the MJPEG pipe at a true CFR cadence.
    let nextTickAt = Date.now() + frameInterval;
    const pump = async () => {
      if (!capturing) return;

      if (!writerBusy && latestFrameBuffer) {
        writerBusy = true;
        const frameToWrite = latestFrameBuffer;
        if (!hasFreshFrame) repeatedFrames++;
        hasFreshFrame = false;

        try {
          await writeFrame(frameToWrite);
          framesCaptured++;
          logCaptureHealth();
        } catch (err) {
          if (capturing) {
            if (err && /Target closed|Session closed|Protocol error/i.test(err.message)) {
              console.error('[IPTV] Screencast writer ended; stopping capture.');
              capturing = false;
              return;
            }
            console.error('[IPTV Screencast Writer Error]', err.message);
          }
        } finally {
          writerBusy = false;
        }
      }

      nextTickAt += frameInterval;
      const delay = Math.max(0, nextTickAt - Date.now());
      if (delay === 0) nextTickAt = Date.now(); // resync after a stall instead of bursting
      screencastWriterTimer = setTimeout(pump, delay);
    };
    screencastWriterTimer = setTimeout(pump, frameInterval);
  } else {
    captureLoop();
  }

  const cleanup = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('\n[IPTV] Shutting down IPTV stream pipeline...');
    capturing = false;
    if (screencastWriterTimer) {
      clearTimeout(screencastWriterTimer);
      screencastWriterTimer = null;
    }
    try {
      if (cdpSession) {
        try {
          await cdpSession.send('Page.stopScreencast');
        } catch (e) {}
      }
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
