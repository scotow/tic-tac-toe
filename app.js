// Moduls
const path = require('path');
const _ = require('underscore');
const ms = require('ms');
const http = require('http');
const express = require('express');
const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server, {'pingTimeout': ms('2s'), 'pingInterval': ms('2s')});

// Web Server & Routing
const PORT = process.env.port || 3004;

app.use(express.static('public'));
app.use(/\/(?:[1-9]\d*)?/, express.static('public'));

// Game Setup
const DEFAULT_GAME_SIZE = 3;
const MIN_GAME_SIZE = 3;
const MAX_GAME_SIZE = 10;

// Game data
let queues = [];
let playerIndex = 1;

class Game {
    constructor(size, players) {
        this.grid = new Grid(size);
        this.players = players;
        this.player1 = players[0]; this.player2 = players[1];
        this.player1.opponent = this.player2; this.player2.opponent = this.player1;
        this.player1.gridValue = 1; this.player2.gridValue = -1;

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
                if(self.playing === player) self.play(player, data.position);
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
        if(!this.grid.setCellIfValid(position.x, position.y, player.gridValue)) return;

        const playerIndex = player === this.player1 ? 1 : 2;
        this.players.forEach((player) => {
            player.socket.emit('play', {position: position, player: playerIndex});
        });

        let ending = false;
        if(this.grid.isWin(position.x, position.y)) {
            ending = true;
            player.socket.emit('win', {positions: []});
            player.opponent.socket.emit('lose', {positions: []});
        } else if(this.grid.isTie()) {
            ending = true;
            this.players.forEach((player) => {
                player.socket.emit('tie');
            });
        }

        if(ending) {
            this.players.forEach((player) => {
                player.exitGame();
                player.playAgain();
            });
        } else {
            this.nextTurn();
        }
    }
}

class Grid {
    constructor(size) {
        this.size = size;

        this.data = new Array(size);
        this.horizontalCounter = [];
        this.verticalCounter = [];
        this.diagonalsCounter   = [0, 0];
        for(let i = 0; i < size; i++) {
            this.data[i] = (new Array(size)).fill(0);
            this.horizontalCounter[i] = {sum: 0, filled: 0};
            this.verticalCounter[i] = {sum: 0, filled: 0};
        }
    }

    setCellIfValid(x, y, value) {
        if(x >= 0 && x < this.size && y >= 0 && y < this.size && !this.data[y][x]) {
            this.data[y][x] = value;
            this.horizontalCounter[x].sum += value;
            this.horizontalCounter[x].filled++;
            this.verticalCounter[y].sum += value;
            this.verticalCounter[y].filled++;
            if(x === y) {
                this.diagonalsCounter[0] += value;
            } else if(this.size - 1 - x === y) {
                this.diagonalsCounter[1] += value;
            }
            return true;
        } else {
            return false;
        }
    }

    isWin(x, y) {
        if(Math.abs(this.horizontalCounter[x].sum) === this.size) return true;
        if(Math.abs(this.verticalCounter[y].sum) === this.size) return true;
        if(Math.abs(this.diagonalsCounter[0]) === this.size) return true;
        if(Math.abs(this.diagonalsCounter[1]) === this.size) return true;
        return false;
    }

    isTie() {
        return this.horizontalCounter.every((counter) => counter.filled === this.size);
    }
}

class Player {
    constructor(socket, nickname, preferedSize) {
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
        this.preferedSize = preferedSize;
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
    let queue;
    if(queues[player.preferedSize]) {
        queue = queues[player.preferedSize];
    } else {
        queue = [];
        queues[player.preferedSize] = queue;
    }

    queue.push(player);
    if(queue.length === 1) {
        player.socket.emit('queue');
        player.socket.on('disconnect', () => {
            queue.splice(queue.indexOf(player), 1);
        });
    } else {
        new Game(player.preferedSize, queue.splice(0, 2));
    }
}


io.on('connection', (socket) => {
    socket.emit('setup', {default: DEFAULT_GAME_SIZE, min: MIN_GAME_SIZE, max: MAX_GAME_SIZE});

    socket.on('join', (data) => {
        let preferedSize;
        if(data.size && _.isNumber(data.size)) {
            preferedSize = data.size <= MIN_GAME_SIZE ? MIN_GAME_SIZE : data.size >= MAX_GAME_SIZE ? MAX_GAME_SIZE : data.size;
        } else {
            preferedSize = DEFAULT_GAME_SIZE;
        }
        searchGame(new Player(socket, data.nickname, preferedSize));
    });
});

server.listen(PORT, console.log.bind(null, `tic-tac-toe started on port ${PORT}.`));
