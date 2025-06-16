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

  socket.on("getCode", () => {
    socket.emit("code", roomCode);
  });

  socket.on("adminJoin", () => {
    socket.join("mainRoom");
    console.log("👑 관리자 mainRoom에 조인:", socket.id);
    // ✅ 관리자에게 현재 목록 바로 전송
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
    io.to("mainRoom").emit("gameStarted");
  });

    socket.on("disconnect", () => {
    if (players[socket.id]) {
      const nickname = players[socket.id].nickname;
      console.log("🕒 퇴장 대기 시작:", nickname);

      // 10초 대기 후 여전히 미접속 시 진짜 퇴장 처리
      setTimeout(() => {
        if (players[socket.id]) {
          console.log("🔴 최종 퇴장:", nickname);
          delete players[socket.id];
          io.to("mainRoom").emit("playerList", getTeamPlayers());
        } else {
          console.log("✅ 재접속 감지, 퇴장 취소:", nickname);
        }
      }, 10000); // 10초 후 확인
    }
  });


  // ✅ 관리자 요청 시 직접 목록 보내기
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
const path = require("path");

// 정적 폴더 설정
app.use("/data", express.static(path.join(__dirname, "data")));

const fs = require("fs");
let questions = [];
try {
  const rawData = fs.readFileSync("data/catch_questions.json", "utf-8");
  questions = JSON.parse(rawData);
  console.log("✅ 문제 로딩 완료:", questions.length, "개");
} catch (e) {
  console.error("❌ 문제 로딩 실패:", e);
}
socket.on("startGame", () => {
  // 게임 시작 신호
  io.to("mainRoom").emit("gameStarted");

  // 출제자 찾기
  const hostSocketId = Object.keys(players).find(id => players[id].role === "host");
  if (hostSocketId && questions.length > 0) {
    const question = questions[Math.floor(Math.random() * questions.length)];
    io.to(hostSocketId).emit("sendQuestion", question);
    console.log("🎯 출제자에게 문제 전송됨:", question.text);
  } else {
    console.warn("❌ 출제자 없음 또는 문제 없음");
  }
});

