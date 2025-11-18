// ------------------------------------
// 팡런 (PangRun) v1.4 - '진짜' DB (Redis) 연동
// ------------------------------------

const http = require('http');
const express = require('express');
const { Server } = require("socket.io");
const geoip = require('geoip-lite'); // IP 판별
const redis = require('redis'); // (신규!) Redis 부품

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});
const PORT = 3000;

// --- (신규!) Redis 데이터베이스 연결 ---
const redisClient = redis.createClient(); // 기본 포트(6379)로 접속
redisClient.on('error', err => console.log('Redis Client Error', err));

// (신규!) 서버가 켜질 때 Redis에 먼저 연결합니다.
async function connectRedis() {
    await redisClient.connect();
    console.log('Redis 데이터베이스에 연결되었습니다.');
}
connectRedis();
// ---------------------------------

// 국가 코드(KR)를 이름(🇰🇷 한국)으로 바꿔주는 목록 (동일)
const countryMapper = {
    'KR': '🇰🇷 한국', 'JP': '🇯🇵 일본', 'US': '🇺🇸 미국', 'CN': '🇨🇳 중국',
    'TW': '🇹🇼 대만', 'DE': '🇩🇪 독일', 'FR': '🇫🇷 프랑스',
};
// (삭제!) let realDB = {}; -> 이제 Redis가 이 역할을 합니다.
// (삭제!) let realUserCount = 0; -> Socket.io가 자동으로 셉니다.


// 유저가 접속했을 때
io.on('connection', (socket) => {
    
    // '진짜' IP 주소 찾기 (테스트 모드 해제)
    const ip = socket.request.connection.remoteAddress;
    // const ip = "202.32.1.1"; // (테스트용 일본 IP)
    
    const geo = geoip.lookup(ip);
    let userCountryCode = null;
    let userCountryName = null;

    if (geo && countryMapper[geo.country]) {
        userCountryCode = geo.country; 
        userCountryName = countryMapper[userCountryCode];
    } else {
        userCountryCode = 'ETC';
        userCountryName = '👽 기타';
    }

    socket.countryName = userCountryName; // 유저에게 국가 이름 저장
    
    console.log(`유저 접속: ${userCountryName} (IP: ${ip})`);
    
    // 유저가 '클릭'을 보내왔을 때
    socket.on('sendPang', (clickCount) => {
        // (수정!) 변수가 아닌, Redis DB의 점수를 직접 올립니다.
        // 'pangrun_scores'라는 그룹에, '🇰🇷 한국'의 점수를 'clickCount'만큼 올림
        redisClient.hIncrBy('pangrun_scores', socket.countryName, clickCount);
    });

    // 유저가 접속을 끊었을 때
    socket.on('disconnect', () => {
        console.log(`유저 나감: ${userCountryName}`);
    });
});

// 1초마다 '진짜' 랭킹 방송
setInterval(async () => { // (신규!) async 키워드 추가 (DB를 기다려야 함)
    
    // 1. (수정!) Redis에서 'pangrun_scores' 그룹의 모든 점수를 가져옴
    // 결과 예: { '👽 기타': '150', '🇯🇵 일본': '30' } (숫자가 문자열로 옴)
    const allScores = await redisClient.hGetAll('pangrun_scores');

    const rankingData = Object.keys(allScores).map(countryName => {
        return {
            name: countryName,
            distance: parseInt(allScores[countryName]) // (신규!) 문자열을 숫자로 변환
        };
    });

    // 2. 점수(distance) 기준으로 정렬하기
    rankingData.sort((a, b) => b.distance - a.distance);

    // 3. (수정!) '진짜' 접속자 수는 io.engine.clientsCount로 자동 계산
    const payload = {
        ranking: rankingData,
        users: io.engine.clientsCount // '진짜' 접속자 수
    };

    // 4. 'updateRanking'이라는 이름으로 *모든 유저*에게 방송!
    io.emit('updateRanking', payload);

}, 1000); // 1초마다 실행

// 서버 실행
server.listen(PORT, () => {
    console.log(`(v1.4) 팡런 'Redis' 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});