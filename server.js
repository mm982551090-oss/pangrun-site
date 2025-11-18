const http = require('http');
const express = require('express');
const { Server } = require("socket.io");
const geoip = require('geoip-lite');
const redis = require('redis');
const path = require('path');

const app = express();

// --- (신규!) 웹 브라우저 접속 라우트 설정 ---
app.use(express.static(path.join(__dirname, '/')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'pangrun.html'));
});
// ------------------------------------

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});
const PORT = 3000;

const redisClient = redis.createClient();
redisClient.on('error', err => console.log('Redis Client Error', err));

async function connectRedis() {
    await redisClient.connect();
    console.log('Redis 데이터베이스에 연결되었습니다.');
}
connectRedis();

const countryMapper = {
    'KR': '🇰🇷 한국', 'JP': '🇯🇵 일본', 'US': '🇺🇸 미국', 'CN': '🇨🇳 중국',
    'TW': '🇹🇼 대만', 'DE': '🇩🇪 독일', 'FR': '🇫🇷 프랑스',
};

io.on('connection', (socket) => {
    const ip = socket.request.connection.remoteAddress;
    
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

    socket.countryName = userCountryName;
    
    console.log(`유저 접속: ${userCountryName} (IP: ${ip})`);
    
    socket.on('sendPang', (clickCount) => {
        redisClient.hIncrBy('pangrun_scores', socket.countryName, clickCount);
    });

    socket.on('disconnect', () => {
        console.log(`유저 나감: ${userCountryName}`);
    });
});

setInterval(async () => {
    const allScores = await redisClient.hGetAll('pangrun_scores');

    const rankingData = Object.keys(allScores).map(countryName => {
        return {
            name: countryName,
            distance: parseInt(allScores[countryName])
        };
    });

    rankingData.sort((a, b) => b.distance - a.distance);

    const payload = {
        ranking: rankingData,
        users: io.engine.clientsCount
    };

    io.emit('updateRanking', payload);

}, 1000);

server.listen(PORT, () => {
    console.log(`(v1.4) 팡런 'Redis' 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});
