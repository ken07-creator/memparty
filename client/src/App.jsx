import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import LandingScreen from "./components/LandingScreen";
import RoomScreen from "./components/RoomScreen";
import { emitWithAck, socket } from "./lib/socket";
import { AVATARS } from "./lib/constants";
import { clearSession, loadProfile, loadSession, randomLocalId, saveProfile, saveSession } from "./lib/storage";

function randomAvatar() {
  return AVATARS[Math.floor(Math.random() * AVATARS.length)];
}

function App() {
  const [profile, setProfile] = useState(() => {
    const stored = loadProfile();
    if (stored?.username) {
      return stored;
    }
    return {
      username: "",
      avatar: randomAvatar(),
      userId: randomLocalId()
    };
  });

  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [roomState, setRoomState] = useState(null);
  const [session, setSession] = useState(() => loadSession());
  const [status, setStatus] = useState("");
  const [connected, setConnected] = useState(socket.connected);
  const [reactions, setReactions] = useState([]);
  const [reactionStream, setReactionStream] = useState([]);
  const reconnectAttemptedRef = useRef(false);

  useEffect(() => {
    saveProfile(profile);
  }, [profile]);

  useEffect(() => {
    const onRoomState = (state) => {
      setRoomState(state);
    };

    const onReaction = (reaction) => {
      const spawn = {
        ...reaction,
        x: Math.random() * 82 + 8,
        drift: Math.random() > 0.5 ? 1 : -1,
        scale: Math.random() * 0.45 + 0.85
      };
      setReactions((prev) => [...prev, spawn]);
      setReactionStream((prev) => [spawn, ...prev].slice(0, 7));
      setTimeout(() => {
        setReactions((prev) => prev.filter((item) => item.id !== spawn.id));
      }, 2400);
      setTimeout(() => {
        setReactionStream((prev) => prev.filter((item) => item.id !== spawn.id));
      }, 5000);
    };

    const onConnect = async () => {
      setConnected(true);
      const existing = loadSession();
      if (existing && !reconnectAttemptedRef.current) {
        reconnectAttemptedRef.current = true;
        const result = await emitWithAck("rejoin_room", existing);
        if (!result.ok) {
          clearSession();
          setSession(null);
          setRoomState(null);
        } else {
          setSession({ roomCode: result.roomCode, userId: result.userId });
        }
      }
    };

    const onDisconnect = () => {
      setConnected(false);
    };

    socket.on("room_state", onRoomState);
    socket.on("reaction_burst", onReaction);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    if (!socket.connected) {
      socket.connect();
    }

    return () => {
      socket.off("room_state", onRoomState);
      socket.off("reaction_burst", onReaction);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  const myPlayer = useMemo(() => {
    if (!roomState || !session) {
      return null;
    }
    return roomState.players.find((player) => player.userId === session.userId) || null;
  }, [roomState, session]);

  async function createRoom() {
    const username = profile.username.trim();
    if (!username) {
      setStatus("Pick a username first.");
      return;
    }

    const result = await emitWithAck("create_room", { profile });
    if (!result.ok) {
      setStatus(result.message || "Could not create room.");
      return;
    }

    const nextProfile = { ...profile, userId: result.userId };
    const nextSession = { roomCode: result.roomCode, userId: result.userId };

    setProfile(nextProfile);
    setSession(nextSession);
    saveProfile(nextProfile);
    saveSession(nextSession);
    setStatus("");
  }

  async function joinRoom() {
    const username = profile.username.trim();
    const roomCode = roomCodeInput.trim().toUpperCase();
    if (!username || !roomCode) {
      setStatus("Enter username and room code.");
      return;
    }

    const result = await emitWithAck("join_room", {
      roomCode,
      profile
    });

    if (!result.ok) {
      setStatus(result.message || "Could not join room.");
      return;
    }

    const nextProfile = { ...profile, userId: result.userId };
    const nextSession = { roomCode: result.roomCode, userId: result.userId };

    setProfile(nextProfile);
    setSession(nextSession);
    saveProfile(nextProfile);
    saveSession(nextSession);
    setStatus("");
  }

  function leaveClientSession() {
    setRoomState(null);
    setSession(null);
    setReactionStream([]);
    clearSession();
    setStatus("Left room locally. Rejoin using code.");
  }

  async function doAction(event, payload) {
    const res = await emitWithAck(event, payload);
    if (!res.ok) {
      setStatus(res.message || "Action failed.");
      return false;
    }
    setStatus("");
    return true;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-night text-white">
      <div className="noise-overlay" />
      <div className="ambient-bloom" />

      <AnimatePresence mode="wait">
        {!roomState ? (
          <motion.div key="landing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <LandingScreen
              connected={connected}
              profile={profile}
              setProfile={setProfile}
              roomCodeInput={roomCodeInput}
              setRoomCodeInput={setRoomCodeInput}
              createRoom={createRoom}
              joinRoom={joinRoom}
              status={status}
            />
          </motion.div>
        ) : (
          <motion.div key="room" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <RoomScreen
              roomState={roomState}
              myPlayer={myPlayer}
              session={session}
              status={status}
              setStatus={setStatus}
              reactions={reactions}
              reactionStream={reactionStream}
              leaveClientSession={leaveClientSession}
              doAction={doAction}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;