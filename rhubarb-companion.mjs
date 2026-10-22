#!/usr/bin/env node
/**
 * Cartoon Speaks V2 — Local Rhubarb Lip Sync Companion Service
 * 
 * This is an OPTIONAL local runner that lets the Cartoon Speaks V2 web app
 * execute your local Rhubarb CLI executable without sending any media to the cloud.
 * 
 * Requirements:
 * - Rhubarb Lip Sync binary installed and available in PATH (or specify RHUBARB_PATH)
 *   Download from: https://github.com/DanielSWolf/rhubarb-lip-sync/releases
 * 
 * Usage:
 *   node rhubarb-companion.mjs
 *   (or: RHUBARB_PATH="C:/path/to/rhubarb.exe" node rhubarb-companion.mjs)
 */

import http from 'http';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const PORT = process.env.PORT || 8765;
const RHUBARB_BIN = process.env.RHUBARB_PATH || 'rhubarb';

const server = http.createServer(async (req, res) => {
  // CORS Headers allowing local static frontend to connect
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', runner: 'rhubarb-local-companion', version: '2.0.0' }));
    return;
  }

  if (req.url === '/analyze' && req.method === 'POST') {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', async () => {
      const body = Buffer.concat(chunks);
      const tempDir = os.tmpdir();
      const tempAudio = path.join(tempDir, `audio_${Date.now()}.wav`);
      const tempOut = path.join(tempDir, `cues_${Date.now()}.json`);

      try {
        fs.writeFileSync(tempAudio, body);

        // Run Rhubarb CLI locally
        const rhubarbProcess = spawn(RHUBARB_BIN, [
          '-f', 'json',
          '-r', 'phonetic',
          tempAudio,
          '-o', tempOut
        ]);

        let stderr = '';
        rhubarbProcess.stderr.on('data', (d) => stderr += d.toString());

        rhubarbProcess.on('close', (code) => {
          if (code === 0 && fs.existsSync(tempOut)) {
            const jsonOutput = fs.readFileSync(tempOut, 'utf-8');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(jsonOutput);
          } else {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end(`Rhubarb error (exit code ${code}): ${stderr}`);
          }

          // Clean temporary files
          try { if (fs.existsSync(tempAudio)) fs.unlinkSync(tempAudio); } catch {}
          try { if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut); } catch {}
        });
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Companion server error: ${err.message}`);
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Cartoon Speaks V2 Local Rhubarb Companion running at http://127.0.0.1:${PORT}`);
  console.log(`Using Rhubarb binary: "${RHUBARB_BIN}"`);
  console.log(`Ready to receive audio from your local Cartoon Speaks V2 browser window.`);
});
