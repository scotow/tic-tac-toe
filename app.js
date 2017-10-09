#!/usr/bin/env node

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

app.use(express.static(path.join(__dirname, 'public')));
app.use(/\/(?:[1-9]\d*)?/, express.static(path.join(__dirname, 'public')));

// Game Setup
const GAME_SIZE = {
    DEFAULT: 3,
    MIN: 3,
    MAX: 10
};

const AXIS = {
    HORIZONTAL  : 1 << 0,
    VERTICAL    : 1 << 1,
    DIAGONAL    : 1 << 2
};

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

        if((this.player1.startingAvantage + this.player2.startingAvantage) % 2 === 0) {
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
            player.socket.once('disconnect', () => {
                player.opponent.socket.emit('win', {forfeit: true});
                player.opponent.exitGame();
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

        // Reverse once to call nextTurn afterwards.
        this.playing = startingPlayer.opponent;
        this.nextTurn();
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
        const lines = this.grid.winLines(position.x, position.y);
        if(lines.length) {
            ending = true;
            player.socket.emit('win', {lines: lines});
            player.opponent.socket.emit('lose', {lines: lines});
        } else if(this.grid.isTie()) {
            ending = true;
            this.players.forEach((player) => {
                player.socket.emit('tie');
            });
        }

        if(ending) {
            this.players.forEach((player) => {
                player.exitGame();
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

    winLines(x, y) {
        const lines = [];
        if(Math.abs(this.horizontalCounter[x].sum) === this.size) lines.push({axis: AXIS.HORIZONTAL, index: x});
        if(Math.abs(this.verticalCounter[y].sum) === this.size) lines.push({axis: AXIS.VERTICAL, index: y});
        if(Math.abs(this.diagonalsCounter[0]) === this.size) lines.push({axis: AXIS.DIAGONAL, index: 0});
        if(Math.abs(this.diagonalsCounter[1]) === this.size) lines.push({axis: AXIS.DIAGONAL, index: 1});
        return lines;
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
        this.startingAvantage = false;
    }

    exitGame() {
        const self = this;
        this.socket.removeAllListeners('disconnect');
        this.socket.removeAllListeners('play');
        this.socket.once('play-again', () => {
            // self.socket.removeAllListeners('play-again');
            searchGame(self);
        });
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
        player.socket.once('disconnect', () => {
            queue.splice(queue.indexOf(player), 1);
        });
    } else {
        new Game(player.preferedSize, queue.splice(0, 2));
    }
}


io.on('connection', (socket) => {
    socket.emit('setup', {size: GAME_SIZE, axis: AXIS});

    socket.once('join', (data) => {
        let preferedSize;
        if(data.size && _.isNumber(data.size)) {
            preferedSize = data.size <= GAME_SIZE.MIN ? GAME_SIZE.MIN : data.size >= GAME_SIZE.MAX ? GAME_SIZE.MAX : data.size;
        } else {
            preferedSize = GAME_SIZE.DEFAULT;
        }
        searchGame(new Player(socket, data.nickname, preferedSize));
    });
});

server.listen(PORT, console.log.bind(null, `tic-tac-toe started on port ${PORT}.`));