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
  res.status(200).send("✅ Catch Mind WebSocket Server OK");
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

  if (!gameStarted || !currentAnswers[team]) return;

  const correctAnswer = currentAnswers[team];

  const isCorrect = submittedAnswer === correctAnswer;

  if (!(team in scores)) scores[team] = {};
  if (!(nickname in scores[team])) scores[team][nickname] = 0;

  const resultPayload = {
  isCorrect,
  nickname,
  score: scores[team][nickname],     // 해당 닉네임의 점수
  team                                // 팀 정보도 함께 전송
};


  // ✅ 정답/오답 모두 참가자에게 알림
  io.to(team).emit("answerResult", resultPayload);

  if (isCorrect) {
    // ✅ 먼저 이전 정답 제거
    currentAnswers[team] = null;

    scores[team][nickname]++;
    console.log(`✅ ${team} 최초 정답자: ${nickname}`);

    const next = getNextQuestion(team);  // 이 안에서 currentAnswers 재설정

    if (next) {
      io.to(team).emit("sendQuestion", next);
      console.log(`🔄 ${team} 전체에게 다음 문제 전송됨:`, next.text);
    }
  }
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
  io.to(team).emit("sendQuestion", question);  // 🔥 출제자 포함 전체에게 전송
  currentAnswers[team] = question.answer;  // ✅ 팀별 정답 저장
  console.log(`🎯 ${team} 문제 전송됨:`, question.text);
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
// 12. 출제자가 전체 지우기 요청 시 참가자에게 브로드캐스트
socket.on("clearCanvas", () => {
  const player = players[socket.id];
  if (!player) return;

  const teamRoom = player.team;
  io.to(teamRoom).emit("clearCanvas");
  console.log("🧹 clearCanvas 브로드캐스트:", teamRoom);
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
// 13. 수동 게임 초기화 요청
socket.on("resetGame", () => {
  players = {};
  scores = {
    "1조": {}, "2조": {}, "3조": {},
    "4조": {}, "5조": {}, "6조": {}
  };
  currentAnswers = {
    "1조": "", "2조": "", "3조": "",
    "4조": "", "5조": "", "6조": ""
  };
  usedQuestions = [];
  gameStarted = false;
  roomCode = generateCode(); // 새 입장 코드 생성

  io.to("mainRoom").emit("gameReset");
  io.to("mainRoom").emit("code", roomCode); 
  console.log("🔄 관리자에 의해 게임 수동 초기화됨");
});
// ✅ 여기서 io.on("connection") 닫기
});

// ✅ 이 아래는 전역 함수 및 서버 실행 코드들

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

// ✅ listen은 반드시 io.on 바깥에 위치해야 함!!
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 캐치마인드 서버 실행 중! 포트: ${PORT}`);
});

function sendFinalResults(team) {
  if (!scores[team]) return;

 const allResults = {};

Object.keys(scores).forEach(team => {
  const teamScores = scores[team];
  const sorted = Object.entries(teamScores)
    .sort(([, a], [, b]) => b - a)
    .map(([nickname, score]) => ({ nickname, score }));
  allResults[team] = sorted;
});

io.to("mainRoom").emit("finalResult", allResults);
  
console.log("🏁 전체 결과 전송됨:", allResults);
 // ✅ 게임 상태 자동 초기화
  players = {};
  scores = {
    "1조": {}, "2조": {}, "3조": {},
    "4조": {}, "5조": {}, "6조": {}
  };
  currentAnswers = {
    "1조": "", "2조": "", "3조": "",
    "4조": "", "5조": "", "6조": ""
  };
  usedQuestions = [];
  gameStarted = false;
  roomCode = generateCode(); // 새 입장 코드 생성
  console.log("🧹 게임 종료 후 상태 초기화 완료");
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
