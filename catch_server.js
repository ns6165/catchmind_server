// 캐치마인드 서버 - catch_server.js
// 전역에 추가 (다른 let 변수들과 같이 위에)
let gameStarted = false; // 🔥 게임이 시작되었는지 상태 저장용

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
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
let players = {}; // { socket.id: { nickname, team, role } }

let questions = [];
try {
  const rawData = fs.readFileSync("data/catch_questions.json", "utf-8");
  questions = JSON.parse(rawData);
  console.log("✅ 문제 로딩 완료:", questions.length, "개");
} catch (e) {
  console.error("❌ 문제 로딩 실패:", e);
}

app.use("/data", express.static(path.join(__dirname, "data")));

function generateCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

io.on("connection", (socket) => {
  console.log("🟢 연결됨:", socket.id);

  socket.on("verifyCode", (code) => {
    const isValid = code === roomCode;
    socket.emit("codeResult", isValid);
  });

  socket.on("getCode", () => {
    socket.emit("code", roomCode);
  });

  socket.on("adminJoin", () => {
    socket.join("mainRoom");
    console.log("👑 관리자 mainRoom에 조인:", socket.id);
    socket.emit("playerList", getTeamPlayers());
  });

  socket.on("join", ({ nickname, code, team, role }) => {
    console.log("📥 join 요청:", nickname, code, team, role);

    if (code !== roomCode) {
      socket.emit("joinError", "코드가 올바르지 않습니다.");
      return;
    }

    let fullTeam = team;
    if (!team.includes("조")) fullTeam = `${team}조`;

    players[socket.id] = { nickname, team: fullTeam, role };
    socket.join("mainRoom");

    console.log("📤 playerList emit:", getTeamPlayers());
    io.to("mainRoom").emit("playerList", getTeamPlayers());
    socket.emit("joinSuccess");
  });

 socket.on("startGame", () => {
  gameStarted = true; // ✅ 게임 시작 상태 저장
  setTimeout(() => {
  io.to("mainRoom").emit("gameStarted");
  console.log("📤 gameStarted emit");

  const hostSocketId = Object.keys(players).find(id => players[id].role === "host");
  if (hostSocketId && questions.length > 0) {
    const question = questions[Math.floor(Math.random() * questions.length)];
    io.to(hostSocketId).emit("sendQuestion", question);
    console.log("🎯 출제자에게 문제 전송됨:", question.text);
  } else {
    console.warn("❌ 출제자 없음 또는 문제 없음");
  }
  }, 1000); // ⏱ 1초 기다려서 클라이언트가 연결될 시간 줌
});
socket.on("requestStartStatus", () => {
  if (gameStarted) {
    console.log("📤 재요청에 의해 gameStarted 다시 전송");
    socket.emit("gameStarted");
  }
});

socket.on("disconnect", () => {
  /*
  if (players[socket.id]) {
    const nickname = players[socket.id].nickname;
    console.log("🕒 퇴장 대기 시작:", nickname);

    setTimeout(() => {
      if (players[socket.id]) {
        console.log("🔴 최종 퇴장:", nickname);
        delete players[socket.id];
        io.to("mainRoom").emit("playerList", getTeamPlayers());
      } else {
        console.log("✅ 재접속 감지, 퇴장 취소:", nickname);
      }
    }, 10000);
  }
  */
});

  socket.on("requestPlayerList", () => {
    socket.emit("playerList", getTeamPlayers());
  });
});

function getTeamPlayers() {
  const teamData = {
    "1조": [], "2조": [], "3조": [],
    "4조": [], "5조": [], "6조": []
  };
  Object.values(players).forEach(({ nickname, team, role }) => {
    if (teamData[team]) {
      const roleLabel = role === "host" ? "출제자" : "참가자";
      teamData[team].push(`${nickname} (${roleLabel})`);
    }
  });
  return teamData;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 캐치마인드 서버 실행 중! 포트: ${PORT}`);
});
