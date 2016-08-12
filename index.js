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


var inComingGame;
var games = [];


function Game(){

    this.addPlayer = function(player){
        if(this.player1){
            this.player2 = player;
            this.start();
            inComingGame = undefined;
        }else{
            this.player1 = player;
            player.socket.emit('queue');
        }
    };

    this.start = function(){
        var data = {
            player1: this.player1.nickname,
            player2: this.player2.nickname
        };
        this.player1.socket.emit('start', data);
        this.player2.socket.emit('start', data);

        this.playerTurn = Math.random() < 0.5 ? this.player1 : this.player2;
    };

    this.nextTurn = function(){
        this.playerTurn = this.playerTurn === this.player1 ? this.player2 : this.player1;
    }

}


function Player(nickname, socket){

    this.nickname = nickname;
    this.socket = socket;

}


io.on('connection', function(socket){

    var player;

    socket.emit('nickname');

    socket.on('join', function(nickname){

        player = new Player(nickname, socket);

        // if(inComingGame){
        //     var game = inComingGame;
        //
        //     game.player2 = player;
        //     game.start();
        //
        //     inComingGame = undefined;
        // }else{
        //     var game = new Game();
        //
        //     game.player1 = player;
        //     socket.emit('queue');
        //
        //     inComingGame = game;
        // }

        inComingGame = inComingGame ? inComingGame : new Game();

        inComingGame.addPlayer(player);

    });

});