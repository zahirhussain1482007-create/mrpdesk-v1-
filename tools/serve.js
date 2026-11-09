/* Minimal static server for local testing and LAN use.
 * Run: node tools/serve.js
 */
'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');
var url = require('url');

var ROOT = path.resolve(__dirname, '..');
var PORT = parseInt(process.env.PORT, 10) || 4173;
var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

http.createServer(function (req, res) {
  var pathname;
  try {
    pathname = decodeURIComponent(url.parse(req.url).pathname);
  } catch (error) {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }

  if (pathname === '/') pathname = '/index.html';
  var file = path.normalize(path.join(ROOT, pathname));
  if (file.indexOf(ROOT) !== 0) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(file, function (statError, stats) {
    if (statError || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    var ext = path.extname(file).toLowerCase();
    var noCache = ext === '.html' || ext === '.json' || ext === '.js' || ext === '.css';
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stats.size,
      'Cache-Control': noCache ? 'no-cache' : 'public, max-age=86400'
    });

    var stream = fs.createReadStream(file);
    stream.on('error', function () {
      res.destroy();
    });
    stream.pipe(res);
  });
}).listen(PORT, '0.0.0.0', function () {
  console.log('MRP Desk V1 running at http://localhost:' + PORT);
  console.log('On the iPad, use http://<this-computer-ip>:' + PORT);
});
