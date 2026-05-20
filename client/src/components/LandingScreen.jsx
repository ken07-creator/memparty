import { motion } from "framer-motion";
import { AVATARS, LANDING_STICKERS } from "../lib/constants";

function randomAvatar() {
  return AVATARS[Math.floor(Math.random() * AVATARS.length)];
}

function LandingScreen({ connected, profile, setProfile, roomCodeInput, setRoomCodeInput, createRoom, joinRoom, status }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-4 pb-10 pt-8">
      <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-ink/70 p-4 shadow-card backdrop-blur-xl">
        {LANDING_STICKERS.map((emoji, idx) => (
          <motion.div
            key={`${emoji}_${idx}`}
            className="pointer-events-none absolute text-xl"
            style={{
              left: `${5 + ((idx * 8) % 88)}%`,
              top: `${4 + ((idx * 11) % 84)}%`
            }}
            animate={{ y: [0, -9, 0], rotate: [0, idx % 2 ? -8 : 8, 0] }}
            transition={{ duration: 2.8 + (idx % 3), repeat: Infinity, ease: "easeInOut" }}
          >
            {emoji}
          </motion.div>
        ))}

        <motion.h1
          className="relative z-10 text-center font-display text-5xl uppercase text-plasma sm:text-6xl"
          animate={{ textShadow: ["0 0 9px #f238ff", "0 0 28px #f238ff", "0 0 9px #f238ff"] }}
          transition={{ duration: 2.3, repeat: Infinity }}
        >
          MemParty
        </motion.h1>

        <p className="relative z-10 mt-2 rotate-[-1deg] rounded-xl bg-black/35 px-3 py-2 text-center text-sm text-cyber">
          discord-call meme chaos. no dignity required.
        </p>

        <section className="relative z-10 mt-4 space-y-3">
          <label className="block text-xs font-semibold uppercase tracking-[0.22em] text-white/80">Identity</label>
          <div className="flex items-center gap-3">
            <motion.button
              whileTap={{ scale: 0.94 }}
              whileHover={{ rotate: -3 }}
              type="button"
              onClick={() => setProfile((prev) => ({ ...prev, avatar: randomAvatar() }))}
              className="avatar-pulse relative h-16 w-16 rounded-2xl border border-white/30 bg-white/10 text-3xl"
            >
              {profile.avatar}
            </motion.button>
            <input
              value={profile.username}
              onChange={(event) => setProfile((prev) => ({ ...prev, username: event.target.value }))}
              placeholder="drop your cursed username"
              maxLength={24}
              className="h-14 w-full rounded-2xl border border-white/25 bg-black/35 px-4 text-base outline-none transition focus:ring-2 focus:ring-plasma/60"
            />
          </div>

          <motion.button
            whileTap={{ scale: 0.96 }}
            whileHover={{ scale: 1.01 }}
            onClick={createRoom}
            className="cta-violent h-14 w-full rounded-2xl bg-plasma px-4 font-display text-2xl text-black shadow-glowPink"
          >
            Create Room
          </motion.button>

          <div className="rounded-2xl border border-white/20 bg-black/30 p-3">
            <div className="mb-2 text-xs uppercase tracking-[0.2em] text-white/60">Join room code</div>
            <input
              value={roomCodeInput}
              onChange={(event) => setRoomCodeInput(event.target.value.toUpperCase())}
              maxLength={8}
              placeholder="ABCDE"
              className="h-14 w-full rounded-xl border border-white/25 bg-black/45 px-4 text-center text-xl tracking-[0.3em] outline-none focus:ring-2 focus:ring-cyber/50"
            />
            <motion.button
              whileTap={{ scale: 0.96 }}
              whileHover={{ scale: 1.01 }}
              onClick={joinRoom}
              className="mt-2 h-12 w-full rounded-xl bg-cyber font-display text-xl text-black shadow-glowLime"
            >
              Join Chaos
            </motion.button>
          </div>
        </section>

        <footer className="relative z-10 mt-4 flex items-center justify-between text-[11px] uppercase tracking-[0.15em] text-white/65">
          <span>{connected ? "server online" : "reconnecting..."}</span>
          <span>4-10 players</span>
        </footer>
        {status ? <p className="relative z-10 mt-2 text-sm text-rose-300">{status}</p> : null}
      </div>
    </main>
  );
}

export default LandingScreen;