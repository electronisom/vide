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

            case 'media-control':
                handleMediaControl(data);
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

function handleMediaControl(data) {
    const { control, enabled } = data;
    switch (control) {
        case 'audio':
            const remoteAudio = remoteVideo.srcObject?.getAudioTracks()[0];
            if (remoteAudio) {
                remoteAudio.enabled = enabled;
            }
            break;
        case 'video':
            const remoteVideo = remoteVideo.srcObject?.getVideoTracks()[0];
            if (remoteVideo) {
                remoteVideo.enabled = enabled;
            }
            break;
    }
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
    incomingCallModal.style.display = 'none';
    if (ws) {
        ws.send(JSON.stringify({
            type: 'end-call',
            target: currentCall.from
        }));
    }
    currentCall = null;
});

addMeetingBtn.addEventListener('click', () => {
    meetingForm.style.display = 'block';
    meetingDetails.reset();
    editingMeetingId = null;
});

cancelBtn.addEventListener('click', () => {
    meetingForm.style.display = 'none';
    meetingDetails.reset();
    editingMeetingId = null;
});

meetingDetails.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const selectedUsers = Array.from(userList.querySelectorAll('input[type="checkbox"]:checked'))
        .map(checkbox => checkbox.value);
    
    const meeting = {
        id: editingMeetingId || Date.now().toString(),
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
            
            // Update the icon
            const icon = toggleAudio.querySelector('i');
            icon.className = isMuted ? 'fas fa-microphone-slash' : 'fas fa-microphone';
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
            
            // Update the icon
            const icon = toggleVideo.querySelector('i');
            icon.className = isVideoOff ? 'fas fa-video-slash' : 'fas fa-video';
        }
    }
}

async function toggleScreenShare() {
    try {
        if (!isScreenSharing) {
            // Start screen sharing
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    cursor: 'always'
                },
                audio: false
            });

            // Handle the user canceling screen share through the browser UI
            screenStream.getVideoTracks()[0].onended = async () => {
                await switchToCamera();
            };
            
            // Replace video track
            const videoTrack = screenStream.getVideoTracks()[0];
            if (peerConnection) {
                const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
                await sender.replaceTrack(videoTrack);
            }
            
            // Update local video
            if (localStream) {
                const oldTrack = localStream.getVideoTracks()[0];
                if (oldTrack) {
                    oldTrack.stop();
                    localStream.removeTrack(oldTrack);
                }
                localStream.addTrack(videoTrack);
            }
            localVideo.srcObject = screenStream;
            
            isScreenSharing = true;
            toggleScreen.classList.add('active');
            
            // Update the icon
            const icon = toggleScreen.querySelector('i');
            icon.className = 'fas fa-stop-circle';
        } else {
            // Stop screen sharing and switch back to camera
            await switchToCamera();
        }
    } catch (error) {
        console.error('Error toggling screen share:', error);
        alert('Failed to share screen. Please make sure you have granted the necessary permissions.');
    }
}

async function switchToCamera() {
    try {
        const cameraStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: localStream ? localStream.getAudioTracks().length > 0 : true
        });
        
        const videoTrack = cameraStream.getVideoTracks()[0];
        if (peerConnection) {
            const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
            await sender.replaceTrack(videoTrack);
        }
        
        if (localStream) {
            const oldTrack = localStream.getVideoTracks()[0];
            if (oldTrack) {
                oldTrack.stop();
                localStream.removeTrack(oldTrack);
            }
            localStream.addTrack(videoTrack);
        }
        
        localVideo.srcObject = cameraStream;
        isScreenSharing = false;
        toggleScreen.classList.remove('active');
        
        // Update the icon
        const icon = toggleScreen.querySelector('i');
        icon.className = 'fas fa-desktop';
    } catch (error) {
        console.error('Error switching to camera:', error);
        alert('Failed to switch to camera. Please check your camera permissions.');
    }
}

function endCall() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    if (remoteStream) {
        remoteStream.getTracks().forEach(track => track.stop());
    }
    if (peerConnection) {
        peerConnection.close();
    }
    
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    videoCallContainer.style.display = 'none';
    
    // Reset states
    localStream = null;
    remoteStream = null;
    peerConnection = null;
    isMuted = false;
    isVideoOff = false;
    isScreenSharing = false;
    currentCall = null;
    
    // Reset button states
    toggleAudio.classList.remove('active');
    toggleVideo.classList.remove('active');
    toggleScreen.classList.remove('active');
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
            <p><strong>Date:</strong> ${formattedDate}</p>
            <p><strong>Time:</strong> ${formattedTime}</p>
            <p><strong>Duration:</strong> ${meeting.duration} minutes</p>
            <p class="participants"><strong>Participants:</strong> ${meeting.participants.join(', ')}</p>
            <div class="actions">
                <button class="video-btn" onclick="startCall('${meeting.id}')">
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

// Video Call Event Listeners
toggleAudio.addEventListener('click', () => {
    toggleMute();
    if (ws && currentCall) {
        ws.send(JSON.stringify({
            type: 'media-control',
            target: currentCall.from,
            control: 'audio',
            enabled: !isMuted
        }));
    }
});

toggleVideo.addEventListener('click', () => {
    toggleVideoState();
    if (ws && currentCall) {
        ws.send(JSON.stringify({
            type: 'media-control',
            target: currentCall.from,
            control: 'video',
            enabled: !isVideoOff
        }));
    }
});

toggleScreen.addEventListener('click', async () => {
    await toggleScreenShare();
    if (ws && currentCall) {
        ws.send(JSON.stringify({
            type: 'media-control',
            target: currentCall.from,
            control: 'screen',
            enabled: isScreenSharing
        }));
    }
});

hangupBtn.addEventListener('click', () => {
    if (currentCall) {
        ws.send(JSON.stringify({
            type: 'end-call',
            target: currentCall.from
        }));
    }
    endCall();
});

endCallBtn.addEventListener('click', () => {
    if (currentCall) {
        ws.send(JSON.stringify({
            type: 'end-call',
            target: currentCall.from
        }));
    }
    endCall();
}); 