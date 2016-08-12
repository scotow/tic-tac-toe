$(function(){

    var CELL_SIZE = 200;

    var $canvas = $("#gamepanel");

    var canvas = $canvas[0];
    var context = canvas.getContext('2d');

    $canvas.click(function(event){
        alert(Math.floor(event.offsetX/CELL_SIZE) + Math.floor(event.offsetY/CELL_SIZE) * 3);
    });

    function draw(){
        for(var i = 1 ; i <= 2 ; i++){
            context.moveTo(i * CELL_SIZE, 0);
            context.lineTo(i * CELL_SIZE, canvas.height);
            context.moveTo(0, i * CELL_SIZE);
            context.lineTo(canvas.width, i * CELL_SIZE);
        }

        context.strokeStyle = "gray";
        context.stroke();

    }

    draw();

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
            imageUrl: '/images/loading2.gif',
            allowOutsideClick: false,
            allowEscapeKey: false,
            showConfirmButton: false
        });
    });

    socket.on('start', function(data){
        swal({
            title: 'Game found',
            text: data.player1 + ' vs ' + data.player2
        });
    });

});