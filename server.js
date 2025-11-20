// ------------------------------------
// 팡런 (PangRun) v1.5 - Render 배포 최종 버전
// ------------------------------------

const http = require('http');
const express = require('express');
const { Server } = require("socket.io");
const geoip = require('geoip-lite');
const redis = require('redis');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// (수정 1/3) Render 환경 변수를 사용하도록 PORT를 변경
const PORT = process.env.PORT || 3000; 

// --- Redis 데이터베이스 연결 ---
// (수정 2/3) Render 환경 변수 REDIS_URL을 사용하도록 변경
// Render 배포 시 이 주소(Upstash 주소)로 자동 접속합니다.
const redisClient = redis.createClient({ url: process.env.REDIS_URL }); 
redisClient.on('error', err => console.log('Redis Client Error', err));

// 서버가 켜질 때 Redis에 먼저 연결합니다.
async function connectRedis() {
    await redisClient.connect();
    console.log('✅ Redis 데이터베이스에 연결되었습니다.');
}
connectRedis();
// ---------------------------------

// 국가 코드(KR)를 이름(🇰🇷 한국)으로 바꿔주는 목록
const countryMapper = {
    'KR': '🇰🇷 한국', 'JP': '🇯🇵 일본', 'US': '🇺🇸 미국', 'CN': '🇨🇳 중국',
    'TW': '🇹🇼 대만', 'DE': '🇩🇪 독일', 'FR': '🇫🇷 프랑스',
    'ETC': '👽 기타', // ETC 코드도 명시적으로 추가
};

// 유저가 접속했을 때
io.on('connection', (socket) => {
    
    // (수정 3/3) 로컬에서 테스트할 때 한국으로 잡히도록 강제 IP 변경
    const ip = socket.request.connection.remoteAddress;
    let ipToLookup = (ip === '::1' || ip === '127.0.0.1') ? '203.247.30.1' : ip; // 203.247.30.1 = 한국 IP 예시
    
    const geo = geoip.lookup(ipToLookup);
    let userCountryCode = (geo && geo.country) ? geo.country : 'ETC';
    let userCountryName = countryMapper[userCountryCode] || '👽 기타';

    socket.countryName = userCountryName;
    
    console.log(`유저 접속: ${userCountryName} (IP: ${ipToLookup})`);
    
    // 유저가 '클릭'을 보내왔을 때
    socket.on('sendPang', (clickCount) => {
        redisClient.hIncrBy('pangrun_scores', socket.countryName, clickCount);
    });

    // 유저가 접속을 끊었을 때
    socket.on('disconnect', () => {
        console.log(`유저 나감: ${userCountryName}`);
    });
});

// 1초마다 '진짜' 랭킹 방송
setInterval(async () => { 
    
    const allScores = await redisClient.hGetAll('pangrun_scores');

    const rankingData = Object.keys(allScores).map(countryName => {
        return {
            name: countryName,
            distance: parseInt(allScores[countryName])
        };
    });

    // 2. 점수(distance) 기준으로 정렬하기
    rankingData.sort((a, b) => b.distance - a.distance);

    // 3. payload 구성
    const payload = {
        ranking: rankingData,
        users: io.engine.clientsCount 
    };

    // 4. 'updateRanking'이라는 이름으로 *모든 유저*에게 방송!
    io.emit('updateRanking', payload);

}, 1000);

// 서버 실행
server.listen(PORT, () => {
    console.log(`(v1.5) 팡런 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});
