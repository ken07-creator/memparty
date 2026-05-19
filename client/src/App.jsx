import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { emitWithAck, socket } from "./lib/socket";
import { clearSession, loadProfile, loadSession, randomLocalId, saveProfile, saveSession } from "./lib/storage";

const AVATARS = ["??", "??", "??", "??", "??", "??", "??", "??", "??", "??", "??", "??"];
const LANDING_STICKERS = ["??", "??", "??", "??", "?", "??", "??", "??", "??", "??"];

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

function randomAvatar() {
  return AVATARS[Math.floor(Math.random() * AVATARS.length)];
}

function countdown(endAt, tick) {
  if (!endAt) {
    return null;
  }
  return Math.max(0, Math.ceil((endAt - tick) / 1000));
}

function cardTilt(seed) {
  const hash = [...seed].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return ((hash % 11) - 5) * 0.6;
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
        x: Math.random() * 75 + 10,
        scale: Math.random() * 0.5 + 0.9,
        drift: Math.random() > 0.5 ? 1 : -1
      };
      setReactions((prev) => [...prev, spawn]);
      setTimeout(() => {
        setReactions((prev) => prev.filter((item) => item.id !== spawn.id));
      }, 2400);
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

    const result = await emitWithAck("create_room", {
      profile
    });

    if (!result.ok) {
      setStatus(result.message || "Could not create room.");
      return;
    }

    const nextProfile = { ...profile, userId: result.userId };
    setProfile(nextProfile);
    saveProfile(nextProfile);

    const nextSession = { roomCode: result.roomCode, userId: result.userId };
    setSession(nextSession);
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
    setProfile(nextProfile);
    saveProfile(nextProfile);

    const nextSession = { roomCode: result.roomCode, userId: result.userId };
    setSession(nextSession);
    saveSession(nextSession);
    setStatus("");
  }

  function leaveClientSession() {
    setRoomState(null);
    setSession(null);
    clearSession();
    setStatus("You left the room locally. Rejoin with code anytime.");
  }

  async function doAction(event, payload) {
    const res = await emitWithAck(event, payload);
    if (!res.ok) {
      setStatus(res.message || "Action failed.");
    } else {
      setStatus("");
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-night text-white">
      <div className="noise-overlay" />

      <AnimatePresence mode="wait">
        {!roomState ? (
          <Landing
            key="landing"
            profile={profile}
            roomCodeInput={roomCodeInput}
            setRoomCodeInput={setRoomCodeInput}
            setProfile={setProfile}
            createRoom={createRoom}
            joinRoom={joinRoom}
            status={status}
            connected={connected}
          />
        ) : (
          <RoomScreen
            key="room"
            roomState={roomState}
            myPlayer={myPlayer}
            session={session}
            setStatus={setStatus}
            status={status}
            reactions={reactions}
            doAction={doAction}
            leaveClientSession={leaveClientSession}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function Landing({ profile, setProfile, roomCodeInput, setRoomCodeInput, createRoom, joinRoom, status, connected }) {
  return (
    <motion.main
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.35 }}
      className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 pb-10 pt-12"
    >
      {LANDING_STICKERS.map((emoji, idx) => (
        <motion.div
          key={`${emoji}_${idx}`}
          className="pointer-events-none absolute text-2xl md:text-4xl"
          style={{
            left: `${7 + ((idx * 9) % 84)}%`,
            top: `${8 + ((idx * 14) % 70)}%`,
            rotate: `${(idx % 2 ? -1 : 1) * (8 + idx)}deg`
          }}
          animate={{ y: [0, -12, 0], x: [0, idx % 2 ? -6 : 6, 0] }}
          transition={{ duration: 3 + (idx % 4), repeat: Infinity, ease: "easeInOut" }}
        >
          {emoji}
        </motion.div>
      ))}

      <div className="relative z-10 mx-auto mt-8 w-full max-w-xl rounded-3xl border border-white/20 bg-ink/70 p-5 shadow-card backdrop-blur-xl">
        <motion.h1
          className="font-display text-center text-5xl uppercase tracking-wider text-plasma md:text-6xl"
          animate={{ textShadow: ["0 0 10px #f238ff", "0 0 24px #f238ff", "0 0 10px #f238ff"] }}
          transition={{ duration: 2.5, repeat: Infinity }}
        >
          MemParty
        </motion.h1>
        <p className="mt-3 rotate-[-1.6deg] rounded-xl bg-black/30 px-3 py-2 text-center text-sm text-cyber md:text-base">
          friends in a call, zero dignity, maximum meme chaos
        </p>

        <div className="mt-5 grid gap-3">
          <label className="text-sm font-semibold uppercase tracking-wide text-white/80">Username</label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setProfile((prev) => ({ ...prev, avatar: randomAvatar() }))}
              className="relative rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-3xl"
            >
              {profile.avatar}
              <span className="pulse-ring" />
            </button>
            <input
              value={profile.username}
              onChange={(event) => setProfile((prev) => ({ ...prev, username: event.target.value }))}
              placeholder="drop your cursed display name"
              maxLength={24}
              className="w-full rounded-2xl border border-white/25 bg-black/35 px-4 py-3 text-base outline-none ring-plasma/50 transition focus:ring"
            />
          </div>

          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <motion.button
              whileHover={{ scale: 1.03, rotate: -1 }}
              whileTap={{ scale: 0.96 }}
              onClick={createRoom}
              className="rounded-2xl bg-plasma px-4 py-3 font-display text-xl text-black shadow-glowPink"
            >
              Create Room
            </motion.button>
            <div className="glass rounded-2xl p-3">
              <input
                value={roomCodeInput}
                onChange={(event) => setRoomCodeInput(event.target.value.toUpperCase())}
                placeholder="ROOM CODE"
                className="w-full rounded-xl border border-white/20 bg-black/40 px-3 py-2 text-center tracking-[0.3em] outline-none"
                maxLength={8}
              />
              <motion.button
                whileHover={{ scale: 1.02, rotate: 1 }}
                whileTap={{ scale: 0.96 }}
                onClick={joinRoom}
                className="mt-2 w-full rounded-xl bg-cyber px-3 py-2 font-display text-lg text-black shadow-glowLime"
              >
                Join Chaos
              </motion.button>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between text-xs uppercase tracking-wider text-white/70">
          <span>{connected ? "Server connected" : "Trying to reconnect..."}</span>
          <span>4-10 players</span>
        </div>
        {status ? <p className="mt-2 text-sm text-rose-300">{status}</p> : null}
      </div>
    </motion.main>
  );
}

function RoomScreen({ roomState, myPlayer, session, doAction, reactions, status, setStatus, leaveClientSession }) {
  const [tick, setTick] = useState(Date.now());
  const [customCaption, setCustomCaption] = useState("");

  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 200);
    return () => clearInterval(timer);
  }, []);

  const rankedPlayers = useMemo(
    () => [...roomState.players].sort((a, b) => b.score - a.score),
    [roomState.players]
  );

  const secondsLeft = useMemo(() => {
    if (roomState.phase === "submission") {
      return countdown(roomState.timers.submissionEndsAt, tick);
    }
    if (roomState.phase === "voting") {
      return countdown(roomState.timers.votingEndsAt, tick);
    }
    if (roomState.phase === "scoreboard") {
      return countdown(roomState.timers.scoreboardEndsAt, tick);
    }
    return null;
  }, [roomState, tick]);

  const hasSubmitted = myPlayer?.submitted;
  const hasVoted = myPlayer ? Boolean(roomState.votesByPlayer?.[myPlayer.userId]) : false;

  return (
    <motion.main
      initial={{ opacity: 0, scale: 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.015 }}
      className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-3 pb-28 pt-4 md:px-5"
    >
      <FloatingReactions reactions={reactions} />

      <header className="glass z-20 flex items-center justify-between rounded-2xl p-3">
        <div>
          <div className="font-display text-lg leading-none text-plasma">Room {roomState.code}</div>
          <div className="text-xs uppercase tracking-wide text-white/70">Round {roomState.round || 0}</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-xl bg-black/40 px-3 py-1 text-xs uppercase tracking-wider">{roomState.phase}</div>
          {secondsLeft !== null ? (
            <motion.div
              key={secondsLeft}
              initial={{ scale: 1.2 }}
              animate={{ scale: 1 }}
              className="rounded-xl bg-cyber px-3 py-1 font-display text-lg text-black"
            >
              {secondsLeft}s
            </motion.div>
          ) : null}
          <button
            type="button"
            onClick={leaveClientSession}
            className="rounded-xl border border-white/30 bg-black/35 px-2 py-1 text-xs"
          >
            Leave
          </button>
        </div>
      </header>

      <section className="mt-3 grid flex-1 grid-cols-1 gap-3 lg:grid-cols-[1fr_270px]">
        <div className="relative rounded-3xl border border-white/15 bg-black/30 p-3 shadow-card">
          <Spotlight active={roomState.phase === "reveal"} />

          {roomState.phase === "lobby" ? (
            <LobbyPanel roomState={roomState} myPlayer={myPlayer} doAction={doAction} />
          ) : (
            <GameplayPanel
              roomState={roomState}
              myPlayer={myPlayer}
              hasSubmitted={hasSubmitted}
              hasVoted={hasVoted}
              doAction={doAction}
              customCaption={customCaption}
              setCustomCaption={setCustomCaption}
            />
          )}
        </div>

        <aside className="glass no-scrollbar max-h-[72vh] overflow-y-auto rounded-3xl p-3">
          <h2 className="mb-2 font-display text-xl text-cyber">Hype Board</h2>
          <div className="space-y-2">
            {rankedPlayers.map((player, idx) => (
              <motion.div
                key={player.userId}
                layout
                className={cn(
                  "flex items-center justify-between rounded-2xl border px-3 py-2",
                  player.userId === roomState.winnerUserId
                    ? "border-cyber bg-cyber/20"
                    : "border-white/20 bg-white/5"
                )}
              >
                <div className="flex items-center gap-2">
                  <div className="text-2xl">{player.avatar}</div>
                  <div>
                    <div className="text-sm font-semibold">{player.username}</div>
                    <div className="text-[11px] uppercase tracking-wide text-white/70">
                      {player.connected ? "online" : "reconnecting"}
                      {player.isHost ? " - host" : ""}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-display text-xl leading-none">{player.score}</div>
                  <div className="text-[10px] uppercase text-white/60">#{idx + 1}</div>
                </div>
              </motion.div>
            ))}
          </div>

          <ReactionPad
            emojis={roomState.reactionSet || []}
            sendReaction={(emoji) => doAction("send_reaction", { emoji })}
          />
        </aside>
      </section>

      <footer className="pointer-events-none fixed bottom-0 left-0 right-0 z-30 mx-auto w-full max-w-6xl px-3 pb-3 md:px-5">
        <div className="pointer-events-auto glass rounded-2xl px-3 py-2 text-xs text-white/70">
          You are {myPlayer?.avatar} {myPlayer?.username || session?.userId || "spectator"}
          {status ? <span className="ml-2 text-rose-300">{status}</span> : null}
          <button
            type="button"
            onClick={() => setStatus("")}
            className="float-right rounded-md border border-white/20 px-2 py-0.5"
          >
            clear
          </button>
        </div>
      </footer>
    </motion.main>
  );
}

function LobbyPanel({ roomState, myPlayer, doAction }) {
  const connectedCount = roomState.players.filter((p) => p.connected).length;

  return (
    <div className="relative flex h-full flex-col">
      <h2 className="font-display text-3xl text-plasma">Pre-Game Chaos Lounge</h2>
      <p className="mt-1 text-sm text-white/70">Get ready, tweak settings, then unleash caption carnage.</p>

      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_280px]">
        <div className="rounded-2xl border border-white/15 bg-black/30 p-3">
          <div className="mb-2 text-xs uppercase tracking-wide text-white/60">Players ({connectedCount}/{roomState.settings.maxPlayers})</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {roomState.players.map((player, index) => (
              <motion.div
                key={player.userId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                className={cn(
                  "rounded-2xl border px-3 py-2",
                  player.ready ? "rotate-[-0.5deg] border-cyber bg-cyber/10" : "rotate-[0.5deg] border-white/20 bg-white/5"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{player.avatar}</span>
                    <div className="text-sm font-semibold">{player.username}</div>
                  </div>
                  {player.isHost ? <span className="text-[10px] uppercase text-plasma">host</span> : null}
                </div>
                <div className="mt-1 text-[11px] uppercase text-white/60">{player.ready ? "ready" : "unready"}</div>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="glass rounded-2xl p-3">
          <div className="mb-2 text-xs uppercase tracking-wide text-white/60">Mode + Timing</div>
          <div className="space-y-2 text-sm">
            <label className="block">
              <span className="mb-1 block text-xs uppercase text-white/60">Mode</span>
              <select
                value={roomState.settings.mode}
                onChange={(event) => doAction("update_settings", { mode: event.target.value })}
                disabled={!myPlayer?.isHost}
                className="w-full rounded-lg border border-white/20 bg-black/40 px-2 py-2"
              >
                <option value="card">Card mode</option>
                <option value="custom">Custom mode</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs uppercase text-white/60">Submission seconds</span>
              <input
                type="range"
                min={15}
                max={90}
                value={roomState.settings.submissionSeconds}
                onChange={(event) => doAction("update_settings", { submissionSeconds: Number(event.target.value) })}
                disabled={!myPlayer?.isHost}
                className="w-full"
              />
              <div className="text-xs">{roomState.settings.submissionSeconds}s</div>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs uppercase text-white/60">Voting seconds</span>
              <input
                type="range"
                min={10}
                max={60}
                value={roomState.settings.votingSeconds}
                onChange={(event) => doAction("update_settings", { votingSeconds: Number(event.target.value) })}
                disabled={!myPlayer?.isHost}
                className="w-full"
              />
              <div className="text-xs">{roomState.settings.votingSeconds}s</div>
            </label>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <motion.button
          whileTap={{ scale: 0.95 }}
          whileHover={{ scale: 1.02 }}
          onClick={() => doAction("set_ready", { ready: !myPlayer?.ready })}
          className={cn(
            "rounded-xl px-4 py-2 font-semibold",
            myPlayer?.ready ? "bg-cyber text-black" : "bg-white/15"
          )}
        >
          {myPlayer?.ready ? "Ready to Meme" : "Set Ready"}
        </motion.button>
        {myPlayer?.isHost ? (
          <motion.button
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.02, rotate: -1 }}
            onClick={() => doAction("start_game", {})}
            className="rounded-xl bg-plasma px-4 py-2 font-display text-xl text-black shadow-glowPink"
          >
            Start Game
          </motion.button>
        ) : null}
      </div>
    </div>
  );
}

function GameplayPanel({ roomState, myPlayer, hasSubmitted, hasVoted, doAction, customCaption, setCustomCaption }) {
  const revealedIds = roomState.revealOrder.slice(0, roomState.revealIndex + 1);
  const visibleSubs = roomState.submissions.filter((sub) => revealedIds.includes(sub.id) || roomState.phase !== "reveal");

  return (
    <div className="flex h-full flex-col">
      <div className="relative mx-auto mt-1 w-full max-w-xl overflow-hidden rounded-3xl border border-white/20 bg-black/25 p-2">
        <img
          src={roomState.currentMeme?.url}
          alt={roomState.currentMeme?.title || "meme"}
          className="h-56 w-full rounded-2xl object-cover md:h-72"
        />
        <div className="absolute left-3 top-3 -rotate-2 rounded-lg bg-black/70 px-2 py-1 text-xs uppercase tracking-wider text-cyber">
          {roomState.currentMeme?.title || "meme template"}
        </div>
      </div>

      <div className="mt-3 min-h-[180px] flex-1 rounded-3xl border border-white/15 bg-black/30 p-3">
        {roomState.phase === "submission" ? (
          <SubmissionArea
            roomState={roomState}
            myPlayer={myPlayer}
            hasSubmitted={hasSubmitted}
            doAction={doAction}
            customCaption={customCaption}
            setCustomCaption={setCustomCaption}
          />
        ) : null}

        {roomState.phase === "reveal" ? (
          <RevealArea submissions={visibleSubs} revealIndex={roomState.revealIndex} />
        ) : null}

        {roomState.phase === "voting" ? (
          <VotingArea
            submissions={roomState.submissions}
            doAction={doAction}
            hasVoted={hasVoted}
            myUserId={myPlayer?.userId}
          />
        ) : null}

        {roomState.phase === "scoreboard" ? (
          <ScoreboardArea roomState={roomState} doAction={doAction} myPlayer={myPlayer} />
        ) : null}
      </div>
    </div>
  );
}

function SubmissionArea({ roomState, hasSubmitted, doAction, customCaption, setCustomCaption }) {
  if (hasSubmitted) {
    return <div className="pt-8 text-center text-lg text-cyber">Caption locked in. Watch the chaos unfold...</div>;
  }

  if (roomState.settings.mode === "custom") {
    return (
      <div>
        <div className="mb-2 text-sm uppercase tracking-wide text-white/60">Write your own caption</div>
        <textarea
          value={customCaption}
          onChange={(event) => setCustomCaption(event.target.value)}
          maxLength={roomState.settings.customCharLimit}
          className="h-28 w-full resize-none rounded-2xl border border-white/20 bg-black/45 p-3 outline-none focus:ring-2 focus:ring-plasma/60"
          placeholder="type something so unhinged your friends choke-laugh"
        />
        <div className="mt-2 flex items-center justify-between text-xs text-white/60">
          <span>{customCaption.length}/{roomState.settings.customCharLimit}</span>
          <motion.button
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.02 }}
            onClick={() => {
              doAction("submit_caption", { text: customCaption });
              setCustomCaption("");
            }}
            className="rounded-xl bg-cyber px-4 py-2 font-semibold text-black"
          >
            Submit Caption
          </motion.button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 text-sm uppercase tracking-wide text-white/60">Pick one caption card</div>
      <div className="no-scrollbar flex snap-x gap-2 overflow-x-auto pb-2">
        {roomState.myHand.map((card) => (
          <motion.button
            key={card.id}
            whileHover={{ y: -7, rotate: cardTilt(card.id) + 2 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => doAction("submit_caption", { cardId: card.id })}
            className="min-h-[120px] min-w-[170px] snap-start rounded-2xl border border-white/20 bg-gradient-to-br from-white/20 to-white/5 px-3 py-2 text-left shadow-card"
            style={{ rotate: `${cardTilt(card.id)}deg` }}
          >
            <span className="text-sm">{card.text}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

function RevealArea({ submissions, revealIndex }) {
  return (
    <div>
      <div className="mb-3 text-center font-display text-2xl text-plasma">Reveal Time</div>
      <div className="grid gap-2 md:grid-cols-2">
        <AnimatePresence>
          {submissions.map((sub, idx) => (
            <motion.div
              key={sub.id}
              initial={{ rotateY: 90, opacity: 0, scale: 0.8 }}
              animate={{ rotateY: 0, opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 120, damping: 16, delay: idx * 0.08 }}
              className="rounded-2xl border border-plasma/40 bg-black/50 p-3 shadow-glowPink"
              style={{ rotate: `${cardTilt(sub.id)}deg` }}
            >
              <div className="text-sm">{sub.text}</div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <div className="mt-3 text-center text-xs uppercase text-white/60">Card {Math.max(revealIndex + 1, 0)} revealed</div>
    </div>
  );
}

function VotingArea({ submissions, doAction, hasVoted, myUserId }) {
  return (
    <div>
      <div className="mb-2 font-display text-2xl text-cyber">Vote For The Funniest</div>
      <div className="grid gap-2 md:grid-cols-2">
        {submissions.map((sub) => {
          const mine = sub.isMine || sub.playerUserId === myUserId;
          return (
            <motion.button
              key={sub.id}
              whileHover={{ scale: mine || hasVoted ? 1 : 1.02, rotate: cardTilt(sub.id) + 1 }}
              whileTap={{ scale: mine || hasVoted ? 1 : 0.97 }}
              disabled={mine || hasVoted}
              onClick={() => doAction("cast_vote", { submissionId: sub.id })}
              className={cn(
                "rounded-2xl border px-3 py-3 text-left",
                mine ? "border-white/10 bg-white/5 opacity-50" : "border-cyber/50 bg-cyber/10",
                hasVoted ? "opacity-60" : ""
              )}
            >
              {sub.text}
            </motion.button>
          );
        })}
      </div>
      <p className="mt-2 text-xs uppercase text-white/60">{hasVoted ? "Vote locked in" : "Tap one card"}</p>
    </div>
  );
}

function ScoreboardArea({ roomState, doAction, myPlayer }) {
  const ranked = [...roomState.players].sort((a, b) => b.score - a.score);
  const winner = ranked[0];

  return (
    <div>
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="rounded-2xl border border-cyber/40 bg-cyber/10 p-3 text-center"
      >
        <div className="text-xs uppercase tracking-widest text-cyber">Round Winner</div>
        <div className="mt-1 text-4xl">{winner?.avatar}</div>
        <div className="font-display text-3xl text-cyber">{winner?.username || "nobody"}</div>
      </motion.div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {ranked.map((player, index) => (
          <motion.div
            key={player.userId}
            layout
            className={cn(
              "rounded-xl border px-3 py-2",
              index === 0 ? "border-plasma/60 bg-plasma/20" : "border-white/15 bg-white/5"
            )}
          >
            #{index + 1} {player.avatar} {player.username} - {player.score} pts
          </motion.div>
        ))}
      </div>

      {myPlayer?.isHost ? (
        <button
          type="button"
          onClick={() => doAction("next_round", {})}
          className="mt-3 rounded-xl bg-plasma px-4 py-2 font-display text-black"
        >
          Next Round Now
        </button>
      ) : null}
    </div>
  );
}

function Spotlight({ active }) {
  return (
    <AnimatePresence>
      {active ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="pointer-events-none absolute inset-0 z-10"
        >
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute left-1/2 top-1/2 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full bg-plasma/25 blur-3xl" />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function ReactionPad({ emojis, sendReaction }) {
  return (
    <div className="mt-4">
      <div className="mb-2 text-xs uppercase tracking-wide text-white/60">Reaction spam</div>
      <div className="grid grid-cols-5 gap-2">
        {emojis.map((emoji) => (
          <motion.button
            key={emoji}
            whileTap={{ scale: 1.25 }}
            whileHover={{ y: -2 }}
            onClick={() => sendReaction(emoji)}
            className="rounded-lg border border-white/20 bg-black/35 py-1 text-lg"
          >
            {emoji}
          </motion.button>
        ))}
      </div>
    </div>
  );
}

function FloatingReactions({ reactions }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
      <AnimatePresence>
        {reactions.map((reaction) => (
          <motion.div
            key={reaction.id}
            initial={{ opacity: 0, y: 18, x: 0, scale: 0.8 }}
            animate={{ opacity: 1, y: -130, x: reaction.drift * 35, scale: reaction.scale }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2.1, ease: "easeOut" }}
            style={{ left: `${reaction.x}%`, bottom: "12%" }}
            className="absolute rounded-xl bg-black/55 px-2 py-1 text-xl shadow-card"
          >
            {reaction.emoji}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export default App;