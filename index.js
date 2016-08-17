var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);

app.use(express.static(__dirname + '/public'));

app.get('/', function(req, res){
    res.sendFile(__dirname + '/public/index.html');
});

http.listen(3004, function(){
    console.log('listening on *:3004');
});


var queue = [];

var playerIndex = 1;


function Game(players){

    this.start = function(){

        var self = this;

        this.player1.socket.removeAllListeners('disconnect');
        this.player1.socket.on('disconnect', function(){
            self.player2.socket.emit('win', {forfeit: true});
            self.player2.exitGame();
            self.player2.playAgain();
        });
        this.player2.socket.removeAllListeners('disconnect');
        this.player2.socket.on('disconnect', function(){
            self.player1.socket.emit('win', {forfeit: true});
            self.player1.exitGame();
            self.player1.playAgain();
        });


        this.grid = [[0, 0, 0], [0, 0, 0], [0, 0 ,0]];

        this.playerTurn = Math.random() < 0.5 ? this.player1 : this.player2;

        players.forEach(function(player){
            player.socket.emit('start', {
                player1: self.player1.nickname,
                player2: self.player2.nickname,
                start: self.playerTurn !== player
            });
            player.socket.on('play', function(data){
                if(self.isValidPlay(player, data.position)){
                    self.play(player, data.position);
                }
            });
        });

        this.nextTurn();
    };

    this.isValidPlay = function(player, position){
        return this.playerTurn === player && !this.grid[position.y][position.x];
    };

    this.nextTurn = function(){
        var playerIndex = this.playerTurn === this.player1 ? 2 : 1;
        this.playerTurn = playerIndex === 1 ? this.player1 : this.player2;
        this.player1.socket.emit('turn', {turn: playerIndex});
        this.player2.socket.emit('turn', {turn: playerIndex});
    };

    this.play = function(player, position){
        var playerIndex = player === this.player1 ? 1 : 2;
        this.grid[position.y][position.x] = playerIndex;
        this.player1.socket.emit('play', {position: position, player: playerIndex});
        this.player2.socket.emit('play', {position: position, player: playerIndex});

        var gameStatus = this.gameStatus();
        if(!gameStatus.over){
            this.nextTurn();
        }else{
            switch(gameStatus.player){
                case 1:
                    this.player1.socket.emit('win', {positions: gameStatus.positions});
                    this.player2.socket.emit('lose', {positions: gameStatus.positions});
                    break;
                case 2:
                    this.player1.socket.emit('lose', {positions: gameStatus.positions});
                    this.player2.socket.emit('win', {positions: gameStatus.positions});
                    break;
                default:
                    this.player1.socket.emit('tie', {});
                    this.player2.socket.emit('tie', {});
                    break;
            }

            players.forEach(function(player){
                player.exitGame();
                player.playAgain();
            });
        }
    };

    this.gameStatus = function(){
        for(var i = 0 ; i < 3 ; i++){
            if(this.grid[i][0] === 1 && this.grid[i][1] === 1 && this.grid[i][2] === 1){
                return {
                    over: true,
                    player: 1,
                    positions: [{x: 0, y: i}, {x: 1, y: i}, {x: 2, y: i}]
                };
            }else if(this.grid[i][0] === 2 && this.grid[i][1] === 2 && this.grid[i][2] === 2){
                return {
                    over: true,
                    player: 2,
                    positions: [{x: 0, y: i}, {x: 1, y: i}, {x: 2, y: i}]
                };
            }
            if(this.grid[0][i] === 1 && this.grid[1][i] === 1 && this.grid[2][i] === 1){
                return {
                    over: true,
                    player: 1,
                    positions: [{x: i, y: 0}, {x: i, y: 1}, {x: i, y: 2}]
                };
            }else if(this.grid[0][i] === 2 && this.grid[1][i] === 2 && this.grid[2][i] === 2){
                return {
                    over: true,
                    player: 2,
                    positions: [{x: i, y: 0}, {x: i, y: 1}, {x: i, y: 2}]
                };
            }
        }
        if(this.grid[0][0] === 1 && this.grid[1][1] === 1 && this.grid[2][2] === 1){
            return {
                over: true,
                player: 1,
                positions: [{x: 0, y: 0}, {x: 1, y: 1}, {x: 2, y: 2}]
            };
        }else if(this.grid[0][0] === 2 && this.grid[1][1] === 2 && this.grid[2][2] === 2){
            return {
                over: true,
                player: 2,
                positions: [{x: 0, y: 0}, {x: 1, y: 1}, {x: 2, y: 2}]
            };
        }
        if(this.grid[0][2] === 1 && this.grid[1][1] === 1 && this.grid[2][0] === 1){
            return {
                over: true,
                player: 1,
                positions: [{x: 2, y: 0}, {x: 1, y: 1}, {x: 2, y: 0}]
            };
        }else if(this.grid[0][2] === 2 && this.grid[1][1] === 2 && this.grid[2][0] === 2){
            return {
                over: true,
                player: 2,
                positions: [{x: 2, y: 0}, {x: 1, y: 1}, {x: 2, y: 0}]
            };
        }
        for(var i = 0 ; i < 3 ; i++){
            for(var j = 0 ; j < 3 ; j++){
                if(!this.grid[i][j]){
                    return {over: false};
                }
            }
        }
        return {
            over: true,
            player: "tie"
        };
    };


    this.player1 = players[0];
    this.player2 = players[1];

    this.start();

}


function Player(nickname, socket){

    this.nickname = nickname ? nickname : "Player " + playerIndex++;
    this.socket = socket;

    this.playAgain = function(){
        var self = this;
        socket.on('play-again', function(){
            socket.removeAllListeners('play-again');
            searchGame(self);
        });
    };

    this.exitGame = function(){
        socket.removeAllListeners('disconnect');
        socket.removeAllListeners('play');
    }

}

function searchGame(player){

    queue.push(player);

    if(queue.length === 1){
        player.socket.emit('queue');
        player.socket.on('disconnect', function(){
            queue.splice(queue.indexOf(player), 1);
        });
    }else{
        new Game(queue.splice(0, 2));
    }
}


io.on('connection', function(socket){

    var player;

    socket.emit('nickname');

    socket.on('join', function(nickname){

        player = new Player(nickname, socket);

        searchGame(player);
    });

});