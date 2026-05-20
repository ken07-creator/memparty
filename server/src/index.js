import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { RoomEngine } from "./roomEngine.js";

const PORT = Number(process.env.PORT || 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, at: new Date().toISOString() });
});

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    credentials: true
  }
});

const engine = new RoomEngine(io);

io.on("connection", (socket) => {
  socket.on("create_room", (payload = {}, ack = () => {}) => {
    try {
      const result = engine.createRoom(socket, payload.profile || {});
      ack({ ok: true, ...result });
    } catch (error) {
      ack({ ok: false, message: error.message || "Could not create room." });
    }
  });

  socket.on("join_room", (payload = {}, ack = () => {}) => {
    try {
      const result = engine.joinRoom(socket, payload.roomCode, payload.profile || {});
      ack({ ok: true, ...result });
    } catch (error) {
      ack({ ok: false, message: error.message || "Could not join room." });
    }
  });

  socket.on("rejoin_room", (payload = {}, ack = () => {}) => {
    try {
      const result = engine.rejoinRoom(socket, payload.roomCode, payload.userId);
      ack({ ok: true, ...result });
    } catch (error) {
      ack({ ok: false, message: error.message || "Could not rejoin room." });
    }
  });

  socket.on("set_ready", (payload = {}, ack = () => {}) => {
    try {
      engine.updateReady(socket, payload.ready);
      ack({ ok: true });
    } catch (error) {
      ack({ ok: false, message: error.message || "Could not update ready state." });
    }
  });

  socket.on("update_settings", (payload = {}, ack = () => {}) => {
    try {
      engine.updateSettings(socket, payload);
      ack({ ok: true });
    } catch (error) {
      ack({ ok: false, message: error.message || "Could not update settings." });
    }
  });

  socket.on("start_game", (_payload = {}, ack = () => {}) => {
    try {
      engine.startGame(socket);
      ack({ ok: true });
    } catch (error) {
      ack({ ok: false, message: error.message || "Could not start game." });
    }
  });

  socket.on("submit_caption", (payload = {}, ack = () => {}) => {
    try {
      engine.submitCaption(socket, payload);
      ack({ ok: true });
    } catch (error) {
      ack({ ok: false, message: error.message || "Could not submit caption." });
    }
  });

  socket.on("cast_vote", (payload = {}, ack = () => {}) => {
    try {
      engine.castVote(socket, payload.submissionId);
      ack({ ok: true });
    } catch (error) {
      ack({ ok: false, message: error.message || "Could not vote." });
    }
  });

  socket.on("set_typing", (payload = {}, ack = () => {}) => {
    try {
      engine.updateTyping(socket, payload.typing);
      ack({ ok: true });
    } catch (error) {
      ack({ ok: false, message: error.message || "Could not update typing state." });
    }
  });

  socket.on("next_round", (_payload = {}, ack = () => {}) => {
    try {
      engine.advanceRound(socket);
      ack({ ok: true });
    } catch (error) {
      ack({ ok: false, message: error.message || "Could not advance round." });
    }
  });

  socket.on("send_reaction", (payload = {}, ack = () => {}) => {
    try {
      engine.sendReaction(socket, payload.emoji);
      ack({ ok: true });
    } catch (error) {
      ack({ ok: false, message: error.message || "Could not send reaction." });
    }
  });

  socket.on("disconnect", () => {
    engine.handleDisconnect(socket.id);
  });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`memparty server up on :${PORT}`);
});
