// 캐치마인드 서버 - catch_server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());

let roomCode = generateCode();
let players = {}; // { socket.id: { nickname, team } }

function generateCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

io.on("connection", (socket) => {
  console.log("🟢 연결됨:", socket.id);

  // 입장 코드 요청
  socket.on("getCode", () => {
    socket.emit("code", roomCode);
  });

  // 입장 시도
  socket.on("join", ({ nickname, code, team }) => {
    if (code !== roomCode) {
      socket.emit("joinError", "코드가 올바르지 않습니다.");
      return;
    }
    players[socket.id] = { nickname, team };
    socket.join("mainRoom");
    console.log(`✅ ${nickname} (${team}조) 입장`);
    io.to("mainRoom").emit("playerList", getTeamPlayers());
  });

  // 게임 시작 요청 (관리자)
  socket.on("startGame", () => {
    io.to("mainRoom").emit("gameStarted");
  });

  // 연결 종료 시
  socket.on("disconnect", () => {
    if (players[socket.id]) {
      console.log("🔴 퇴장:", players[socket.id].nickname);
      delete players[socket.id];
      io.to("mainRoom").emit("playerList", getTeamPlayers());
    }
  });
});

function getTeamPlayers() {
  const teamData = { "1": [], "2": [], "3": [], "4": [] };
  Object.values(players).forEach(({ nickname, team }) => {
    if (teamData[team]) {
      teamData[team].push(nickname);
    }
  });
  return teamData;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 캐치마인드 서버 실행 중: http://localhost:${PORT}`);
});
