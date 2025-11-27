# PeerShare - P2P File Transfer

A secure, serverless, peer-to-peer file transfer application built with **HTML, CSS, and JavaScript (PeerJS)**.

## Features
- **Serverless**: Files are transferred directly between peers using WebRTC.
- **Secure**: No data is stored on any server.
- **Easy to Use**: Generate a Peer ID, share it, and start transferring.
- **Modern UI**: Glassmorphism design with a premium feel.

## How to Use
1. **Open the App**: Visit the deployed URL.
2. **Sender**:
   - Copy your **Peer ID** from the "Your Identity" section.
   - Send this ID to your friend.
3. **Receiver**:
   - Paste the Sender's Peer ID into the "Connect to Peer" box.
   - Click **Connect**.
4. **Transfer**:
   - Once connected, drag and drop files or click to browse.
   - The file transfer will start immediately.

## Technologies
- **Frontend**: HTML5, CSS3 (Glassmorphism), JavaScript (ES6+)
- **WebRTC Library**: [PeerJS](https://peerjs.com/)
- **STUN Servers**: Google Public STUN

## Deployment
This project is a static web application and can be deployed freely on:
- **GitHub Pages**
- **Netlify**
- **Vercel**

### Deploy to GitHub Pages
1. Push this code to a GitHub repository.
2. Go to **Settings** > **Pages**.
3. Select the `main` branch as the source.
4. Save and wait for the link!
