const fs = require('fs');
const path = require('path');

// Create a simple test video file (small MP4)
const testVideoData = Buffer.from([
  0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6F, 0x6D,
  0x00, 0x00, 0x02, 0x00, 0x69, 0x73, 0x6F, 0x6D, 0x69, 0x73, 0x6F, 0x32,
  0x61, 0x76, 0x63, 0x31, 0x6D, 0x70, 0x34, 0x31
]);

const testVideoPath = path.join(__dirname, 'test-video.mp4');
fs.writeFileSync(testVideoPath, testVideoData);

console.log('Test video file created at:', testVideoPath);

// Test upload via curl
const { spawn } = require('child_process');

const curl = spawn('curl', [
  '-X', 'POST',
  '-H', 'Content-Type: multipart/form-data',
  '-F', `file=@${testVideoPath}`,
  '-F', 'type=memory_verse',
  '-F', 'content=Test video upload to Object Storage',
  'http://localhost:5000/api/posts',
  '-b', 'cookies.txt',
  '-c', 'cookies.txt'
]);

curl.stdout.on('data', (data) => {
  console.log('Upload response:', data.toString());
});

curl.stderr.on('data', (data) => {
  console.error('Upload error:', data.toString());
});

curl.on('close', (code) => {
  console.log('Upload process exited with code:', code);
  // Clean up test file
  fs.unlinkSync(testVideoPath);
  console.log('Test file cleaned up');
});