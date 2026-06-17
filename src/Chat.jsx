import { useState, useEffect, useRef, useCallback } from "react";
import { ref, push, onValue } from "firebase/database";
import { db } from "./firebase";
import AgoraRTC from "agora-rtc-sdk-ng";

const AGORA_APP_ID = process.env.REACT_APP_AGORA_APP_ID || "e1b7d0479d5b4b86a8dafd3b197eefab";

// ─── Text Chat Hook ────────────────────────────────────────────────────────────
export function useChat(roomId) {
  const [messages, setMessages] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const lastSeenRef = useRef(0);

  useEffect(() => {
    if (!roomId) return;
    const chatRef = ref(db, `rooms/${roomId}/chat`);
    const unsub = onValue(chatRef, snap => {
      if (!snap.exists()) { setMessages([]); setUnreadCount(0); return; }
      const msgs = Object.values(snap.val()).sort((a, b) => a.time - b.time);
      setMessages(msgs);
      setUnreadCount(Math.max(0, msgs.length - lastSeenRef.current));
    });
    return unsub;
  }, [roomId]);

  const markRead = useCallback((currentLength) => {
    lastSeenRef.current = currentLength;
    setUnreadCount(0);
  }, []);

  const sendMessage = useCallback(async (name, text) => {
    if (!text.trim() || !roomId) return;
    await push(ref(db, `rooms/${roomId}/chat`), {
      name,
      text: text.trim(),
      time: Date.now(),
    });
  }, [roomId]);

  return { messages, sendMessage, unreadCount, markRead };
}

// ─── Voice Hook ────────────────────────────────────────────────────────────────
export function useVoice(roomId, myName) {
  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speakingUsers, setSpeakingUsers] = useState(new Set());
  const [voiceError, setVoiceError] = useState(null);
  const clientRef = useRef(null);
  const trackRef = useRef(null);

  useEffect(() => {
    const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
    clientRef.current = client;

    client.on("user-published", async (user, mediaType) => {
      await client.subscribe(user, mediaType);
      if (mediaType === "audio") user.audioTrack.play();
    });

    client.on("volume-indicator", volumes => {
      setSpeakingUsers(new Set(
        volumes.filter(v => v.level > 5).map(v => String(v.uid))
      ));
    });

    return () => {
      if (trackRef.current) {
        trackRef.current.stop();
        trackRef.current.close();
        trackRef.current = null;
      }
      client.leave().catch(() => {});
      client.removeAllListeners();
    };
  }, []);

  const join = async () => {
    const client = clientRef.current;
    if (!client || joined) return;
    if (!AGORA_APP_ID) {
      setVoiceError("Voice not configured");
      return;
    }
    setVoiceError(null);

    // Must request mic permission FIRST — before any network await —
    // so the browser permission dialog fires within the user gesture context.
    // Without this, mobile browsers silently fail instead of prompting.
    try {
      const preStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      preStream.getTracks().forEach(t => t.stop());
    } catch (permErr) {
      const n = permErr?.name || "";
      setVoiceError(
        n === "NotAllowedError" ? "Mic permission denied — allow in browser settings" :
        n === "NotFoundError"   ? "No microphone detected" :
        `Mic error: ${n || permErr?.message || "unknown"}`
      );
      return;
    }

    try {
      await client.join(AGORA_APP_ID, roomId, null, myName);
      const track = await AgoraRTC.createMicrophoneAudioTrack();
      trackRef.current = track;
      await client.publish(track);
      client.enableAudioVolumeIndicator();
      setJoined(true);
      setMuted(false);
    } catch (e) {
      console.error("Voice join failed:", e);
      const code = e?.code || "";
      const msg  = e?.message || "";
      setVoiceError(
        code === "PERMISSION_DENIED" || msg.toLowerCase().includes("permission") ? "Mic permission denied" :
        msg.toLowerCase().includes("use") ? "Mic in use by another app" :
        `Voice error: ${code || msg || "unknown"}`
      );
    }
  };

  const leave = async () => {
    const client = clientRef.current;
    if (trackRef.current) {
      trackRef.current.stop();
      trackRef.current.close();
      trackRef.current = null;
    }
    if (client) await client.leave().catch(() => {});
    setJoined(false);
    setMuted(false);
    setSpeakingUsers(new Set());
  };

  const toggleMute = () => {
    if (!trackRef.current) return;
    const newMuted = !muted;
    trackRef.current.setEnabled(!newMuted);
    setMuted(newMuted);
  };

  return { joined, muted, join, leave, toggleMute, speakingUsers, voiceError };
}

// ─── ChatButton ────────────────────────────────────────────────────────────────
export function ChatButton({ unreadCount, onClick }) {
  return (
    <button className="chat-icon-btn" onClick={onClick} title="Open chat">
      💬
      {unreadCount > 0 && (
        <span className="chat-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>
      )}
    </button>
  );
}

// ─── ChatPopup ─────────────────────────────────────────────────────────────────
export function ChatPopup({ messages, myName, sendMessage, onClose }) {
  const [input, setInput] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = () => {
    if (!input.trim()) return;
    sendMessage(myName, input);
    setInput("");
  };

  const handleKey = (e) => {
    if (e.key === "Enter") handleSend();
  };

  const fmt = (time) => {
    const d = new Date(time);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="chat-overlay" onClick={onClose}>
      <div className="chat-popup" onClick={e => e.stopPropagation()}>
        <div className="chat-header">
          <span className="chat-title">Room Chat</span>
          <button className="chat-close" onClick={onClose}>✕</button>
        </div>
        <div className="chat-messages">
          {messages.length === 0 && (
            <div className="chat-empty">No messages yet. Say hello!</div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`chat-msg ${m.name === myName ? "chat-msg-mine" : ""}`}>
              <span className="chat-msg-name">{m.name}</span>
              <span className="chat-msg-text">{m.text}</span>
              <span className="chat-msg-time">{fmt(m.time)}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        <div className="chat-input-row">
          <input
            className="chat-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Type a message..."
            maxLength={200}
            autoFocus
          />
          <button className="chat-send-btn" onClick={handleSend}>Send</button>
        </div>
      </div>
    </div>
  );
}

// ─── VoiceMicButton ────────────────────────────────────────────────────────────
export function VoiceMicButton({ joined, muted, onJoin, onLeave, onToggleMute, error }) {
  return (
    <span className="voice-controls">
      {!joined ? (
        <button className="voice-mic-btn voice-off" onClick={onJoin} title="Join voice chat">🎤</button>
      ) : (
        <>
          <button
            className={`voice-mic-btn ${muted ? "voice-muted" : "voice-on"}`}
            onClick={onToggleMute}
            title={muted ? "Unmute" : "Mute"}
          >
            {muted ? "🔇" : "🎤"}
          </button>
          <button className="voice-leave-btn" onClick={onLeave} title="Leave voice">✕</button>
        </>
      )}
      {error && <span className="voice-error-msg" title={error}>⚠️</span>}
    </span>
  );
}

// ─── VoiceIndicator ────────────────────────────────────────────────────────────
export function VoiceIndicator({ playerName, speakingUsers, voiceUsers }) {
  const inVoice = voiceUsers?.has(playerName);
  const isSpeaking = speakingUsers?.has(playerName);
  if (!inVoice) return null;
  return (
    <span className={`voice-dot ${isSpeaking ? "voice-speaking" : "voice-silent"}`} title={isSpeaking ? "Speaking" : "In voice"}>
      🎤
    </span>
  );
}

// ─── ChatInline ────────────────────────────────────────────────────────────────
export function ChatInline({ messages, myName, sendMessage }) {
  const [input, setInput] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [lastSeen, setLastSeen] = useState(0);
  const bottomRef = useRef(null);
  const unread = messages.length - lastSeen;

  useEffect(() => {
    if (expanded) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      setLastSeen(messages.length);
    }
  }, [messages.length, expanded]);

  const handleSend = () => {
    if (!input.trim()) return;
    sendMessage(myName, input);
    setInput("");
    setExpanded(true);
    setLastSeen(messages.length + 1);
  };

  const fmt = (time) => new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="chat-inline">
      {expanded && (
        <div className="chat-inline-messages">
          {messages.length === 0 && <span className="chat-inline-empty">No messages yet</span>}
          {messages.map((m, i) => (
            <div key={i} className={`chat-inline-msg ${m.name === myName ? "chat-inline-mine" : ""}`}>
              <span className="chat-inline-name">{m.name}</span>
              <span className="chat-inline-text">{m.text}</span>
              <span className="chat-inline-time">{fmt(m.time)}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
      <div className="chat-inline-input-row">
        <button
          className={`chat-toggle-btn ${unread > 0 && !expanded ? "chat-has-unread" : ""}`}
          onClick={() => { setExpanded(e => !e); setLastSeen(messages.length); }}
        >
          💬{unread > 0 && !expanded ? ` ${unread}` : ""}
        </button>
        <input
          className="chat-inline-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSend()}
          onFocus={() => setExpanded(true)}
          placeholder="Chat..."
          maxLength={200}
        />
        <button className="chat-inline-send" onClick={handleSend}>➤</button>
      </div>
    </div>
  );
}
