// 캐치마인드 서버 - catch_server.js
// 전역에 추가 (다른 let 변수들과 같이 위에)
let gameStarted = false; // 🔥 게임이 시작되었는지 상태 저장용
let startAt; // ✅ 모든 클라이언트와 공유할 정확한 시작 시간

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
function countJoinedPlayers() {
  return Object.keys(players).length;
}
io.on("connection", (socket) => {
  console.log("🟢 연결됨:", socket.id);

 socket.on("requestStartStatus", () => {
    console.log("📥 requestStartStatus 수신 from", socket.id, "| gameStarted:", gameStarted);
    if (gameStarted) {
      socket.emit("gameStarted");
      console.log("📤 gameStarted 재송신 to", socket.id);
    }
  });
  socket.onAny((eventName, ...args) => {
    console.log("📥 받은 이벤트:", eventName);
  });
  
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
  if (code !== roomCode) {
    socket.emit("joinError", "코드가 올바르지 않습니다.");
    return;
  }

  const fullTeam = team.includes("조") ? team : `${team}조`;

  for (let id in players) {
    if (players[id].nickname === nickname && players[id].team === fullTeam) {
      delete players[id];
      break;
    }
  }

  players[socket.id] = { nickname, team: fullTeam, role };
  console.log("✅ join 등록됨:", socket.id, players[socket.id]);
  console.log("🧾 전체 players 목록:", players);

  socket.join("mainRoom");
  io.to("mainRoom").emit("playerList", getTeamPlayers());

  socket.emit("joinSuccess");

  // ✅ 게임이 이미 시작되었으면, 새로 join한 사람에게도 알려줌
  if (gameStarted) {
    socket.emit("gameStarted");
    console.log("📤 [join 직후] gameStarted 바로 전송 to", socket.id);
  }
});

socket.on("startGame", () => {
  if (countJoinedPlayers() < 2) {
    console.log("⏸ 플레이어 수 부족. gameStarted emit 보류");
    return;
  }

  gameStarted = true;
  startAt = Date.now() + 3000; // ✅ 전역 변수에 저장

  io.to("mainRoom").emit("gameStarted", { startAt });
  console.log("📤 gameStarted broadcast emit, 시작시간:", new Date(startAt).toLocaleTimeString());

  setTimeout(() => {
    const hostSocketId = Object.keys(players).find(id => players[id].role === "host");
    if (hostSocketId && questions.length > 0) {
      const question = questions[Math.floor(Math.random() * questions.length)];
      io.to(hostSocketId).emit("sendQuestion", question);
      console.log("🎯 출제자에게 문제 전송됨:", question.text);
    } else {
      console.warn("❌ 출제자 없음 또는 문제 없음");
    }
  }, startAt - Date.now()); // 정확한 시각에 문제 출제
});



socket.on("requestStartStatus", () => {
  if (gameStarted && typeof startAt !== "undefined") {
    console.log("📤 재요청에 의해 gameStarted 다시 전송 with startAt");
    socket.emit("gameStarted", { startAt });
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
