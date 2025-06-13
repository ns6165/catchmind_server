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
app.get("/", (req, res) => {
  res.send("Catch Mind Server is Running!");
});

let roomCode = generateCode();
let players = {}; // { socket.id: { nickname, team } }

function generateCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

io.on("connection", (socket) => {
  console.log("🟢 연결됨:", socket.id);
socket.on("verifyCode", (code) => {
  const isValid = code === roomCode;
  socket.emit("codeResult", isValid);
});

  // 입장 코드 요청
  socket.on("getCode", () => {
    socket.emit("code", roomCode);
  });

socket.on("join", ({ nickname, code, team }) => {
  console.log("📥 join 요청:", nickname, code, team);

  if (code !== roomCode) {
    socket.emit("joinError", "코드가 올바르지 않습니다.");
    return;
  }

  let fullTeam = team;
  if (!team.includes("조")) {
    fullTeam = `${team}조`;
  }

  players[socket.id] = { nickname, team: fullTeam };
  socket.join("mainRoom");

  console.log("📤 playerList emit:", getTeamPlayers());
  io.to("mainRoom").emit("playerList", getTeamPlayers());

  // ✅ join 완료된 사용자에게만 성공 알림
  socket.emit("joinSuccess");
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
  const teamData = {
    "1조": [], "2조": [], "3조": [],
    "4조": [], "5조": [], "6조": []
  };
  Object.values(players).forEach(({ nickname, team }) => {
    if (teamData[team]) {
      teamData[team].push(nickname);
    }
  });
  return teamData;
}
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 캐치마인드 서버 실행 중! 포트: ${PORT}`);
});
const path = require("path");

// 정적 폴더 설정
app.use("/data", express.static(path.join(__dirname, "data")));

