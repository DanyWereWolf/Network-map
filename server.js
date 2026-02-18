const WebSocket = require('ws');
const http = require('http');

const PORT = parseInt(process.env.PORT || process.argv[2] || '8765', 10);

let currentState = null; 

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Сервер синхронизации карты. Подключитесь по WebSocket (ws://' + (req.headers.host || 'localhost:' + PORT) + ').');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
    const clientId = 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    ws.clientId = clientId;

    if (currentState && currentState.data) {
        try {
            ws.send(JSON.stringify({
                type: 'state',
                clientId: currentState.clientId,
                data: currentState.data
            }));
        } catch (e) {}
    }

    ws.on('message', (raw) => {
        try {
            const msg = JSON.parse(raw.toString());
            if (msg.type === 'state' && Array.isArray(msg.data)) {
                currentState = { clientId: ws.clientId, data: msg.data };
                
                wss.clients.forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'state',
                            clientId: ws.clientId,
                            data: msg.data
                        }));
                    }
                });
            }
        } catch (e) {}
    });

    ws.on('close', () => {});
});

server.listen(PORT, () => {
    console.log('Сервер синхронизации запущен: ws://localhost:' + PORT);
});
