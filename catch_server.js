// 캐치마인드 서버 - catch_server.js
// 전역에 추가 (다른 let 변수들과 같이 위에)
let gameStarted = false; // 🔥 게임이 시작되었는지 상태 저장용
let startAt; // ✅ 모든 클라이언트와 공유할 정확한 시작 시간
let scores = {
  "1조": {}, "2조": {}, "3조": {},
  "4조": {}, "5조": {}, "6조": {}
};
// 구조: scores["1조"]["닉네임"] = 점수
// 🔥 팀별 정답 저장용
let currentAnswers = {
  "1조": "", "2조": "", "3조": "",
  "4조": "", "5조": "", "6조": ""
};
let usedQuestions = []; // 🔥 이미 출제된 문제 목록


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

  // 1. 시작 상태 요청
  socket.on("requestStartStatus", () => {
    console.log("📥 requestStartStatus 수신 from", socket.id, "| gameStarted:", gameStarted);
    if (gameStarted && typeof startAt !== "undefined") {
      socket.emit("gameStarted", { startAt });
      console.log("📤 gameStarted 재송신 with startAt to", socket.id);
    }
  });

// 2. 정답 제출
socket.on("submitAnswer", (submittedAnswer) => {
  const player = players[socket.id];
  if (!player) return;
  const { nickname, team } = player;

  // ✅ 제한시간 끝났거나 게임 종료 상태면 무시
  if (!gameStarted || !currentAnswers[team]) {
    console.log(`⛔ ${team} - 게임 종료 상태에서 정답 제출 무시됨`);
    return;
  }

  const correctAnswer = currentAnswers[team];
  const alreadyCorrect = Object.values(scores[team] || {}).some(v => v > 0);

  if (alreadyCorrect) {
    console.log(`⏹ ${team} 이미 정답자 있음. ${nickname} 무시`);
    return;
  }

  const isCorrect = submittedAnswer === correctAnswer;

  if (!(team in scores)) scores[team] = {};
  if (!(nickname in scores[team])) scores[team][nickname] = 0;

if (isCorrect) {
  scores[team][nickname]++;
  console.log(`✅ ${team} 최초 정답자: ${nickname}`);

  io.to(team).emit("answerResult", {
    isCorrect: true,
    nickname
  });

   // 3. 입장 코드 확인
  socket.on("verifyCode", (code) => {
    const isValid = code === roomCode;
    socket.emit("codeResult", isValid);
  });

  // 4. 입장 코드 요청
  socket.on("getCode", () => {
    socket.emit("code", roomCode);
  });

  // 5. 관리자 입장
  socket.on("adminJoin", () => {
    socket.join("mainRoom");
    console.log("👑 관리자 mainRoom에 조인:", socket.id);
    socket.emit("playerList", getTeamPlayers());
  });

  // 6. 참가자 입장
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

  // ✅ 두 개 방에 입장
  socket.join("mainRoom");
  socket.join(fullTeam); // ← 이 줄 꼭 필요

  io.to("mainRoom").emit("playerList", getTeamPlayers());
  socket.emit("joinSuccess");

  if (gameStarted && typeof startAt !== "undefined") {
    socket.emit("gameStarted", { startAt });
    console.log("📤 [join 직후] gameStarted 전송 to", socket.id);
  }
});


  // 7. 게임 시작
  socket.on("startGame", () => {
    if (countJoinedPlayers() < 2) {
      console.log("⏸ 플레이어 수 부족. gameStarted emit 보류");
      return;
    }

    gameStarted = true;
    startAt = Date.now() + 3000;
    io.to("mainRoom").emit("gameStarted", { startAt });
    console.log("📤 gameStarted broadcast emit, 시작시간:", new Date(startAt).toLocaleTimeString());

    setTimeout(() => {
      const groupedHosts = {};
      for (let [id, { team, role }] of Object.entries(players)) {
        if (role === "host") {
          groupedHosts[team] = id;
        }
      }

      if (questions.length === 0) {
        console.warn("❌ 문제 없음");
        return;
      }

      const question = questions[Math.floor(Math.random() * questions.length)];

     Object.entries(groupedHosts).forEach(([team, socketId]) => {
  io.to(socketId).emit("sendQuestion", question);
  currentAnswers[team] = question.answer;  // ✅ 팀별 정답 저장
  console.log(`🎯 ${team} 출제자에게 문제 전송됨:`, question.text);
});

    }, startAt - Date.now());
  });
// ✅ 출제자가 그린 그림 좌표를 참가자에게 전송
  socket.on("draw", ({ x, y }) => {
  const player = players[socket.id];
  if (!player) return;

  const teamRoom = player.team;
  socket.to(teamRoom).emit("draw", { x, y });
});


  // 8. 연결 해제 처리
  socket.on("disconnect", () => {
    // 생략 또는 재접속 구현 시 사용
  });

  // 9. 참가자 목록 요청
  socket.on("requestPlayerList", () => {
    socket.emit("playerList", getTeamPlayers());
  });

  // 10. 디버깅용
  socket.onAny((eventName, ...args) => {
    console.log("📥 받은 이벤트:", eventName);
  });
  // 11. 게임 종료 요청 처리
socket.on("gameTimeOver", () => {
  const player = players[socket.id];
  if (!player) return;

  const team = player.team;
  console.log(`⏰ ${team}의 ${player.nickname} 게임 종료 요청 수신`);

  // 한 명만 결과 전송하도록 출제자에게만 전송
  if (player.role === "host") {
    sendFinalResults(team);
  }
});
// ✅ 13. 출제자가 팀원에게 문제를 브로드캐스트
socket.on("broadcastQuestion", (question) => {
  const player = players[socket.id];
  if (!player) return;

  io.to(player.team).emit("sendQuestion", question);
  console.log(`📢 ${player.team} 팀 전체에 문제 전송됨:`, question.text);
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

  function sendFinalResults(team) {
  if (!scores[team]) return;

  const result = Object.entries(scores[team])
    .sort(([, a], [, b]) => b - a)
    .map(([nickname, score]) => ({ nickname, score }));

  io.to("mainRoom").emit("finalResult", result); // 또는 특정 팀만 전송하고 싶으면 io.to(teamRoom).emit()
  console.log(`🏁 ${team} 결과 전송됨:`, result);
}
function getNextQuestion(team) {
  const available = questions.filter(q => !usedQuestions.includes(q.text));

  if (available.length === 0) {
    console.warn(`⚠️ ${team}: 모든 문제 소진 → 초기화`);
    usedQuestions = [];
  }

  const freshPool = questions.filter(q => !usedQuestions.includes(q.text));
  const next = freshPool[Math.floor(Math.random() * freshPool.length)];
  usedQuestions.push(next.text);
  currentAnswers[team] = next.answer;
  return next;
}

