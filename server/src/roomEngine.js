import { AVATAR_SET, CAPTION_DECK, MEME_POOL, REACTION_SET, ROOM_CONFIG } from "./gameData.js";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function shuffle(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function now() {
  return Date.now();
}

function safeName(input) {
  return (input || "meme gremlin").trim().slice(0, 24) || "meme gremlin";
}

function randomFrom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function makeRoomCode(existing) {
  let code = "";
  do {
    code = Array.from({ length: ROOM_CONFIG.minCodeLength }, () => randomFrom(CODE_CHARS)).join("");
  } while (existing.has(code));
  return code;
}

function makeUserId() {
  return `u_${Math.random().toString(36).slice(2, 10)}`;
}

function buildDeck() {
  return shuffle(CAPTION_DECK.map((text, idx) => ({ id: `c_${idx}`, text })));
}

function makeMemeSequence() {
  return shuffle(MEME_POOL);
}

function trimRoomCode(code) {
  return (code || "").toUpperCase().trim();
}

export class RoomEngine {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
    this.socketRoom = new Map();

    setInterval(() => this.tick(), 1000);
    setInterval(() => this.cleanupRooms(), ROOM_CONFIG.cleanupIntervalMs);
  }

  createRoom(socket, profile = {}) {
    const code = makeRoomCode(this.rooms);
    const room = {
      code,
      createdAt: now(),
      lastActiveAt: now(),
      hostUserId: null,
      phase: "lobby",
      round: 0,
      settings: {
        mode: "card",
        submissionSeconds: ROOM_CONFIG.submissionSeconds,
        votingSeconds: ROOM_CONFIG.votingSeconds,
        customCharLimit: ROOM_CONFIG.customCharLimit,
        maxPlayers: ROOM_CONFIG.maxPlayers
      },
      players: [],
      deck: buildDeck(),
      memeQueue: makeMemeSequence(),
      currentMeme: null,
      submissions: [],
      revealOrder: [],
      revealIndex: -1,
      votesByPlayer: {},
      winnerUserId: null,
      timers: {
        submissionEndsAt: null,
        votingEndsAt: null,
        nextRevealAt: null,
        scoreboardEndsAt: null
      }
    };

    const player = this.makeOrReconnectPlayer(room, socket, profile);
    room.hostUserId = player.userId;

    this.rooms.set(code, room);
    socket.join(code);
    this.socketRoom.set(socket.id, code);
    this.emitRoomState(room);

    return {
      roomCode: code,
      userId: player.userId
    };
  }

  joinRoom(socket, roomCode, profile = {}) {
    const code = trimRoomCode(roomCode);
    const room = this.rooms.get(code);
    if (!room) {
      throw new Error("Room not found.");
    }

    if (room.phase !== "lobby") {
      throw new Error("Game already started. Try rejoin if you were here before.");
    }

    const connectedPlayers = room.players.filter((player) => player.connected);
    if (connectedPlayers.length >= room.settings.maxPlayers) {
      throw new Error("Room is full.");
    }

    const player = this.makeOrReconnectPlayer(room, socket, profile);

    socket.join(code);
    this.socketRoom.set(socket.id, code);
    room.lastActiveAt = now();

    this.emitRoomState(room);
    return {
      roomCode: code,
      userId: player.userId
    };
  }

  rejoinRoom(socket, roomCode, userId) {
    const code = trimRoomCode(roomCode);
    const room = this.rooms.get(code);
    if (!room) {
      throw new Error("Room expired.");
    }

    const player = room.players.find((entry) => entry.userId === userId);
    if (!player) {
      throw new Error("Could not find your seat in this room.");
    }

    player.socketId = socket.id;
    player.connected = true;
    player.lastSeenAt = now();

    socket.join(code);
    this.socketRoom.set(socket.id, code);
    room.lastActiveAt = now();

    this.emitRoomState(room);
    return {
      roomCode: code,
      userId: player.userId
    };
  }

  updateReady(socket, ready) {
    const { room, player } = this.requirePlayer(socket.id);
    if (room.phase !== "lobby") {
      throw new Error("Ready toggle only works in lobby.");
    }

    player.ready = Boolean(ready);
    room.lastActiveAt = now();
    this.emitRoomState(room);
  }

  updateSettings(socket, patch = {}) {
    const { room, player } = this.requirePlayer(socket.id);
    if (room.phase !== "lobby") {
      throw new Error("Settings can only be changed in lobby.");
    }

    if (player.userId !== room.hostUserId) {
      throw new Error("Only the host can update settings.");
    }

    if (typeof patch.mode === "string" && ["card", "custom"].includes(patch.mode)) {
      room.settings.mode = patch.mode;
    }

    if (typeof patch.submissionSeconds === "number") {
      room.settings.submissionSeconds = Math.min(90, Math.max(15, Math.floor(patch.submissionSeconds)));
    }

    if (typeof patch.votingSeconds === "number") {
      room.settings.votingSeconds = Math.min(60, Math.max(10, Math.floor(patch.votingSeconds)));
    }

    if (typeof patch.customCharLimit === "number") {
      room.settings.customCharLimit = Math.min(220, Math.max(40, Math.floor(patch.customCharLimit)));
    }

    this.emitRoomState(room);
  }

  startGame(socket) {
    const { room, player } = this.requirePlayer(socket.id);

    if (player.userId !== room.hostUserId) {
      throw new Error("Only host can start.");
    }

    const activePlayers = room.players.filter((entry) => entry.connected);
    if (activePlayers.length < ROOM_CONFIG.minPlayers) {
      throw new Error(`Need at least ${ROOM_CONFIG.minPlayers} players.`);
    }

    room.players.forEach((entry) => {
      entry.score = 0;
      entry.ready = false;
      if (room.settings.mode === "card") {
        this.fillHand(room, entry);
      } else {
        entry.hand = [];
      }
    });

    room.round = 0;
    this.startRound(room);
  }

  submitCaption(socket, payload = {}) {
    const { room, player } = this.requirePlayer(socket.id);

    if (room.phase !== "submission") {
      throw new Error("Submission window is closed.");
    }

    if (room.submissions.some((item) => item.playerUserId === player.userId)) {
      throw new Error("You already submitted this round.");
    }

    let text = "";
    if (room.settings.mode === "card") {
      const { cardId } = payload;
      const card = player.hand.find((entry) => entry.id === cardId);
      if (!card) {
        throw new Error("Card not found in your hand.");
      }
      text = card.text;
      player.hand = player.hand.filter((entry) => entry.id !== cardId);
      this.fillHand(room, player);
    } else {
      text = `${payload.text || ""}`.trim();
      if (!text) {
        throw new Error("Write a caption before submitting.");
      }
      if (text.length > room.settings.customCharLimit) {
        throw new Error(`Caption too long (${room.settings.customCharLimit} max).`);
      }
    }

    room.submissions.push({
      id: `s_${Math.random().toString(36).slice(2, 10)}`,
      playerUserId: player.userId,
      text,
      votes: 0
    });

    room.lastActiveAt = now();

    const activePlayers = room.players.filter((entry) => entry.connected);
    if (room.submissions.length >= activePlayers.length) {
      this.startReveal(room);
      return;
    }

    this.emitRoomState(room);
  }

  castVote(socket, submissionId) {
    const { room, player } = this.requirePlayer(socket.id);

    if (room.phase !== "voting") {
      throw new Error("Voting is not active.");
    }

    const submission = room.submissions.find((item) => item.id === submissionId);
    if (!submission) {
      throw new Error("That caption does not exist.");
    }

    if (submission.playerUserId === player.userId) {
      throw new Error("You cannot vote for yourself.");
    }

    room.votesByPlayer[player.userId] = submissionId;
    room.lastActiveAt = now();

    const voters = room.players.filter((entry) => entry.connected);
    const neededVotes = Math.max(voters.length - 1, 1);

    if (Object.keys(room.votesByPlayer).length >= neededVotes) {
      this.finishVoting(room);
      return;
    }

    this.emitRoomState(room);
  }

  sendReaction(socket, emoji) {
    const { room, player } = this.requirePlayer(socket.id);
    const reaction = REACTION_SET.includes(emoji) ? emoji : randomFrom(REACTION_SET);
    room.lastActiveAt = now();

    this.io.to(room.code).emit("reaction_burst", {
      id: `r_${Math.random().toString(36).slice(2, 9)}`,
      emoji: reaction,
      from: player.username,
      userId: player.userId,
      at: now()
    });
  }

  advanceRound(socket) {
    const { room, player } = this.requirePlayer(socket.id);
    if (player.userId !== room.hostUserId) {
      throw new Error("Only host can skip forward.");
    }

    if (room.phase !== "scoreboard") {
      throw new Error("Next round is only available on scoreboard.");
    }

    this.startRound(room);
  }

  handleDisconnect(socketId) {
    const roomCode = this.socketRoom.get(socketId);
    if (!roomCode) {
      return;
    }

    const room = this.rooms.get(roomCode);
    this.socketRoom.delete(socketId);

    if (!room) {
      return;
    }

    const player = room.players.find((entry) => entry.socketId === socketId);
    if (!player) {
      return;
    }

    player.connected = false;
    player.lastSeenAt = now();

    const connected = room.players.filter((entry) => entry.connected);
    if (!connected.length) {
      room.lastActiveAt = now();
    }

    if (player.userId === room.hostUserId) {
      const nextHost = connected[0];
      if (nextHost) {
        room.hostUserId = nextHost.userId;
      }
    }

    this.emitRoomState(room);
  }

  fillHand(room, player, handSize = 7) {
    while (player.hand.length < handSize) {
      if (!room.deck.length) {
        room.deck = buildDeck();
      }
      const card = room.deck.pop();
      if (!card) {
        break;
      }
      player.hand.push(card);
    }
  }

  makeOrReconnectPlayer(room, socket, profile) {
    const providedId = profile.userId || "";
    const existing = providedId
      ? room.players.find((entry) => entry.userId === providedId)
      : null;

    if (existing) {
      if (existing.connected) {
        throw new Error("That profile is already in the room.");
      }
      existing.socketId = socket.id;
      existing.connected = true;
      existing.username = safeName(profile.username || existing.username);
      existing.avatar = profile.avatar || existing.avatar;
      existing.lastSeenAt = now();
      return existing;
    }

    const userId = profile.userId || makeUserId();

    if (room.players.some((entry) => entry.userId === userId)) {
      throw new Error("Duplicate user profile detected.");
    }

    const player = {
      userId,
      socketId: socket.id,
      username: safeName(profile.username),
      avatar: profile.avatar || randomFrom(AVATAR_SET),
      score: 0,
      ready: false,
      connected: true,
      hand: [],
      lastSeenAt: now()
    };

    room.players.push(player);
    return player;
  }

  requirePlayer(socketId) {
    const roomCode = this.socketRoom.get(socketId);
    if (!roomCode) {
      throw new Error("Not currently in a room.");
    }

    const room = this.rooms.get(roomCode);
    if (!room) {
      throw new Error("Room no longer exists.");
    }

    const player = room.players.find((entry) => entry.socketId === socketId);
    if (!player) {
      throw new Error("Player not found in room.");
    }

    return { room, player };
  }

  startRound(room) {
    room.round += 1;

    if (!room.memeQueue.length) {
      room.memeQueue = makeMemeSequence();
    }
    room.currentMeme = room.memeQueue.pop();

    room.phase = "submission";
    room.submissions = [];
    room.revealOrder = [];
    room.revealIndex = -1;
    room.votesByPlayer = {};
    room.winnerUserId = null;

    room.timers.submissionEndsAt = now() + room.settings.submissionSeconds * 1000;
    room.timers.votingEndsAt = null;
    room.timers.nextRevealAt = null;
    room.timers.scoreboardEndsAt = null;

    room.lastActiveAt = now();
    this.emitRoomState(room);
  }

  startReveal(room) {
    if (room.phase !== "submission") {
      return;
    }

    room.phase = "reveal";
    room.revealOrder = shuffle(room.submissions.map((entry) => entry.id));
    room.revealIndex = -1;
    room.timers.submissionEndsAt = null;
    room.timers.nextRevealAt = now() + 800;

    this.emitRoomState(room);
  }

  revealNext(room) {
    room.revealIndex += 1;
    if (room.revealIndex >= room.revealOrder.length) {
      room.phase = "voting";
      room.timers.nextRevealAt = null;
      room.timers.votingEndsAt = now() + room.settings.votingSeconds * 1000;
      this.emitRoomState(room);
      return;
    }

    room.timers.nextRevealAt = now() + ROOM_CONFIG.revealIntervalMs;
    this.emitRoomState(room);
  }

  finishVoting(room) {
    room.submissions.forEach((entry) => {
      entry.votes = 0;
    });

    for (const submissionId of Object.values(room.votesByPlayer)) {
      const target = room.submissions.find((entry) => entry.id === submissionId);
      if (target) {
        target.votes += 1;
      }
    }

    const ranked = [...room.submissions].sort((a, b) => b.votes - a.votes);
    const winner = ranked[0] || null;
    if (winner) {
      const winnerPlayer = room.players.find((entry) => entry.userId === winner.playerUserId);
      if (winnerPlayer) {
        winnerPlayer.score += Math.max(1, winner.votes) + 1;
      }
      room.winnerUserId = winner.playerUserId;
    } else {
      room.winnerUserId = null;
    }

    room.phase = "scoreboard";
    room.timers.votingEndsAt = null;
    room.timers.scoreboardEndsAt = now() + ROOM_CONFIG.scoreboardSeconds * 1000;

    this.emitRoomState(room);
  }

  tick() {
    const current = now();

    for (const room of this.rooms.values()) {
      if (room.phase === "submission" && room.timers.submissionEndsAt && current >= room.timers.submissionEndsAt) {
        this.startReveal(room);
        continue;
      }

      if (room.phase === "reveal" && room.timers.nextRevealAt && current >= room.timers.nextRevealAt) {
        this.revealNext(room);
        continue;
      }

      if (room.phase === "voting" && room.timers.votingEndsAt && current >= room.timers.votingEndsAt) {
        this.finishVoting(room);
        continue;
      }

      if (room.phase === "scoreboard" && room.timers.scoreboardEndsAt && current >= room.timers.scoreboardEndsAt) {
        this.startRound(room);
      }
    }
  }

  cleanupRooms() {
    const current = now();

    for (const [code, room] of this.rooms.entries()) {
      room.players = room.players.filter(
        (entry) => entry.connected || current - entry.lastSeenAt < ROOM_CONFIG.reconnectGraceMs
      );

      if (!room.players.length || current - room.lastActiveAt > ROOM_CONFIG.inactiveRoomMs) {
        this.rooms.delete(code);
        continue;
      }

      if (!room.players.some((entry) => entry.userId === room.hostUserId)) {
        const nextHost = room.players.find((entry) => entry.connected) || room.players[0];
        room.hostUserId = nextHost ? nextHost.userId : null;
      }
    }
  }

  publicState(room, viewerUserId) {
    const viewer = room.players.find((entry) => entry.userId === viewerUserId);
    const visibleSet = new Set(room.revealOrder.slice(0, room.revealIndex + 1));

    return {
      code: room.code,
      phase: room.phase,
      round: room.round,
      hostUserId: room.hostUserId,
      settings: room.settings,
      currentMeme: room.currentMeme,
      timers: room.timers,
      players: room.players.map((entry) => ({
        userId: entry.userId,
        username: entry.username,
        avatar: entry.avatar,
        ready: entry.ready,
        score: entry.score,
        connected: entry.connected,
        submitted: room.submissions.some((sub) => sub.playerUserId === entry.userId),
        isHost: entry.userId === room.hostUserId
      })),
      myHand: viewer ? viewer.hand : [],
      submissions:
        room.phase === "submission"
          ? []
          : room.submissions
              .filter((entry) => room.phase !== "reveal" || visibleSet.has(entry.id))
              .map((entry) => ({
                id: entry.id,
                text: entry.text,
                votes: room.phase === "scoreboard" ? entry.votes : undefined,
                isMine: entry.playerUserId === viewerUserId,
                playerUserId: room.phase === "scoreboard" ? entry.playerUserId : undefined
              })),
      revealOrder: room.revealOrder,
      revealIndex: room.revealIndex,
      votesByPlayer: room.votesByPlayer,
      winnerUserId: room.winnerUserId,
      reactionSet: REACTION_SET
    };
  }

  emitRoomState(room) {
    room.lastActiveAt = now();

    room.players.forEach((player) => {
      if (!player.connected) {
        return;
      }
      const payload = this.publicState(room, player.userId);
      this.io.to(player.socketId).emit("room_state", payload);
    });
  }
}