const WebSocket = require('ws');
const http = require('http');
const express = require('express');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Store connected users
const users = new Map();

wss.on('connection', (ws) => {
    let currentUser = null;

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        switch (data.type) {
            case 'login':
                // Handle user login
                if (users.has(data.username)) {
                    ws.send(JSON.stringify({
                        type: 'login',
                        success: false,
                        message: 'Username already taken'
                    }));
                    return;
                }

                currentUser = data.username;
                users.set(data.username, ws);

                // Notify all users about the new user
                broadcast({
                    type: 'userList',
                    users: Array.from(users.keys())
                });

                ws.send(JSON.stringify({
                    type: 'login',
                    success: true
                }));
                break;

            case 'call':
                // Handle call request
                const targetUser = users.get(data.target);
                if (targetUser) {
                    targetUser.send(JSON.stringify({
                        type: 'call',
                        from: currentUser,
                        offer: data.offer
                    }));
                }
                break;

            case 'answer':
                // Handle call answer
                const caller = users.get(data.target);
                if (caller) {
                    caller.send(JSON.stringify({
                        type: 'answer',
                        from: currentUser,
                        answer: data.answer
                    }));
                }
                break;

            case 'ice-candidate':
                // Handle ICE candidate
                const peer = users.get(data.target);
                if (peer) {
                    peer.send(JSON.stringify({
                        type: 'ice-candidate',
                        from: currentUser,
                        candidate: data.candidate
                    }));
                }
                break;

            case 'end-call':
                // Handle call end
                const peerUser = users.get(data.target);
                if (peerUser) {
                    peerUser.send(JSON.stringify({
                        type: 'end-call',
                        from: currentUser
                    }));
                }
                break;
        }
    });

    ws.on('close', () => {
        if (currentUser) {
            users.delete(currentUser);
            broadcast({
                type: 'userList',
                users: Array.from(users.keys())
            });
        }
    });
});

function broadcast(message) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

// Serve static files
app.use(express.static('.'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 