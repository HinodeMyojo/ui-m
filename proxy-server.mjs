// Proxy server: forwards API requests through an upstream HTTP proxy if configured
import http from 'http';
import https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';

const UPSTREAM_PROXY = process.env.UPSTREAM_PROXY;
const PORT = 3001;

const TARGETS = {
    '/deepl-free':   { host: 'api-free.deepl.com',                    ssl: true  },
    '/deepl-pro':    { host: 'api.deepl.com',                         ssl: true  },
    '/gemini-api':   { host: 'generativelanguage.googleapis.com',      ssl: true  },
    '/claude-api':   { host: 'api.anthropic.com',                      ssl: true  },
    '/openai-api':   { host: 'api.openai.com',                         ssl: true  },
    '/gigachat-auth':{ host: 'ngw.devices.sberbank.ru', port: 9443,    ssl: true  },
    '/gigachat-api': { host: 'gigachat.devices.sberbank.ru',           ssl: true  },
};

const agent = UPSTREAM_PROXY ? new HttpsProxyAgent(UPSTREAM_PROXY) : undefined;

if (UPSTREAM_PROXY) {
    console.log(`Using upstream proxy: ${UPSTREAM_PROXY}`);
} else {
    console.log('No upstream proxy configured, direct connections.');
}

const server = http.createServer((req, res) => {
    // Find matching target
    let target = null;
    let prefix = null;
    for (const [p, t] of Object.entries(TARGETS)) {
        if (req.url.startsWith(p + '/') || req.url === p) {
            prefix = p;
            target = t;
            break;
        }
    }

    if (!target) {
        res.writeHead(404);
        res.end('Unknown proxy path');
        return;
    }

    const stripped = req.url.slice(prefix.length) || '/';
    const port = target.port ?? (target.ssl ? 443 : 80);
    const protocol = target.ssl ? https : http;
    const url = `${target.ssl ? 'https' : 'http'}://${target.host}:${port}${stripped}`;

    const headers = { ...req.headers };
    headers['host'] = target.host;
    delete headers['accept-encoding']; // avoid compressed response issues

    const options = {
        method: req.method,
        headers,
        rejectUnauthorized: false, // needed for sberbank self-signed cert
        agent: target.ssl ? agent : undefined,
    };

    console.log(`[proxy] ${req.method} ${req.url} → ${url}`);

    const upstream = protocol.request(url, options, (upRes) => {
        const respHeaders = { ...upRes.headers };
        delete respHeaders['access-control-allow-origin'];
        respHeaders['access-control-allow-origin'] = '*';
        res.writeHead(upRes.statusCode, respHeaders);
        upRes.pipe(res);
    });

    upstream.on('error', (e) => {
        console.error(`[proxy] error: ${e.message}`);
        if (!res.headersSent) res.writeHead(502);
        res.end(e.message);
    });

    req.pipe(upstream);
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Proxy server listening on :${PORT}`);
});
