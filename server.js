const WebSocket = require('ws');
const http = require('http');
const express = require('express');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Store connected users
const users = new Map();

// Store active rooms and their participants
const rooms = new Map();

// Handle WebSocket connections
wss.on('connection', (ws) => {
    let currentUser = null;
    let currentRoom = null;

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
                broadcastUserList();
                break;

            case 'join-room':
                if (!rooms.has(data.roomId)) {
                    rooms.set(data.roomId, new Set());
                }
                currentRoom = data.roomId;
                rooms.get(data.roomId).add(currentUser);
                broadcastRoomParticipants(data.roomId);
                break;

            case 'leave-room':
                if (currentRoom && rooms.has(currentRoom)) {
                    rooms.get(currentRoom).delete(currentUser);
                    broadcastRoomParticipants(currentRoom);
                    if (rooms.get(currentRoom).size === 0) {
                        rooms.delete(currentRoom);
                    }
                }
                break;

            case 'offer':
            case 'answer':
            case 'ice-candidate':
                if (data.target) {
                    const targetWs = users.get(data.target);
                    if (targetWs) {
                        targetWs.send(JSON.stringify(data));
                    }
                } else if (currentRoom && rooms.has(currentRoom)) {
                    // Broadcast to all participants in the room except sender
                    rooms.get(currentRoom).forEach(participant => {
                        if (participant !== currentUser) {
                            const participantWs = users.get(participant);
                            if (participantWs) {
                                participantWs.send(JSON.stringify({
                                    ...data,
                                    from: currentUser
                                }));
                            }
                        }
                    });
                }
                break;

            case 'end-call':
                if (data.target) {
                    const targetWs = users.get(data.target);
                    if (targetWs) {
                        targetWs.send(JSON.stringify(data));
                    }
                } else if (currentRoom && rooms.has(currentRoom)) {
                    // Broadcast end call to all participants
                    rooms.get(currentRoom).forEach(participant => {
                        if (participant !== currentUser) {
                            const participantWs = users.get(participant);
                            if (participantWs) {
                                participantWs.send(JSON.stringify({
                                    ...data,
                                    from: currentUser
                                }));
                            }
                        }
                    });
                }
                break;
        }
    });

    ws.on('close', () => {
        if (currentUser) {
            users.delete(currentUser);
            if (currentRoom && rooms.has(currentRoom)) {
                rooms.get(currentRoom).delete(currentUser);
                broadcastRoomParticipants(currentRoom);
                if (rooms.get(currentRoom).size === 0) {
                    rooms.delete(currentRoom);
                }
            }
            broadcastUserList();
        }
    });
});

function broadcastUserList() {
    broadcast({
        type: 'userList',
        users: Array.from(users.keys())
    });
}

function broadcastRoomParticipants(roomId) {
    if (rooms.has(roomId)) {
        const participants = Array.from(rooms.get(roomId));
        rooms.get(roomId).forEach(participant => {
            const ws = users.get(participant);
            if (ws) {
                ws.send(JSON.stringify({
                    type: 'room-participants',
                    roomId,
                    participants
                }));
            }
        });
    }
}

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