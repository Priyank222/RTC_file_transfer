// DOM Elements
const elements = {
    myPeerId: document.getElementById('my-peer-id'),
    idLoader: document.getElementById('id-loader'),
    copyIdBtn: document.getElementById('copy-id-btn'),
    remotePeerIdInput: document.getElementById('remote-peer-id'),
    connectBtn: document.getElementById('connect-btn'),
    connectionStatus: document.getElementById('connection-status'),
    identitySection: document.getElementById('identity-section'),
    connectSection: document.getElementById('connect-section'),
    transferSection: document.getElementById('transfer-section'),
    disconnectBtn: document.getElementById('disconnect-btn'),
    dropZone: document.getElementById('drop-zone'),
    fileInput: document.getElementById('file-input'),
    transfersList: document.getElementById('transfers-list'),
    toastContainer: document.getElementById('toast-container')
};

// State
let peer = null;
let conn = null;
const CHUNK_SIZE = 16384; // 16KB chunks

// Initialize Peer
function initPeer() {
    peer = new Peer(null, {
        config: {
            iceServers: [
                // STUN servers (unlimited, free)
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                
                // ExpressTURN - UDP (1TB/month)
                {
                    urls: 'turn:relay1.expressturn.com:3478',
                    username: '000000002079609955',
                    credential: 'dOGCCLTOJTKJEbOMyeN5N4eL0os='
                },
                
                // ExpressTURN - TCP (better firewall traversal)
                {
                    urls: 'turn:relay1.expressturn.com:3478?transport=tcp',
                    username: '000000002079609955',
                    credential: 'dOGCCLTOJTKJEbOMyeN5N4eL0os='
                }
            ],
            iceCandidatePoolSize: 10
        },
        debug: 2
    });

    peer.on('open', (id) => {
        elements.myPeerId.textContent = id;
        elements.myPeerId.classList.remove('hidden');
        elements.idLoader.classList.add('hidden');
        showToast('Identity generated successfully', 'success');
    });

    peer.on('connection', (connection) => {
        if (conn) {
            connection.close();
            return;
        }
        handleConnection(connection);
        showToast('Incoming connection established', 'success');
    });

    peer.on('error', (err) => {
        console.error(err);
        showToast(`Error: ${err.type}`, 'error');
        resetConnectionUI();
    });

    peer.on('disconnected', () => {
        showToast('Disconnected from signaling server', 'info');
        // PeerJS usually reconnects automatically or we can call peer.reconnect()
    });
}

// Handle Connection
function handleConnection(connection) {
    
    conn = connection;
    
    conn.on('open', () => {
        updateConnectionStatus(true);
        elements.connectSection.classList.add('hidden');
        elements.transferSection.classList.remove('hidden');
        elements.remotePeerIdInput.value = conn.peer;
    });

    conn.on('close', () => {
        showToast('Connection closed', 'info');
        resetConnectionUI();
    });

    conn.on('error', (err) => {
        showToast(`Connection error: ${err}`, 'error');
        resetConnectionUI();
    });

    conn.on('data', (data) => {
        handleIncomingData(data);
    });
}

// Data Handling
const incomingFiles = {}; // { fileId: { meta, chunks, receivedSize } }
const pendingChunks = {}; // { fileId: [chunkData] } - Buffer for chunks arriving before meta

function handleIncomingData(data) {
    console.log('Received data type:', data.type);
    
    if (data.type === 'meta') {
        // Start of new file
        const { fileId, name, size, fileType } = data;
        
        if (incomingFiles[fileId]) return; // Already started

        incomingFiles[fileId] = {
            meta: { name, size, type: fileType },
            chunks: [],
            receivedSize: 0,
            startTime: Date.now()
        };
        
        createTransferItem(fileId, name, size, 'download');
        
        // Process any pending chunks for this file
        if (pendingChunks[fileId]) {
            pendingChunks[fileId].forEach(chunkData => {
                processChunk(fileId, chunkData);
            });
            delete pendingChunks[fileId];
        }
        
    } else if (data.type === 'chunk') {
        // File chunk
        const { fileId, chunk } = data;
        
        if (!incomingFiles[fileId]) {
            // Meta not received yet, buffer this chunk
            if (!pendingChunks[fileId]) {
                pendingChunks[fileId] = [];
            }
            pendingChunks[fileId].push(data);
            return;
        }

        processChunk(fileId, data);
    }
}

function processChunk(fileId, chunkData) {
    const { chunk } = chunkData;
    const fileData = incomingFiles[fileId];
    
    fileData.chunks.push(chunk);
    fileData.receivedSize += (chunk.byteLength || chunk.size || chunk.length);
    
    updateProgress(fileId, fileData.receivedSize, fileData.meta.size);

    if (fileData.receivedSize >= fileData.meta.size) {
        assembleFile(fileId);
    }
}

function assembleFile(fileId) {
    const fileData = incomingFiles[fileId];
    if (!fileData) return;

    const blob = new Blob(fileData.chunks, { type: fileData.meta.type });
    const url = URL.createObjectURL(blob);
    
    const item = document.getElementById(`transfer-${fileId}`);
    if (item) {
        const actionBtn = item.querySelector('.action-btn');
        actionBtn.innerHTML = '<i class="fa-solid fa-download"></i>';
        actionBtn.classList.add('download-btn');
        actionBtn.disabled = false;
        actionBtn.onclick = () => {
            const a = document.createElement('a');
            a.href = url;
            a.download = fileData.meta.name;
            a.click();
        };
        
        const statusText = item.querySelector('.transfer-status');
        statusText.textContent = 'Completed';
        statusText.style.color = 'var(--success)';
    }
    
    showToast(`Received ${fileData.meta.name}`, 'success');
    // Don't delete immediately to allow download, or manage memory better in production
    // delete incomingFiles[fileId]; 
}

// File Sending
async function sendFile(file) {
    if (!conn || !conn.open) {
        showToast('No active connection', 'error');
        return;
    }

    const fileId = crypto.randomUUID();
    createTransferItem(fileId, file.name, file.size, 'upload');

    // Send Metadata
    conn.send({
        type: 'meta',
        fileId,
        name: file.name,
        size: file.size,
        fileType: file.type
    });

    // Small delay to ensure meta is received before chunks
    setTimeout(() => {
        // Read and Send Chunks
        const reader = new FileReader();
        let offset = 0;

        reader.onload = (e) => {
            if (!conn || !conn.open) return;
            
            const chunk = e.target.result;
            conn.send({
                type: 'chunk',
                fileId,
                chunk
            });

            offset += chunk.byteLength;
            updateProgress(fileId, offset, file.size);

            if (offset < file.size) {
                // Use setTimeout to prevent blocking UI and allow network flush
                setTimeout(readNextChunk, 0); 
            } else {
                 const item = document.getElementById(`transfer-${fileId}`);
                 if(item) {
                    const statusText = item.querySelector('.transfer-status');
                    statusText.textContent = 'Sent';
                    statusText.style.color = 'var(--success)';
                 }
            }
        };

        const readNextChunk = () => {
            const slice = file.slice(offset, offset + CHUNK_SIZE);
            reader.readAsArrayBuffer(slice);
        };

        readNextChunk();
    }, 100);
}

// UI Helpers
function createTransferItem(id, name, size, type) {
    const div = document.createElement('div');
    div.className = 'transfer-item';
    div.id = `transfer-${id}`;
    div.innerHTML = `
        <div class="file-icon">
            <i class="fa-solid ${type === 'upload' ? 'fa-file-export' : 'fa-file-import'}"></i>
        </div>
        <div class="file-info">
            <div class="file-name" title="${name}">${name}</div>
            <div class="file-meta">
                <span>${formatBytes(size)}</span>
                <span class="transfer-status">${type === 'upload' ? 'Sending...' : 'Receiving...'}</span>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: 0%"></div>
            </div>
        </div>
        <div class="transfer-actions">
            <button class="action-btn" disabled>
                <i class="fa-solid fa-spinner fa-spin"></i>
            </button>
        </div>
    `;
    elements.transfersList.prepend(div);
}

function updateProgress(id, current, total) {
    const item = document.getElementById(`transfer-${id}`);
    if (item) {
        const percent = Math.min(100, (current / total) * 100);
        item.querySelector('.progress-fill').style.width = `${percent}%`;
    }
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-check-circle';
    if (type === 'error') icon = 'fa-exclamation-circle';

    toast.innerHTML = `
        <i class="fa-solid ${icon}"></i>
        <span>${message}</span>
    `;
    
    elements.toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(50px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function updateConnectionStatus(connected) {
    const badge = elements.connectionStatus;
    const text = badge.querySelector('.status-text');
    
    if (connected) {
        badge.classList.add('connected');
        text.textContent = 'Connected';
    } else {
        badge.classList.remove('connected');
        text.textContent = 'Disconnected';
    }
}

function resetConnectionUI() {
    conn = null;
    updateConnectionStatus(false);
    elements.connectSection.classList.remove('hidden');
    elements.transferSection.classList.add('hidden');
    elements.transfersList.innerHTML = '';
}

// Event Listeners
elements.copyIdBtn.addEventListener('click', () => {
    const id = elements.myPeerId.textContent;
    navigator.clipboard.writeText(id).then(() => {
        showToast('ID copied to clipboard', 'success');
    });
});

elements.connectBtn.addEventListener('click', () => {
    const remoteId = elements.remotePeerIdInput.value.trim();
    if (!remoteId) {
        showToast('Please enter a Peer ID', 'error');
        return;
    }
    if (remoteId === peer.id) {
        showToast('Cannot connect to yourself', 'error');
        return;
    }
    
    const connection = peer.connect(remoteId);
    handleConnection(connection);
});

elements.disconnectBtn.addEventListener('click', () => {
    if (conn) conn.close();
});

// Drag & Drop
elements.dropZone.addEventListener('click', () => elements.fileInput.click());

elements.dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    elements.dropZone.classList.add('drag-over');
});

elements.dropZone.addEventListener('dragleave', () => {
    elements.dropZone.classList.remove('drag-over');
});

elements.dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    elements.dropZone.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    handleFiles(files);
});

elements.fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
});

function handleFiles(files) {
    Array.from(files).forEach(file => sendFile(file));
}

// Start
initPeer();
