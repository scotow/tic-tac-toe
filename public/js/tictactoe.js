$(function(){

    var socket = io();

    socket.on('nickname', function(){
        swal({
            title: 'Nickname',
            input: 'text'
        }).then(function(result) {
            socket.emit('join', result)
        }, function(){
            socket.emit('join', '');
        });
    });

    socket.on('queue', function(){
        swal({
            title: 'Queued',
            text: 'Waiting for another player',
            imageUrl: '/images/loading.gif',
            allowOutsideClick: false,
            allowEscapeKey: false,
            showConfirmButton: false
        });
    });

    socket.on('start', function(data){
        $("#player1").text(data.player1);
        $("#player2").text(data.player2);
        $(".cell").empty();
        swal({
            title: 'Game found',
            text: data.player1 + ' vs ' + data.player2 + '\n' + (data.start ? "You start" : "Your opponent starts")
        });
    });

    socket.on('turn', function(data){
        $(".player-nickname").removeClass("player-turn");
        $("#player" + data.turn).addClass("player-turn");
    });

    $(".cell").click(function(){
        var id = $(this).attr("id")*1;
        var position = {
            x: id%3,
            y: Math.floor(id/3)
        };
        socket.emit('play', {position: position});
    });

    socket.on('play', function(data){
        $(".cell").eq(data.position.y*3 + data.position.x).append($("<div></div>").addClass(data.player === 1 ? "cross" : "circle"));
    });

    socket.on('win', function(data){
        if(!data.forfeit){
            var swalDelay = 1500;
            console.log(data.positions);
            setTimeout(function(){
                data.positions.forEach(function(position){
                    position = position.y*3 + position.x;
                    $("#" + position).children().addClass("blink");
                });
            }, 600);
        }
        setTimeout(function(){
            swal({
                title: "You won",
                text: data.forfeit ? "Your opponent left the game" : "Congrats",
                showCancelButton: true,
                confirmButtonText: "Play again"
            }).then(function() {
                socket.emit('play-again');
            }, function(){
                $("#play-again").fadeIn();
            });
        }, swalDelay || 0);
    });

    socket.on('lose', function(data){
        if(!data.forfeit){
            var swalDelay = 1500;
            setTimeout(function(){
                data.positions.forEach(function(position){
                    position = position.y*3 + position.x;
                    $("#" + position).children().addClass("blink");
                });
            }, 600);
        }
        setTimeout(function(){
            swal({
                title: "Sorry, you lost this one",
                text: "Maybe next time",
                showCancelButton: true,
                confirmButtonText: "Play again"
            }).then(function() {
                socket.emit('play-again');
            }, function(){
                $("#play-again").fadeIn();
            });
        }, swalDelay || 0);
    });

    socket.on('tie', function(){
        swal({
            title: "Tie",
            text: "The game has ended on a draw",
            showCancelButton: true,
            confirmButtonText: "Play again"
        }).then(function() {
            socket.emit('play-again');
        }, function(){
            $("#play-again").fadeIn();
        });
    });

    $("#play-again").click(function(){
        $("#play-again").hide();
        socket.emit('play-again');
    });

});