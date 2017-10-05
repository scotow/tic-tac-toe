// Moduls
const path = require('path');
const _ = require('underscore');
const ms = require('ms');
const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server, {'pingTimeout': ms('2s'), 'pingInterval': ms('2s')});

const PORT = process.env.port || 3004;

app.use(express.static(path.join(__dirname, 'public')));

app.get(/\/([1-9]\d+)?/, (req, res) => {
     res.sendFile(__dirname + '/public');
});

// Setup
const DEFAULT_GAME_SIZE = 3;

// Game
let queue = [];
let playerIndex = 1;

class Game {
    constructor(size, players) {
        this.size = size;
        this.players = players;
        this.player1 = players[0]; this.player2 = players[1];
        this.player1.opponent = this.player2; this.player2.opponent = this.player1;
        this.grid = [[0, 0, 0], [0, 0, 0], [0, 0 ,0]];

        if(this.player1.startingAvantage + this.player2.startingAvantage % 2 === 0) {
            this.start(Math.random() < 0.5 ? this.player1 : this.player2);
        } else {
            this.start(this.player1.startingAvantage ? this.player2 : this.player1);
        }
    }

    start(startingPlayer) {
        const self = this;
        startingPlayer.startingAvantage = true;
        startingPlayer.opponent.startingPlayer = false;

        this.players.forEach((player) => {
            player.socket.removeAllListeners('disconnect');
            player.socket.on('disconnect', () => {
                player.opponent.socket.emit('win', {forfeit: true});
                player.opponent.exitGame();
                player.opponent.playAgain();
            });
            player.socket.emit('start', {
                player1: self.player1.nickname,
                player2: self.player2.nickname,
                start: startingPlayer === player
            });
            player.socket.on('play', (data) => {
                if(self.isValidPlay(player, data.position)) {
                    self.play(player, data.position);
                }
            });
        });

        this.playing = startingPlayer.opponent;
        this.nextTurn();
    }

    isValidPlay(player, position) {
        return this.playing === player && !this.grid[position.y][position.x];
    }

    nextTurn() {
        const playerIndex = this.playing === this.player1 ? 2 : 1;
        this.playing = playerIndex === 1 ? this.player1 : this.player2;
        this.player1.socket.emit('turn', {turn: playerIndex});
        this.player2.socket.emit('turn', {turn: playerIndex});
    }

    play(player, position) {
        const playerIndex = player === this.player1 ? 1 : 2;
        this.grid[position.y][position.x] = playerIndex;
        this.player1.socket.emit('play', {position: position, player: playerIndex});
        this.player2.socket.emit('play', {position: position, player: playerIndex});

        const gameStatus = this.gameStatus();
        if(!gameStatus.over) {
            this.nextTurn();
        } else {
            switch(gameStatus.player) {
                case 1:
                    this.player1.socket.emit('win', {positions: gameStatus.positions});
                    this.player2.socket.emit('lose', {positions: gameStatus.positions});
                    break;
                case 2:
                    this.player1.socket.emit('lose', {positions: gameStatus.positions});
                    this.player2.socket.emit('win', {positions: gameStatus.positions});
                    break;
                default:
                    this.player1.socket.emit('tie');
                    this.player2.socket.emit('tie');
                    break;
            }

            this.players.forEach((player) => {
                player.exitGame();
                player.playAgain();
            });
        }
    }

    gameStatus() {
        for(let i = 0 ; i < 3 ; i++) {
            if(this.grid[i][0] === 1 && this.grid[i][1] === 1 && this.grid[i][2] === 1) {
                return {
                    over: true,
                    player: 1,
                    positions: [{x: 0, y: i}, {x: 1, y: i}, {x: 2, y: i}]
                };
            } else if(this.grid[i][0] === 2 && this.grid[i][1] === 2 && this.grid[i][2] === 2) {
                return {
                    over: true,
                    player: 2,
                    positions: [{x: 0, y: i}, {x: 1, y: i}, {x: 2, y: i}]
                };
            }
            if(this.grid[0][i] === 1 && this.grid[1][i] === 1 && this.grid[2][i] === 1) {
                return {
                    over: true,
                    player: 1,
                    positions: [{x: i, y: 0}, {x: i, y: 1}, {x: i, y: 2}]
                };
            } else if(this.grid[0][i] === 2 && this.grid[1][i] === 2 && this.grid[2][i] === 2) {
                return {
                    over: true,
                    player: 2,
                    positions: [{x: i, y: 0}, {x: i, y: 1}, {x: i, y: 2}]
                };
            }
        }
        if(this.grid[0][0] === 1 && this.grid[1][1] === 1 && this.grid[2][2] === 1) {
            return {
                over: true,
                player: 1,
                positions: [{x: 0, y: 0}, {x: 1, y: 1}, {x: 2, y: 2}]
            };
        } else if(this.grid[0][0] === 2 && this.grid[1][1] === 2 && this.grid[2][2] === 2) {
            return {
                over: true,
                player: 2,
                positions: [{x: 0, y: 0}, {x: 1, y: 1}, {x: 2, y: 2}]
            };
        }
        if(this.grid[0][2] === 1 && this.grid[1][1] === 1 && this.grid[2][0] === 1) {
            return {
                over: true,
                player: 1,
                positions: [{x: 2, y: 0}, {x: 1, y: 1}, {x: 0, y: 2}]
            };
        } else if(this.grid[0][2] === 2 && this.grid[1][1] === 2 && this.grid[2][0] === 2) {
            return {
                over: true,
                player: 2,
                positions: [{x: 2, y: 0}, {x: 1, y: 1}, {x: 0, y: 2}]
            };
        }
        for(let i = 0 ; i < 3 ; i++) {
            for(let j = 0 ; j < 3 ; j++) {
                if(!this.grid[i][j]) {
                    return {over: false};
                }
            }
        }
        return {
            over: true,
            player: 'tie'
        };
    }
}

class Player {
    constructor(nickname, socket) {
        if(_.isString(nickname)) {
            nickname = nickname.trim();
            if(nickname.length) {
                this.nickname = nickname.length > 10 ? nickname.substr(0, 10) + '...' : nickname;
            } else {
                this.nickname = 'Player ' + playerIndex++;
            }
        } else {
            this.nickname = 'Player ' + playerIndex++;
        }
        this.socket = socket;
    }

    playAgain() {
        const self = this;
        this.socket.on('play-again', () => {
            self.socket.removeAllListeners('play-again');
            searchGame(self);
        });
    }

    exitGame() {
        this.socket.removeAllListeners('disconnect');
        this.socket.removeAllListeners('play');
    }
}

function searchGame(player) {
    queue.push(player);

    if(queue.length === 1) {
        player.socket.emit('queue');
        player.socket.on('disconnect', () => {
            queue.splice(queue.indexOf(player), 1);
        });
    } else {
        new Game(queue.splice(0, 2));
    }
}


io.on('connection', (socket) => {
    socket.emit('nickname');

    socket.on('join', (data) => {
        searchGame(data.size || DEFAULT_GAME_SIZE, new Player(data.nickname, socket));
    });
});

server.listen(PORT, console.log.bind(null, `tic-tac-toe started on port ${PORT}.`));
