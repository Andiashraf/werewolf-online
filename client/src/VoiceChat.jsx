import { useEffect, useRef, useState } from 'react';
import { socket } from './socket.js';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // Free TURN relays from OpenRelay (metered.ca)
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  ]
};

export default function VoiceChat({ view, myPlayerId }) {
  const [micEnabled, setMicEnabled] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [stream, setStream] = useState(null);
  
  const peersRef = useRef({}); // { playerId: RTCPeerConnection }
  const audioContextRef = useRef({}); // { playerId: HTMLAudioElement }
  const connectedPeersRef = useRef(new Set()); // Track connection attempts

  // Game rules for muting
  const isNight = view.phase === 'night' || view.phase === 'resolution';
  const myPlayer = view.players?.find(p => p.id === myPlayerId);
  const amIDead = myPlayer ? !myPlayer.alive : false;
  
  // Force mute during night phase (unless moderator? Moderator doesn't even have a playerId usually, but let's just mute everyone at night)
  const isForceMuted = isNight;

  useEffect(() => {
    // Start local stream
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then(localStream => {
        setStream(localStream);
        setMicEnabled(true);
        // Initially pause all tracks if night
        localStream.getAudioTracks().forEach(t => t.enabled = !isNight);
      })
      .catch(err => {
        console.warn("Could not get microphone access:", err);
      });

    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop());
      Object.values(peersRef.current).forEach(pc => pc.close());
    };
  }, []);

  // Update local stream based on rules and UI toggles
  useEffect(() => {
    if (stream) {
      const shouldBeEnabled = micEnabled && !isForceMuted;
      stream.getAudioTracks().forEach(t => t.enabled = shouldBeEnabled);
    }
  }, [micEnabled, isForceMuted, stream]);

  // WebRTC Signaling handlers
  useEffect(() => {
    if (!myPlayerId || !stream) return; // Need a stream and ID to participate

    const handleSignal = async ({ senderPlayerId, signal }) => {
      if (senderPlayerId === myPlayerId) return;

      if (signal.type === 'request_offer') {
        if (myPlayerId < senderPlayerId) {
          if (peersRef.current[senderPlayerId]) {
            peersRef.current[senderPlayerId].close();
          }
          createPeer(senderPlayerId, true);
        }
        return;
      }

      let pc = peersRef.current[senderPlayerId];

      if (signal.type === 'offer') {
        // Important: if we are in have-local-offer, we have a glare condition.
        if (myPlayerId < senderPlayerId) return;
        
        if (pc) pc.close();
        pc = createPeer(senderPlayerId, false);
        
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc_signal', { targetPlayerId: senderPlayerId, signal: answer });
      } else if (signal.type === 'answer') {
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(signal));
      } else if (signal.candidate) {
        if (pc) await pc.addIceCandidate(new RTCIceCandidate(signal));
      }
    };

    socket.on('webrtc_signal', handleSignal);
    
    // Auto-connect to existing players
    const others = view.players?.map(p => p.id).filter(id => id !== myPlayerId) || [];
    if (!view.isModerator) others.push('MODERATOR');

    others.forEach(id => {
      if (!connectedPeersRef.current.has(id)) {
        connectedPeersRef.current.add(id);
        
        // Deterministic initiator
        if (myPlayerId < id) {
          createPeer(id, true); // Create and send offer
        } else {
          // Ask them to initiate because we might have joined late
          socket.emit('webrtc_signal', { targetPlayerId: id, signal: { type: 'request_offer' } });
        }
      }
    });

    return () => {
      socket.off('webrtc_signal', handleSignal);
    };
  }, [myPlayerId, stream, view.players, view.isModerator]);

  function createPeer(targetPlayerId, isInitiator = false) {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peersRef.current[targetPlayerId] = pc;

    if (stream) {
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtc_signal', { targetPlayerId, signal: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      // Attach audio stream to a new Audio element
      const audio = audioContextRef.current[targetPlayerId] || new Audio();
      audio.srcObject = event.streams[0];
      audio.autoplay = true;
      audioContextRef.current[targetPlayerId] = audio;
      // Explicitly call play() to handle browser autoplay policy
      audio.play().catch(() => {
        // Autoplay blocked — will be unmuted on next user interaction
        const unlock = () => {
          audio.play().catch(() => {});
          document.removeEventListener('click', unlock);
          document.removeEventListener('touchstart', unlock);
        };
        document.addEventListener('click', unlock, { once: true });
        document.addEventListener('touchstart', unlock, { once: true });
      });
    };

    pc.oniceconnectionstatechange = () => {
      const st = pc.iceConnectionState;
      if (st === 'disconnected' || st === 'failed') {
        pc.close();
        delete peersRef.current[targetPlayerId];
        connectedPeersRef.current.delete(targetPlayerId);
        if (audioContextRef.current[targetPlayerId]) {
          audioContextRef.current[targetPlayerId].pause();
          delete audioContextRef.current[targetPlayerId];
        }
        // Auto-retry connection after a short delay
        setTimeout(() => {
          if (!peersRef.current[targetPlayerId] && stream) {
            connectedPeersRef.current.add(targetPlayerId);
            if (myPlayerId < targetPlayerId) {
              createPeer(targetPlayerId, true);
            } else {
              socket.emit('webrtc_signal', { targetPlayerId, signal: { type: 'request_offer' } });
            }
          }
        }, 2000);
      }
    };

    if (isInitiator) {
      pc.createOffer().then(offer => {
        pc.setLocalDescription(offer);
        socket.emit('webrtc_signal', { targetPlayerId, signal: offer });
      });
    }

    return pc;
  }

  // Handle muting incoming audio (deafen or dead players logic)
  useEffect(() => {
    Object.keys(audioContextRef.current).forEach(id => {
      const audio = audioContextRef.current[id];
      const player = view.players?.find(p => p.id === id);
      
      // If they are dead and I am alive, I shouldn't hear them. (Ghost rule)
      const theyAreDead = player ? !player.alive : false;
      const shouldMute = deafened || (theyAreDead && !amIDead);
      
      audio.muted = shouldMute;
    });
  }, [deafened, view.players, amIDead]);

  return (
    <div className="hago-voice-controls">
      <button 
        type="button" 
        className={`hago-circle-btn ${!micEnabled || isForceMuted ? 'is-muted' : ''}`}
        onClick={() => setMicEnabled(!micEnabled)}
        disabled={isForceMuted}
        title={isForceMuted ? "Muted during Night Phase" : "Toggle Mic"}
      >
        {!micEnabled || isForceMuted ? <MicOff size={20} /> : <Mic size={20} />}
      </button>

      <button 
        type="button" 
        className={`hago-circle-btn ${deafened ? 'is-muted' : ''}`}
        onClick={() => setDeafened(!deafened)}
        title="Toggle Sound"
      >
        {deafened ? <VolumeX size={20} /> : <Volume2 size={20} />}
      </button>
    </div>
  );
}
