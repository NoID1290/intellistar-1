// Configuration for Headless Capture and IPTV Live Streaming (FFmpeg)

const isArm = process.arch === 'arm' || process.arch === 'arm64';

module.exports = {
  // Server port (matches default in app.js)
  port: process.env.PORT || 7070,

  // Capture Resolution & Frame Rate (browser render workload)
  captureWidth: 1920,
  captureHeight: 1080,
  fps: 30,

  // Output resolution for stream clients
  outputWidth: 1920,
  outputHeight: 1080,

  // Screenshot capture quality/speed tradeoff
  screenshotQuality: 80,
  screenshotOptimizeForSpeed: true,

  // Capture mode: "screencast" (CDP frame stream) or "screenshot" (legacy loop).
  // Linux ARM browsers have shown black-frame issues with CDP screencast, so
  // default those hosts to the more compatible screenshot path.
  captureMode: process.env.STREAM_CAPTURE_MODE || ((process.platform === 'linux' && (process.arch === 'arm' || process.arch === 'arm64')) ? "screenshot" : "screencast"),
  maxCaptureQueue: 2,

  // Encoding Quality Settings
  videoBitrate: "8000k",
  audioBitrate: "128k",
  // Video encoder: "auto", "h264_nvenc", "h264_qsv", "h264_amf", or "libx264"
  videoEncoder: process.env.STREAM_VIDEO_ENCODER || "auto",

  // libx264 preset override. Defaults to "superfast" on ARM and "ultrafast" elsewhere for minimal latency.
  x264Preset: process.env.STREAM_X264_PRESET || (isArm ? "superfast" : "ultrafast"),

  // Audio mode: "file", "system", or "silent"
  // "file" uses audioFile, "system" uses ffmpeg dshow device on Windows.
  audioMode: process.env.STREAM_AUDIO_MODE || "file",
  audioFile: process.env.STREAM_AUDIO_FILE || "./webroot/music/Track 1.mp3",
  audioDevice: process.env.STREAM_AUDIO_DEVICE || "virtual-audio-capturer",

  // Non-Windows system audio capture ("alsa" or "pulse")
  linuxAudioBackend: process.env.STREAM_AUDIO_BACKEND || "alsa",
  linuxAudioDevice: process.env.STREAM_AUDIO_DEVICE || "default",

  // Optional browser override for Puppeteer capture. Useful on Linux/ARM hosts
  // where the bundled Chromium download is unavailable or incompatible.
  browserExecutablePath: process.env.STREAM_BROWSER_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || null,

  // Target Output Mode: "hls" (HTTP Live Streaming), "rtmp", or "udp"
  outputMode: process.env.STREAM_MODE || "hls",

  // HLS Options
  hlsDirectory: "./webroot/stream",
  hlsPlaylistName: "index.m3u8",
  hlsSegmentTime: 1, // seconds per segment
  hlsListSize: 6,    // number of segments kept in playlist

  // RTMP Output URL (used when outputMode = "rtmp")
  rtmpUrl: process.env.RTMP_URL || "rtmp://localhost/live/intellistar",

  // UDP Multicast Output URL (used when outputMode = "udp")
  udpUrl: process.env.UDP_URL || "udp://239.255.42.42:1234?pkt_size=1316",

  // Auto-launch local server if not already active
  autoStartServer: true,
};
