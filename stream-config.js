// Configuration for Headless Capture and IPTV Live Streaming (FFmpeg)

module.exports = {
  // Server port (matches default in app.js)
  port: process.env.PORT || 7070,

  // Stream Resolution & Frame Rate
  width: 1280,
  height: 720,
  fps: 30,

  // Encoding Quality Settings
  videoBitrate: "4000k",
  audioBitrate: "128k",

  // Target Output Mode: "hls" (HTTP Live Streaming), "rtmp", or "udp"
  outputMode: process.env.STREAM_MODE || "hls",

  // HLS Options
  hlsDirectory: "./webroot/stream",
  hlsPlaylistName: "index.m3u8",
  hlsSegmentTime: 2, // seconds per segment
  hlsListSize: 5,    // number of segments kept in playlist

  // RTMP Output URL (used when outputMode = "rtmp")
  rtmpUrl: process.env.RTMP_URL || "rtmp://localhost/live/intellistar",

  // UDP Multicast Output URL (used when outputMode = "udp")
  udpUrl: process.env.UDP_URL || "udp://239.255.42.42:1234?pkt_size=1316",

  // Auto-launch local server if not already active
  autoStartServer: true,
};
