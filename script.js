// WebSocket connection
let ws = null;
let currentCall = null;

// DOM Elements
const loginPage = document.getElementById('loginPage');
const registerPage = document.getElementById('registerPage');
const mainApp = document.getElementById('mainApp');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const showRegister = document.getElementById('showRegister');
const showLogin = document.getElementById('showLogin');
const currentUser = document.getElementById('currentUser');
const logoutBtn = document.getElementById('logoutBtn');
const addMeetingBtn = document.getElementById('addMeetingBtn');
const meetingForm = document.getElementById('meetingForm');
const meetingDetails = document.getElementById('meetingDetails');
const cancelBtn = document.getElementById('cancelBtn');
const meetingsContainer = document.getElementById('meetingsContainer');
const videoCallContainer = document.getElementById('videoCallContainer');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const toggleVideo = document.getElementById('toggleVideo');
const toggleAudio = document.getElementById('toggleAudio');
const toggleScreen = document.getElementById('toggleScreen');
const hangupBtn = document.getElementById('hangupBtn');
const endCallBtn = document.getElementById('endCallBtn');
const callTitle = document.getElementById('callTitle');
const callWith = document.getElementById('callWith');
const userList = document.getElementById('userList');
const onlineUsersList = document.getElementById('onlineUsersList');
const incomingCallModal = document.getElementById('incomingCallModal');
const incomingCallFrom = document.getElementById('incomingCallFrom');
const acceptCallBtn = document.getElementById('acceptCallBtn');
const rejectCallBtn = document.getElementById('rejectCallBtn');
const joinMeetingBtn = document.getElementById('joinMeetingBtn');
const joinMeetingForm = document.getElementById('joinMeetingForm');
const joinMeetingDetails = document.getElementById('joinMeetingDetails');
const cancelJoinBtn = document.getElementById('cancelJoinBtn');
const meetingIdInput = document.getElementById('meetingId');
const meetingIdDisplay = document.getElementById('meetingIdDisplay');

// State
let users = JSON.parse(localStorage.getItem('users')) || [];
let currentUserData = null;
let meetings = JSON.parse(localStorage.getItem('meetings')) || [];
let editingMeetingId = null;
let localStream = null;
let remoteStream = null;
let peerConnection = null;
let isMuted = false;
let isVideoOff = false;
let isScreenSharing = false;
let onlineUsers = new Set();

// WebRTC Configuration
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};

// Store active peer connections
const peerConnections = new Map();

// Initialize WebSocket connection
function initWebSocket() {
    ws = new WebSocket(`ws://${window.location.hostname}:3000`);

    ws.onopen = () => {
        console.log('WebSocket connected');
        if (currentUserData) {
            ws.send(JSON.stringify({
                type: 'login',
                username: currentUserData.username
            }));
        }
    };

    ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);

        switch (data.type) {
            case 'userList':
                updateOnlineUsers(data.users);
                break;

            case 'call':
                handleIncomingCall(data);
                break;

            case 'answer':
                handleCallAnswer(data);
                break;

            case 'ice-candidate':
                handleIceCandidate(data);
                break;

            case 'end-call':
                handleEndCall(data);
                break;

            case 'room-participants':
                handleRoomParticipants(data);
                break;

            case 'offer':
                await handleIncomingOffer(data);
                break;

            case 'answer':
                await handleIncomingAnswer(data);
                break;

            case 'ice-candidate':
                await handleIncomingIceCandidate(data);
                break;

            case 'add-user':
                await handleIncomingAddUser(data);
                break;
        }
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected');
        setTimeout(initWebSocket, 1000);
    };
}

function updateOnlineUsers(users) {
    onlineUsers = new Set(users);
    onlineUsersList.innerHTML = '';
    
    users.forEach(username => {
        if (username !== currentUserData.username) {
            const userItem = document.createElement('div');
            userItem.className = 'user-item';
            userItem.innerHTML = `
                <span>${username}</span>
                <button class="call-btn" onclick="startDirectCall('${username}')">
                    <i class="fas fa-phone"></i> Call
                </button>
            `;
            onlineUsersList.appendChild(userItem);
        }
    });
}

function handleIncomingCall(data) {
    incomingCallFrom.textContent = data.from;
    incomingCallModal.style.display = 'flex';
    currentCall = data;
}

function handleCallAnswer(data) {
    if (peerConnection) {
        const answer = new RTCSessionDescription(data.answer);
        peerConnection.setRemoteDescription(answer);
    }
}

function handleIceCandidate(data) {
    if (peerConnection) {
        const candidate = new RTCIceCandidate(data.candidate);
        peerConnection.addIceCandidate(candidate);
    }
}

function handleEndCall(data) {
    endCall();
    if (data.from) {
        alert(`Call ended by ${data.from}`);
    }
}

function endCall() {
    // Remove event listeners
    toggleAudio.removeEventListener('click', toggleMute);
    toggleVideo.removeEventListener('click', toggleVideoState);
    toggleScreen.removeEventListener('click', toggleScreenShare);
    hangupBtn.removeEventListener('click', endCall);
    endCallBtn.removeEventListener('click', endCall);

    // Notify the other peer that the call is ending
    if (ws && currentCall) {
        const target = currentCall.from || currentCall.target;
        if (target) {
            ws.send(JSON.stringify({
                type: 'end-call',
                target: target
            }));
        }
    }

    // Clean up local resources
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    if (remoteStream) {
        remoteStream.getTracks().forEach(track => track.stop());
        remoteStream = null;
    }
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    // Reset video elements
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    
    // Hide video call container and incoming call modal
    videoCallContainer.style.display = 'none';
    incomingCallModal.style.display = 'none';
    
    // Reset states
    isMuted = false;
    isVideoOff = false;
    isScreenSharing = false;
    currentCall = null;
    
    // Reset button states
    toggleAudio.classList.remove('active');
    toggleVideo.classList.remove('active');
    toggleScreen.classList.remove('active');
}

// Event Listeners
showRegister.addEventListener('click', (e) => {
    e.preventDefault();
    loginPage.style.display = 'none';
    registerPage.style.display = 'flex';
});

showLogin.addEventListener('click', (e) => {
    e.preventDefault();
    registerPage.style.display = 'none';
    loginPage.style.display = 'flex';
});

loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    const user = users.find(u => u.username === username && u.password === password);
    if (user) {
        currentUserData = user;
        currentUser.textContent = `Welcome, ${user.username}`;
        loginPage.style.display = 'none';
        mainApp.style.display = 'block';
        renderMeetings();
        renderUserList();
        initWebSocket();
    } else {
        alert('Invalid username or password');
    }
});

registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = document.getElementById('newUsername').value;
    const password = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    if (password !== confirmPassword) {
        alert('Passwords do not match');
        return;
    }
    
    if (users.some(u => u.username === username)) {
        alert('Username already exists');
        return;
    }
    
    const newUser = { username, password };
    users.push(newUser);
    localStorage.setItem('users', JSON.stringify(users));
    
    alert('Registration successful! Please login.');
    registerPage.style.display = 'none';
    loginPage.style.display = 'flex';
});

logoutBtn.addEventListener('click', () => {
    currentUserData = null;
    mainApp.style.display = 'none';
    loginPage.style.display = 'flex';
    if (ws) {
        ws.close();
    }
});

acceptCallBtn.addEventListener('click', async () => {
    incomingCallModal.style.display = 'none';
    await startCall(currentCall.from, true);
});

rejectCallBtn.addEventListener('click', () => {
    if (currentCall) {
        endCall();
    }
});

addMeetingBtn.addEventListener('click', () => {
    meetingForm.style.display = 'block';
    joinMeetingForm.style.display = 'none';
    meetingDetails.reset();
    editingMeetingId = null;
    
    // Generate and display new meeting ID
    const newMeetingId = generateMeetingId();
    meetingIdDisplay.textContent = newMeetingId;
});

cancelBtn.addEventListener('click', () => {
    meetingForm.style.display = 'none';
    meetingDetails.reset();
    editingMeetingId = null;
});

joinMeetingBtn.addEventListener('click', () => {
    meetingForm.style.display = 'none';
    joinMeetingForm.style.display = 'block';
});

cancelJoinBtn.addEventListener('click', () => {
    joinMeetingForm.style.display = 'none';
    joinMeetingDetails.reset();
});

joinMeetingDetails.addEventListener('submit', (e) => {
    e.preventDefault();
    const meetingId = meetingIdInput.value.trim();
    
    // Find the meeting with the given ID
    const meeting = meetings.find(m => m.id === meetingId);
    if (meeting) {
        // Start a call with the meeting creator
        startDirectCall(meeting.creator);
        joinMeetingForm.style.display = 'none';
        joinMeetingDetails.reset();
    } else {
        alert('Meeting not found. Please check the meeting ID.');
    }
});

meetingDetails.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const selectedUsers = Array.from(userList.querySelectorAll('input[type="checkbox"]:checked'))
        .map(checkbox => checkbox.value);
    
    const meeting = {
        id: editingMeetingId || meetingIdDisplay.textContent,
        title: document.getElementById('title').value,
        date: document.getElementById('date').value,
        time: document.getElementById('time').value,
        duration: document.getElementById('duration').value,
        participants: selectedUsers,
        creator: currentUserData.username
    };

    if (editingMeetingId) {
        const index = meetings.findIndex(m => m.id === editingMeetingId);
        meetings[index] = meeting;
    } else {
        meetings.push(meeting);
    }

    saveMeetings();
    renderMeetings();
    meetingForm.style.display = 'none';
    meetingDetails.reset();
    editingMeetingId = null;
});

// Video Call Functions
async function startDirectCall(targetUser) {
    if (!onlineUsers.has(targetUser)) {
        alert('User is not online');
        return;
    }
    await startCall(targetUser, false);
}

async function startCall(targetUser, isAnswering = false) {
    try {
        callTitle.textContent = `Call with ${targetUser}`;
        callWith.textContent = `Calling with: ${targetUser}`;
        videoCallContainer.style.display = 'flex';

        // Get local media stream
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        localVideo.srcObject = localStream;

        // Create peer connection
        peerConnection = new RTCPeerConnection(configuration);

        // Add local stream to peer connection
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        // Handle remote stream
        peerConnection.ontrack = event => {
            remoteStream = event.streams[0];
            remoteVideo.srcObject = remoteStream;
        };

        // Handle ICE candidates
        peerConnection.onicecandidate = event => {
            if (event.candidate && ws) {
                ws.send(JSON.stringify({
                    type: 'ice-candidate',
                    target: targetUser,
                    candidate: event.candidate
                }));
            }
        };

        // Add event listeners for video controls
        toggleAudio.addEventListener('click', toggleMute);
        toggleVideo.addEventListener('click', toggleVideoState);
        toggleScreen.addEventListener('click', toggleScreenShare);
        hangupBtn.addEventListener('click', endCall);
        endCallBtn.addEventListener('click', endCall);

        if (!isAnswering) {
            // Create and send offer
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);

            if (ws) {
                ws.send(JSON.stringify({
                    type: 'call',
                    target: targetUser,
                    offer: offer
                }));
            }
        } else {
            // Set remote description from incoming call
            const offer = new RTCSessionDescription(currentCall.offer);
            await peerConnection.setRemoteDescription(offer);

            // Create and send answer
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);

            if (ws) {
                ws.send(JSON.stringify({
                    type: 'answer',
                    target: currentCall.from,
                    answer: answer
                }));
            }
        }

    } catch (error) {
        console.error('Error starting call:', error);
        alert('Error starting call. Please check your camera and microphone permissions.');
        endCall();
    }
}

function toggleMute() {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            isMuted = !isMuted;
            toggleAudio.classList.toggle('active', isMuted);
            toggleAudio.innerHTML = `<i class="fas fa-${isMuted ? 'microphone-slash' : 'microphone'}"></i>`;
            console.log('Audio track state:', audioTrack.enabled);
        }
    }
}

function toggleVideoState() {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            isVideoOff = !isVideoOff;
            toggleVideo.classList.toggle('active', isVideoOff);
            toggleVideo.innerHTML = `<i class="fas fa-${isVideoOff ? 'video-slash' : 'video'}"></i>`;
            console.log('Video track state:', videoTrack.enabled);
        }
    }
}

async function toggleScreenShare() {
    try {
        if (!isScreenSharing) {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: false
            });
            
            // Replace video track
            const videoTrack = screenStream.getVideoTracks()[0];
            const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
            if (sender) {
                await sender.replaceTrack(videoTrack);
            }
            
            // Update local video
            localVideo.srcObject = screenStream;
            isScreenSharing = true;
            toggleScreen.classList.add('active');
            
            // Handle when user stops sharing screen
            videoTrack.onended = () => {
                toggleScreenShare();
            };
        } else {
            // Switch back to camera
            const cameraStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: false
            });
            
            const videoTrack = cameraStream.getVideoTracks()[0];
            const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
            if (sender) {
                await sender.replaceTrack(videoTrack);
            }
            
            localVideo.srcObject = cameraStream;
            isScreenSharing = false;
            toggleScreen.classList.remove('active');
        }
    } catch (error) {
        console.error('Error toggling screen share:', error);
        alert('Error sharing screen. Please make sure you have the necessary permissions.');
    }
}

function renderMeetings() {
    meetingsContainer.innerHTML = '';
    
    const userMeetings = meetings.filter(m => 
        m.creator === currentUserData.username || 
        m.participants.includes(currentUserData.username)
    );
    
    if (userMeetings.length === 0) {
        meetingsContainer.innerHTML = '<p>No meetings scheduled yet.</p>';
        return;
    }

    userMeetings.sort((a, b) => {
        const dateA = new Date(`${a.date}T${a.time}`);
        const dateB = new Date(`${b.date}T${b.time}`);
        return dateA - dateB;
    });

    userMeetings.forEach(meeting => {
        const meetingCard = document.createElement('div');
        meetingCard.className = 'meeting-card';
        meetingCard.dataset.meetingId = meeting.id;
        
        const date = new Date(`${meeting.date}T${meeting.time}`);
        const formattedDate = date.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        const formattedTime = date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });

        meetingCard.innerHTML = `
            <h3>${meeting.title}</h3>
            <p><strong>Meeting ID:</strong> ${meeting.id}</p>
            <p><strong>Date:</strong> ${formattedDate}</p>
            <p><strong>Time:</strong> ${formattedTime}</p>
            <p><strong>Duration:</strong> ${meeting.duration} minutes</p>
            <p class="participants"><strong>Participants:</strong> ${meeting.participants.join(', ')}</p>
            <div class="actions">
                <button class="video-btn" onclick="startMeeting('${meeting.id}')">
                    <i class="fas fa-video"></i> Start Video Call
                </button>
                ${meeting.creator === currentUserData.username ? `
                    <button class="edit-btn" onclick="editMeeting('${meeting.id}')">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="delete-btn" onclick="deleteMeeting('${meeting.id}')">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                ` : ''}
            </div>
        `;

        meetingsContainer.appendChild(meetingCard);
    });
}

function editMeeting(id) {
    const meeting = meetings.find(m => m.id === id);
    if (!meeting) return;

    document.getElementById('title').value = meeting.title;
    document.getElementById('date').value = meeting.date;
    document.getElementById('time').value = meeting.time;
    document.getElementById('duration').value = meeting.duration;
    
    // Check the participants in the user list
    const checkboxes = userList.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = meeting.participants.includes(checkbox.value);
    });

    editingMeetingId = id;
    meetingForm.style.display = 'block';
}

function deleteMeeting(id) {
    if (confirm('Are you sure you want to delete this meeting?')) {
        meetings = meetings.filter(m => m.id !== id);
        saveMeetings();
        renderMeetings();
    }
}

function saveMeetings() {
    localStorage.setItem('meetings', JSON.stringify(meetings));
}

function renderUserList() {
    userList.innerHTML = '';
    users.forEach(user => {
        if (user.username !== currentUserData.username) {
            const userItem = document.createElement('div');
            userItem.className = 'user-item';
            userItem.innerHTML = `
                <input type="checkbox" id="user-${user.username}" value="${user.username}">
                <label for="user-${user.username}">${user.username}</label>
            `;
            userList.appendChild(userItem);
        }
    });
}

// Generate a random meeting ID
function generateMeetingId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Initialize
if (users.length === 0) {
    // Add some default users for testing
    users = [
        { username: 'user1', password: 'password1' },
        { username: 'user2', password: 'password2' }
    ];
    localStorage.setItem('users', JSON.stringify(users));
}

renderMeetings();

// Handle room participants
function handleRoomParticipants(data) {
    const { roomId, participants } = data;
    const meeting = meetings.find(m => m.id === roomId);
    if (meeting) {
        // Update UI to show participants
        const meetingCard = document.querySelector(`[data-meeting-id="${roomId}"]`);
        if (meetingCard) {
            const participantsElement = meetingCard.querySelector('.participants');
            if (participantsElement) {
                participantsElement.textContent = `Participants: ${participants.join(', ')}`;
            }
        }
    }
}

// Join a meeting room
async function joinMeetingRoom(meetingId) {
    if (ws) {
        ws.send(JSON.stringify({
            type: 'join-room',
            roomId: meetingId
        }));
    }
}

// Leave a meeting room
function leaveMeetingRoom(meetingId) {
    if (ws) {
        ws.send(JSON.stringify({
            type: 'leave-room',
            roomId: meetingId
        }));
    }
}

// Start a meeting with multiple participants
async function startMeeting(meetingId) {
    try {
        callTitle.textContent = `Meeting: ${meetingId}`;
        callWith.textContent = 'Participants: Connecting...';
        videoCallContainer.style.display = 'flex';

        // Get local media stream
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        localVideo.srcObject = localStream;

        // Join the meeting room
        await joinMeetingRoom(meetingId);

        // Add event listeners for video controls
        toggleAudio.addEventListener('click', toggleMute);
        toggleVideo.addEventListener('click', toggleVideoState);
        toggleScreen.addEventListener('click', toggleScreenShare);
        hangupBtn.addEventListener('click', () => endMeeting(meetingId));
        endCallBtn.addEventListener('click', () => endMeeting(meetingId));

    } catch (error) {
        console.error('Error starting meeting:', error);
        alert('Error starting meeting. Please check your camera and microphone permissions.');
        endMeeting(meetingId);
    }
}

// End a meeting
function endMeeting(meetingId) {
    // Remove event listeners
    toggleAudio.removeEventListener('click', toggleMute);
    toggleVideo.removeEventListener('click', toggleVideoState);
    toggleScreen.removeEventListener('click', toggleScreenShare);
    hangupBtn.removeEventListener('click', endMeeting);
    endCallBtn.removeEventListener('click', endMeeting);

    // Close all peer connections
    peerConnections.forEach((pc, userId) => {
        pc.close();
        peerConnections.delete(userId);
    });

    // Clean up local resources
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    // Reset video elements
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;

    // Leave the meeting room
    leaveMeetingRoom(meetingId);

    // Hide video call container
    videoCallContainer.style.display = 'none';

    // Reset states
    isMuted = false;
    isVideoOff = false;
    isScreenSharing = false;
}

// Handle incoming offer
async function handleIncomingOffer(data) {
    const { from, offer } = data;
    
    // Create new peer connection if it doesn't exist
    if (!peerConnections.has(from)) {
        const pc = new RTCPeerConnection(configuration);
        peerConnections.set(from, pc);

        // Add local stream to peer connection
        if (localStream) {
            localStream.getTracks().forEach(track => {
                pc.addTrack(track, localStream);
            });
        }

        // Handle remote stream
        pc.ontrack = event => {
            const remoteStream = event.streams[0];
            remoteVideo.srcObject = remoteStream;
        };

        // Handle ICE candidates
        pc.onicecandidate = event => {
            if (event.candidate && ws) {
                ws.send(JSON.stringify({
                    type: 'ice-candidate',
                    target: from,
                    candidate: event.candidate
                }));
            }
        };
    }

    const pc = peerConnections.get(from);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    if (ws) {
        ws.send(JSON.stringify({
            type: 'answer',
            target: from,
            answer: answer
        }));
    }
}

// Handle incoming answer
async function handleIncomingAnswer(data) {
    const { from, answer } = data;
    const pc = peerConnections.get(from);
    if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
}

// Handle incoming ICE candidate
async function handleIncomingIceCandidate(data) {
    const { from, candidate } = data;
    const pc = peerConnections.get(from);
    if (pc) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
}

// Update the meeting card click handler
document.addEventListener('click', async (e) => {
    if (e.target.closest('.video-btn')) {
        const meetingCard = e.target.closest('.meeting-card');
        const meetingId = meetingCard.dataset.meetingId;
        await startMeeting(meetingId);
    }
});

// Add event listener for the add user button
document.getElementById('addUser').addEventListener('click', () => {
    if (currentCall) {
        showAddUserModal();
    }
});

// Function to show the add user modal
function showAddUserModal() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>Add User to Call</h3>
            <div id="availableUsersList" class="user-list"></div>
            <div class="modal-buttons">
                <button id="cancelAddUser" class="btn">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Populate available users list
    const availableUsersList = document.getElementById('availableUsersList');
    onlineUsers.forEach(username => {
        if (username !== currentUserData.username && !currentCall.participants.includes(username)) {
            const userItem = document.createElement('div');
            userItem.className = 'user-item';
            userItem.innerHTML = `
                <span>${username}</span>
                <button class="add-user-btn" onclick="addUserToCall('${username}')">
                    <i class="fas fa-plus"></i>
                </button>
            `;
            availableUsersList.appendChild(userItem);
        }
    });

    // Close modal when clicking cancel
    document.getElementById('cancelAddUser').addEventListener('click', () => {
        modal.remove();
    });
}

// Function to add a user to the current call
async function addUserToCall(username) {
    try {
        // Create a new peer connection for the added user
        const pc = new RTCPeerConnection(configuration);
        peerConnections.set(username, pc);

        // Add local stream to the new peer connection
        if (localStream) {
            localStream.getTracks().forEach(track => {
                pc.addTrack(track, localStream);
            });
        }

        // Handle remote stream
        pc.ontrack = event => {
            const remoteStream = event.streams[0];
            // Create a new video element for the added user
            const newVideo = document.createElement('video');
            newVideo.autoplay = true;
            newVideo.playsInline = true;
            newVideo.srcObject = remoteStream;
            newVideo.className = 'remote-video';
            document.querySelector('.video-grid').appendChild(newVideo);
        };

        // Handle ICE candidates
        pc.onicecandidate = event => {
            if (event.candidate && ws) {
                ws.send(JSON.stringify({
                    type: 'ice-candidate',
                    target: username,
                    candidate: event.candidate
                }));
            }
        };

        // Create and send offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        if (ws) {
            ws.send(JSON.stringify({
                type: 'add-user',
                target: username,
                offer: offer,
                roomId: currentCall.roomId
            }));
        }

        // Update UI
        const modal = document.querySelector('.modal');
        if (modal) {
            modal.remove();
        }

    } catch (error) {
        console.error('Error adding user to call:', error);
        alert('Error adding user to call. Please try again.');
    }
}

// Handle incoming add-user request
async function handleIncomingAddUser(data) {
    const { from, offer, roomId } = data;
    
    // Create new peer connection
    const pc = new RTCPeerConnection(configuration);
    peerConnections.set(from, pc);

    // Add local stream to peer connection
    if (localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
    }

    // Handle remote stream
    pc.ontrack = event => {
        const remoteStream = event.streams[0];
        const newVideo = document.createElement('video');
        newVideo.autoplay = true;
        newVideo.playsInline = true;
        newVideo.srcObject = remoteStream;
        newVideo.className = 'remote-video';
        document.querySelector('.video-grid').appendChild(newVideo);
    };

    // Handle ICE candidates
    pc.onicecandidate = event => {
        if (event.candidate && ws) {
            ws.send(JSON.stringify({
                type: 'ice-candidate',
                target: from,
                candidate: event.candidate
            }));
        }
    };

    // Set remote description and create answer
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    if (ws) {
        ws.send(JSON.stringify({
            type: 'answer',
            target: from,
            answer: answer
        }));
    }
}

// Update the WebSocket message handler to handle add-user messages
ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);

    switch (data.type) {
        // ... existing cases ...
        
        case 'add-user':
            await handleIncomingAddUser(data);
            break;
    }
}; 