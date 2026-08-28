import { useEffect, useRef, useState } from 'react';
import { socket } from './socket.js';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

export default function VoiceChat({ view, myPlayerId }) {
  const [micEnabled, setMicEnabled] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [stream, setStream] = useState(null);
  
  const peersRef = useRef({}); // { playerId: RTCPeerConnection }
  const audioContextRef = useRef({}); // { playerId: HTMLAudioElement }

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

      let pc = peersRef.current[senderPlayerId];

      if (signal.type === 'offer') {
        if (!pc) pc = createPeer(senderPlayerId);
        // Important: if we are in have-local-offer, we have a glare condition.
        // Because of deterministic initiator below, this should theoretically never happen,
        // but just in case, we ignore incoming offers if we already created one (we are initiator).
        if (pc.signalingState === 'have-local-offer' && myPlayerId < senderPlayerId) {
          return;
        }
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
      if (!peersRef.current[id]) {
        // Deterministic initiator: only create offer if my ID is lexicographically smaller.
        // MODERATOR is always < p_xxx, so Moderator always initiates to everyone.
        if (myPlayerId < id) {
          createPeer(id, true); // Create and send offer
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
      if (!audioContextRef.current[targetPlayerId]) {
        const audio = new Audio();
        audio.srcObject = event.streams[0];
        audio.autoplay = true;
        audioContextRef.current[targetPlayerId] = audio;
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        pc.close();
        delete peersRef.current[targetPlayerId];
        if (audioContextRef.current[targetPlayerId]) {
          audioContextRef.current[targetPlayerId].pause();
          delete audioContextRef.current[targetPlayerId];
        }
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
