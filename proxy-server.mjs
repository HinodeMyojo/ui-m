// Tiny DeepL proxy that tunnels through an upstream HTTP proxy
import http from 'http';
import https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';

const UPSTREAM_PROXY = process.env.UPSTREAM_PROXY; // http://user:pass@host:port
const PORT = 3001;

const TARGETS = {
    '/deepl-free/': 'https://api-free.deepl.com',
    '/deepl-pro/':  'https://api.deepl.com',
};

const agent = UPSTREAM_PROXY ? new HttpsProxyAgent(UPSTREAM_PROXY) : undefined;

const server = http.createServer((req, res) => {
    // CORS preflight
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    let target = null;
    let stripped = null;
    for (const [prefix, host] of Object.entries(TARGETS)) {
        if (req.url.startsWith(prefix)) {
            target = host;
            stripped = req.url.slice(prefix.length - 1); // keep leading /
            break;
        }
    }
    if (!target) { res.writeHead(404); res.end('Not found'); return; }

    const url = new URL(stripped, target);
    const options = {
        method: req.method,
        headers: { ...req.headers, host: url.host },
        agent,
    };
    delete options.headers['accept-encoding']; // avoid compressed response issues

    const upstream = https.request(url, options, (upRes) => {
        res.writeHead(upRes.statusCode, upRes.headers);
        upRes.pipe(res);
    });
    upstream.on('error', (e) => { res.writeHead(502); res.end(e.message); });
    req.pipe(upstream);
});

server.listen(PORT, () => console.log(`DeepL proxy listening on :${PORT}`));
