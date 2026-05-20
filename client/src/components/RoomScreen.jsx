import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { STATUS_COPY } from "../lib/constants";

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

function countdown(endAt, tick) {
  if (!endAt) {
    return null;
  }
  return Math.max(0, Math.ceil((endAt - tick) / 1000));
}

function tiltFrom(seed, multiplier = 1) {
  const hash = [...seed].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return ((hash % 9) - 4) * 1.1 * multiplier;
}

function RoomScreen({
  roomState,
  myPlayer,
  session,
  status,
  setStatus,
  reactions,
  reactionStream,
  leaveClientSession,
  doAction
}) {
  const [tick, setTick] = useState(Date.now());
  const [customCaption, setCustomCaption] = useState("");
  const [selectedCardId, setSelectedCardId] = useState("");
  const [showRoster, setShowRoster] = useState(false);
  const typingPulseRef = useRef(0);
  const typingStopTimer = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 200);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setSelectedCardId("");
    setCustomCaption("");
    if (typingStopTimer.current) {
      clearTimeout(typingStopTimer.current);
      typingStopTimer.current = null;
    }
  }, [roomState.phase, roomState.round]);

  useEffect(() => {
    if (roomState.phase !== "submission" || roomState.settings.mode !== "custom") {
      return;
    }
    if (myPlayer?.submitted) {
      return;
    }

    const nonEmpty = customCaption.trim().length > 0;
    const now = Date.now();
    if (nonEmpty && now - typingPulseRef.current > 700) {
      typingPulseRef.current = now;
      doAction("set_typing", { typing: true });
    }

    if (typingStopTimer.current) {
      clearTimeout(typingStopTimer.current);
    }
    typingStopTimer.current = setTimeout(() => {
      doAction("set_typing", { typing: false });
    }, 1300);

    return () => {
      if (typingStopTimer.current) {
        clearTimeout(typingStopTimer.current);
      }
    };
  }, [customCaption, roomState.phase, roomState.settings.mode, myPlayer?.submitted]);

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

  const rankedPlayers = useMemo(
    () => [...roomState.players].sort((a, b) => b.score - a.score),
    [roomState.players]
  );

  const votedAlready = myPlayer ? Boolean(roomState.votesByPlayer?.[myPlayer.userId]) : false;

  const revealedSubmissionIds = roomState.revealOrder.slice(0, roomState.revealIndex + 1);
  const revealCards = roomState.submissions.filter((item) => revealedSubmissionIds.includes(item.id));

  async function submitSelectedCard() {
    if (!selectedCardId) {
      setStatus("Tap one card first.");
      return;
    }
    await doAction("submit_caption", { cardId: selectedCardId });
    setSelectedCardId("");
  }

  async function submitCustomCaption() {
    if (!customCaption.trim()) {
      setStatus("Write a caption first.");
      return;
    }
    const ok = await doAction("submit_caption", { text: customCaption.trim() });
    if (ok) {
      doAction("set_typing", { typing: false });
      setCustomCaption("");
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-3 pb-[15.5rem] pt-3">
      <FloatingReactions reactions={reactions} />

      <TopBar
        roomState={roomState}
        myPlayer={myPlayer}
        secondsLeft={secondsLeft}
        onLeave={leaveClientSession}
        onOpenRoster={() => setShowRoster((prev) => !prev)}
      />

      <PresenceStrip players={roomState.players} />

      <MemeStage roomState={roomState} phase={roomState.phase} />

      <section className="mt-3 space-y-3">
        {roomState.phase === "lobby" ? (
          <LobbyPanel roomState={roomState} myPlayer={myPlayer} doAction={doAction} />
        ) : null}

        {roomState.phase === "submission" ? (
          <SubmissionInfo roomState={roomState} myPlayer={myPlayer} />
        ) : null}

        {roomState.phase === "reveal" ? <RevealPhase cards={revealCards} revealIndex={roomState.revealIndex} /> : null}

        {roomState.phase === "voting" ? (
          <VotingPhase
            submissions={roomState.submissions}
            myUserId={myPlayer?.userId}
            votedAlready={votedAlready}
            doAction={doAction}
          />
        ) : null}

        {roomState.phase === "scoreboard" ? (
          <ScoreboardPhase roomState={roomState} myPlayer={myPlayer} rankedPlayers={rankedPlayers} doAction={doAction} />
        ) : null}
      </section>

      <div className="fixed bottom-2 left-0 right-0 z-50 mx-auto w-full max-w-3xl px-3">
        <BottomDock
          roomState={roomState}
          myPlayer={myPlayer}
          selectedCardId={selectedCardId}
          setSelectedCardId={setSelectedCardId}
          submitSelectedCard={submitSelectedCard}
          customCaption={customCaption}
          setCustomCaption={setCustomCaption}
          submitCustomCaption={submitCustomCaption}
          doAction={doAction}
          reactionStream={reactionStream}
          status={status}
          clearStatus={() => setStatus("")}
        />
      </div>

      <AnimatePresence>
        {showRoster ? <RosterSheet rankedPlayers={rankedPlayers} onClose={() => setShowRoster(false)} /> : null}
      </AnimatePresence>
    </main>
  );
}

function TopBar({ roomState, myPlayer, secondsLeft, onLeave, onOpenRoster }) {
  return (
    <header className="glass sticky top-2 z-40 flex items-center justify-between rounded-2xl px-3 py-2">
      <div>
        <div className="font-display text-lg leading-none text-plasma">{roomState.code}</div>
        <div className="text-[10px] uppercase tracking-[0.2em] text-white/65">round {roomState.round || 0} - {roomState.phase}</div>
      </div>
      <div className="flex items-center gap-2">
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
        <button type="button" onClick={onOpenRoster} className="pill-btn h-10 px-3 text-xs">Roster</button>
        <button type="button" onClick={onLeave} className="pill-btn h-10 px-3 text-xs">Leave</button>
      </div>
      {myPlayer?.isHost ? <span className="host-pin">HOST</span> : null}
    </header>
  );
}

function PresenceStrip({ players }) {
  return (
    <div className="no-scrollbar mt-3 flex snap-x gap-2 overflow-x-auto pb-1">
      {players.map((player) => (
        <motion.div
          key={player.userId}
          animate={{ y: [0, -2, 0] }}
          transition={{ duration: 2.4 + (player.userId.length % 2), repeat: Infinity, ease: "easeInOut" }}
          className={cn(
            "snap-start rounded-2xl border px-3 py-2",
            player.connected ? "border-white/20 bg-black/30" : "border-amber-300/40 bg-amber-400/10"
          )}
        >
          <div className="flex items-center gap-2">
            <span className="text-xl">{player.avatar}</span>
            <div>
              <div className="max-w-[88px] truncate text-xs font-semibold">{player.username}</div>
              <div className="text-[10px] uppercase tracking-wide text-white/60">{STATUS_COPY[player.status] || "online"}</div>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function MemeStage({ roomState, phase }) {
  return (
    <section className="relative mt-2 overflow-hidden rounded-3xl border border-white/20 bg-black/35 p-2 shadow-card">
      <motion.img
        key={roomState.currentMeme?.id || "lobby"}
        initial={{ opacity: 0.7, scale: 1.08 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.42 }}
        src={roomState.currentMeme?.url}
        alt={roomState.currentMeme?.title || "meme template"}
        className="h-[38vh] w-full rounded-2xl object-cover sm:h-[44vh]"
      />
      <div className="absolute left-4 top-4 -rotate-2 rounded-lg bg-black/70 px-2 py-1 text-[11px] uppercase tracking-[0.18em] text-cyber">
        {roomState.currentMeme?.title || "Lobby mode"}
      </div>

      <AnimatePresence>
        {phase === "reveal" ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0"
          >
            <div className="absolute inset-0 bg-black/50" />
            <div className="absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-plasma/30 blur-3xl" />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

function LobbyPanel({ roomState, myPlayer, doAction }) {
  const connectedCount = roomState.players.filter((entry) => entry.connected).length;

  return (
    <section className="space-y-3 rounded-3xl border border-white/15 bg-black/30 p-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-white/60">Room code</div>
          <div className="font-display text-3xl text-plasma">{roomState.code}</div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-[0.2em] text-white/60">Players</div>
          <div className="text-lg font-bold text-cyber">{connectedCount}/{roomState.settings.maxPlayers}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <label className="text-xs uppercase tracking-[0.18em] text-white/60">Game mode</label>
        <select
          value={roomState.settings.mode}
          onChange={(event) => doAction("update_settings", { mode: event.target.value })}
          disabled={!myPlayer?.isHost}
          className="h-12 rounded-xl border border-white/20 bg-black/45 px-3"
        >
          <option value="card">Card Mode</option>
          <option value="custom">Custom Caption Mode</option>
        </select>

        <label className="text-xs uppercase tracking-[0.18em] text-white/60">Submission timer ({roomState.settings.submissionSeconds}s)</label>
        <input
          type="range"
          min={15}
          max={90}
          value={roomState.settings.submissionSeconds}
          onChange={(event) => doAction("update_settings", { submissionSeconds: Number(event.target.value) })}
          disabled={!myPlayer?.isHost}
        />

        <label className="text-xs uppercase tracking-[0.18em] text-white/60">Voting timer ({roomState.settings.votingSeconds}s)</label>
        <input
          type="range"
          min={10}
          max={60}
          value={roomState.settings.votingSeconds}
          onChange={(event) => doAction("update_settings", { votingSeconds: Number(event.target.value) })}
          disabled={!myPlayer?.isHost}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <motion.button
          whileTap={{ scale: 0.96 }}
          whileHover={{ scale: 1.01 }}
          onClick={() => doAction("set_ready", { ready: !myPlayer?.ready })}
          className={cn(
            "h-14 rounded-2xl text-sm font-bold uppercase tracking-[0.15em]",
            myPlayer?.ready ? "bg-cyber text-black" : "bg-white/15"
          )}
        >
          {myPlayer?.ready ? "Ready" : "Set Ready"}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.96 }}
          whileHover={{ scale: 1.01 }}
          onClick={() => doAction("start_game", {})}
          disabled={!myPlayer?.isHost}
          className={cn(
            "h-14 rounded-2xl font-display text-xl text-black",
            myPlayer?.isHost ? "bg-plasma shadow-glowPink" : "bg-white/25 text-white/65"
          )}
        >
          Start
        </motion.button>
      </div>
    </section>
  );
}

function SubmissionInfo({ roomState, myPlayer }) {
  if (myPlayer?.submitted) {
    return (
      <div className="rounded-2xl border border-cyber/40 bg-cyber/15 px-3 py-2 text-sm text-cyber">
        Submitted! Now spam reactions while everyone else cooks.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-plasma/40 bg-plasma/10 px-3 py-2 text-sm text-white">
      {roomState.settings.mode === "card"
        ? "Pick one card from your hand below."
        : "Write a caption below. Keep it short and savage."}
    </div>
  );
}

function RevealPhase({ cards, revealIndex }) {
  const current = cards[cards.length - 1];

  return (
    <div className="relative rounded-3xl border border-plasma/40 bg-black/45 p-3">
      <div className="mb-2 text-center font-display text-2xl text-plasma">Reveal Theater</div>
      <div className="min-h-[170px]">
        <AnimatePresence mode="wait">
          {current ? (
            <motion.div
              key={current.id}
              initial={{ rotateY: 88, opacity: 0, y: 16, scale: 0.82 }}
              animate={{ rotateY: 0, opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 100, damping: 13 }}
              style={{ rotate: `${tiltFrom(current.id, 0.6)}deg` }}
              className="mx-auto max-w-md rounded-2xl border border-plasma/55 bg-black/75 p-4 text-lg shadow-glowPink"
            >
              {current.text}
            </motion.div>
          ) : (
            <div className="pt-14 text-center text-white/60">Shuffling cards...</div>
          )}
        </AnimatePresence>
      </div>
      <p className="mt-2 text-center text-[11px] uppercase tracking-[0.18em] text-white/60">revealed {Math.max(revealIndex + 1, 0)}</p>
    </div>
  );
}

function VotingPhase({ submissions, myUserId, votedAlready, doAction }) {
  return (
    <div className="space-y-2 rounded-3xl border border-cyber/45 bg-black/35 p-3">
      <div className="font-display text-2xl text-cyber">Vote the funniest</div>
      <div className="grid gap-2">
        {submissions.map((sub) => {
          const mine = sub.isMine || sub.playerUserId === myUserId;
          return (
            <motion.button
              key={sub.id}
              whileHover={{ scale: mine || votedAlready ? 1 : 1.01 }}
              whileTap={{ scale: mine || votedAlready ? 1 : 0.98 }}
              disabled={mine || votedAlready}
              onClick={() => doAction("cast_vote", { submissionId: sub.id })}
              className={cn(
                "rounded-2xl border px-3 py-3 text-left text-base",
                mine ? "border-white/10 bg-white/5 opacity-45" : "border-cyber/50 bg-cyber/10",
                votedAlready ? "opacity-70" : ""
              )}
            >
              {sub.text}
            </motion.button>
          );
        })}
      </div>
      <p className="text-xs uppercase tracking-[0.16em] text-white/60">{votedAlready ? "vote locked" : "tap one card to vote"}</p>
    </div>
  );
}

function ScoreboardPhase({ roomState, myPlayer, rankedPlayers, doAction }) {
  const winner = rankedPlayers[0];

  return (
    <div className="space-y-3 rounded-3xl border border-cyber/45 bg-black/35 p-3">
      <motion.div
        initial={{ opacity: 0, scale: 0.88 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-2xl border border-cyber/45 bg-cyber/10 p-3 text-center"
      >
        <div className="text-xs uppercase tracking-[0.2em] text-cyber">winner spotlight</div>
        <div className="mt-1 text-4xl">{winner?.avatar}</div>
        <div className="font-display text-3xl text-cyber">{winner?.username || "nobody"}</div>
      </motion.div>

      <div className="space-y-2">
        {rankedPlayers.map((player, idx) => (
          <motion.div
            key={player.userId}
            layout
            className={cn(
              "flex items-center justify-between rounded-xl border px-3 py-2",
              idx === 0 ? "border-plasma/60 bg-plasma/20" : "border-white/20 bg-white/5"
            )}
          >
            <span className="text-sm">#{idx + 1} {player.avatar} {player.username}</span>
            <span className="font-display text-xl">{player.score}</span>
          </motion.div>
        ))}
      </div>

      {myPlayer?.isHost ? (
        <motion.button
          whileTap={{ scale: 0.97 }}
          whileHover={{ scale: 1.01 }}
          onClick={() => doAction("next_round", {})}
          className="h-12 w-full rounded-xl bg-plasma font-display text-xl text-black"
        >
          Next Round Now
        </motion.button>
      ) : null}

      <p className="text-[11px] uppercase tracking-[0.2em] text-white/60">auto-advance still enabled</p>
      {roomState.winnerUserId ? <ConfettiBurst keyId={roomState.winnerUserId} /> : null}
    </div>
  );
}

function BottomDock({
  roomState,
  myPlayer,
  selectedCardId,
  setSelectedCardId,
  submitSelectedCard,
  customCaption,
  setCustomCaption,
  submitCustomCaption,
  doAction,
  reactionStream,
  status,
  clearStatus
}) {
  const mode = roomState.settings.mode;
  const showSubmissionTools = roomState.phase === "submission" && !myPlayer?.submitted;

  return (
    <div className="glass rounded-3xl border border-white/25 px-3 py-3">
      <div className="mb-2 flex items-center justify-between">
        <QuickReactionButtons emojis={roomState.reactionSet || []} onReact={(emoji) => doAction("send_reaction", { emoji })} />
        <div className="text-[10px] uppercase tracking-[0.2em] text-white/55">thumb zone</div>
      </div>

      {showSubmissionTools && mode === "card" ? (
        <CardHandDock
          cards={roomState.myHand}
          selectedCardId={selectedCardId}
          setSelectedCardId={setSelectedCardId}
          submitSelectedCard={submitSelectedCard}
        />
      ) : null}

      {showSubmissionTools && mode === "custom" ? (
        <CustomCaptionDock
          value={customCaption}
          setValue={setCustomCaption}
          charLimit={roomState.settings.customCharLimit}
          onSubmit={submitCustomCaption}
        />
      ) : null}

      {!showSubmissionTools ? (
        <div className="rounded-2xl border border-white/20 bg-black/35 px-3 py-3 text-center text-sm text-white/70">
          {roomState.phase === "lobby" ? "Get ready and start when everyone is in." : "Watch, react, and wait for next phase."}
        </div>
      ) : null}

      <ReactionStream stream={reactionStream} />
      {status ? <StatusBar text={status} onClear={clearStatus} /> : null}
    </div>
  );
}

function CardHandDock({ cards, selectedCardId, setSelectedCardId, submitSelectedCard }) {
  return (
    <div>
      <div className="no-scrollbar flex snap-x gap-3 overflow-x-auto pb-2">
        {cards.map((card, idx) => {
          const selected = selectedCardId === card.id;
          return (
            <motion.button
              key={card.id}
              drag="x"
              dragConstraints={{ left: -18, right: 18 }}
              whileDrag={{ scale: 1.04, rotate: 0 }}
              whileHover={{ y: -6 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setSelectedCardId(card.id)}
              className={cn(
                "min-h-[148px] min-w-[74vw] max-w-[22rem] snap-center rounded-2xl border px-4 py-3 text-left",
                selected ? "border-cyber bg-cyber/16 shadow-glowLime" : "border-white/20 bg-white/8"
              )}
              style={{
                rotate: `${(idx % 2 === 0 ? -1 : 1) * (1.5 + ((idx + 2) % 4))}deg`,
                transformOrigin: "bottom center"
              }}
            >
              <p className="text-[1.03rem] leading-6">{card.text}</p>
            </motion.button>
          );
        })}
      </div>
      <motion.button
        whileTap={{ scale: 0.96 }}
        whileHover={{ scale: 1.01 }}
        onClick={submitSelectedCard}
        className="mt-2 h-12 w-full rounded-xl bg-cyber font-display text-xl text-black"
      >
        Submit Selected Card
      </motion.button>
    </div>
  );
}

function CustomCaptionDock({ value, setValue, charLimit, onSubmit }) {
  return (
    <div>
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="drop your caption here..."
        maxLength={charLimit}
        className="h-24 w-full resize-none rounded-2xl border border-white/20 bg-black/45 p-3 text-base outline-none focus:ring-2 focus:ring-plasma/60"
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-white/60">{value.length}/{charLimit}</span>
        <motion.button
          whileTap={{ scale: 0.96 }}
          whileHover={{ scale: 1.01 }}
          onClick={onSubmit}
          className="h-11 rounded-xl bg-cyber px-4 font-bold text-black"
        >
          Submit Caption
        </motion.button>
      </div>
    </div>
  );
}

function QuickReactionButtons({ emojis, onReact }) {
  const quick = emojis.slice(0, 5);
  return (
    <div className="flex gap-2">
      {quick.map((emoji) => (
        <motion.button
          key={emoji}
          whileTap={{ scale: 1.24 }}
          whileHover={{ y: -2 }}
          onClick={() => onReact(emoji)}
          className="h-10 w-10 rounded-xl border border-white/20 bg-black/40 text-xl"
        >
          {emoji}
        </motion.button>
      ))}
    </div>
  );
}

function ReactionStream({ stream }) {
  if (!stream.length) {
    return null;
  }

  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {stream.slice(0, 4).map((item) => (
        <motion.div
          key={item.id}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-full border border-white/20 bg-black/55 px-2 py-1 text-xs"
        >
          {item.emoji} {item.from}
        </motion.div>
      ))}
    </div>
  );
}

function StatusBar({ text, onClear }) {
  return (
    <div className="mt-2 flex items-center justify-between rounded-xl border border-rose-300/45 bg-rose-300/12 px-2 py-1 text-xs">
      <span>{text}</span>
      <button type="button" onClick={onClear} className="pill-btn h-7 px-2 text-[11px]">clear</button>
    </div>
  );
}

function RosterSheet({ rankedPlayers, onClose }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] bg-black/60 p-3"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 30, opacity: 0 }}
        transition={{ type: "spring", stiffness: 120, damping: 14 }}
        onClick={(event) => event.stopPropagation()}
        className="glass mx-auto mt-16 max-w-xl rounded-3xl p-3"
      >
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-display text-2xl text-cyber">Roster + Scores</h3>
          <button type="button" onClick={onClose} className="pill-btn h-9 px-3 text-xs">close</button>
        </div>
        <div className="space-y-2">
          {rankedPlayers.map((player, idx) => (
            <motion.div
              key={player.userId}
              layout
              className={cn(
                "flex items-center justify-between rounded-xl border px-3 py-2",
                idx === 0 ? "border-plasma/65 bg-plasma/20" : "border-white/20 bg-white/8"
              )}
            >
              <div className="text-sm">#{idx + 1} {player.avatar} {player.username}</div>
              <div className="font-display text-xl">{player.score}</div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

function FloatingReactions({ reactions }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden">
      <AnimatePresence>
        {reactions.map((reaction) => (
          <motion.div
            key={reaction.id}
            initial={{ opacity: 0, y: 20, scale: 0.75 }}
            animate={{ opacity: 1, y: -150, x: reaction.drift * 45, scale: reaction.scale }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2.2, ease: "easeOut" }}
            style={{ left: `${reaction.x}%`, bottom: "20%" }}
            className="absolute rounded-xl bg-black/65 px-2 py-1 text-2xl shadow-card"
          >
            {reaction.emoji}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function ConfettiBurst({ keyId }) {
  const pieces = Array.from({ length: 14 }, (_, idx) => idx);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-8 overflow-visible">
      {pieces.map((piece) => (
        <motion.span
          key={`${keyId}_${piece}`}
          initial={{ y: -6, opacity: 0, x: 0 }}
          animate={{ y: 65 + piece * 2, opacity: [0, 1, 0], x: (piece % 2 ? -1 : 1) * (18 + piece * 2) }}
          transition={{ duration: 1.3 + piece * 0.04, ease: "easeOut" }}
          className="absolute left-1/2 top-0 h-2 w-2 rounded-sm bg-cyber"
        />
      ))}
    </div>
  );
}

export default RoomScreen;