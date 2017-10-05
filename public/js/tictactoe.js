$(function() {
    var size = Number(window.location.pathname.split('/')[1]);

    function drawGrid() {
        for(var y = 0; y < size; y++) {
            var $line = $('<div></div>').addClass('line');
            for(var x = 0; x < size; x++) {
                $('<div></div>').addClass('cell').appendTo($line);
            }
            $('.grid').append($line);
        }
    }

    const $queueAnimation = $('<div></div>').addClass('queue');
    $('<div></div>').addClass('dot1').appendTo($queueAnimation);
    $('<div></div>').addClass('dot2').appendTo($queueAnimation);

    const socket = io();

    socket.on('setup', function(data) {
        if(size) size = size <= data.min ? data.min : size >= data.max ? data.max : size;
        else size = data.default;
        drawGrid();

        swal({
            title: 'Nickname',
            content: 'input'
        })
        .then(function(nickname) {
            socket.emit('join', {size: size, nickname: nickname});
        });
    })
    .on('queue', function() {
        swal({
            title: 'Queued',
            text: 'Waiting for another player',
            content: $queueAnimation.get(0),
            button: false,
            closeOnClickOutside: false,
            closeOnEsc: false
        });
    })
    .on('start', function(data) {
        $('#player1').text(data.player1);
        $('#player2').text(data.player2);
        $('.cell').empty();
        swal({
            title: 'Game found',
            //text: data.player1 + ' vs ' + data.player2 + '\n\n' + (data.start ? 'You start' : 'Your opponent starts'),
            text: data.start ? 'You start' : 'Your opponent starts',
            button: 'Let\'s go'
        });
    })
    .on('turn', function(data) {
        $('.player-nickname').removeClass('player-turn');
        $('#player' + data.turn).addClass('player-turn');
    })
    .on('play', function(data) {
        $('.cell').eq(data.position.y * size + data.position.x)
        .append($('<div></div>')
        .addClass(data.player === 1 ? 'cross' : 'circle'));
    })
    .on('win', function(data) {
        handleEndOfGame('win', data);
    })
    .on('lose', function(data) {
        handleEndOfGame('lose', data);
    })
    .on('tie', function() {
        handleEndOfGame('tie')
    });

    function handleEndOfGame(status, data) {
        var title, description, swalDelay;
        switch(status) {
            case 'win':
                title = 'You won';
                description = 'Congrats';
                swalDelay = !data.forfeit ? 1500 : 0;
                break;
            case 'lose':
                title = 'You lose';
                description = 'Sorry, you lose this one, maybe next time';
                swalDelay = 1500;
                break;
            case 'tie':
                title = 'Tie',
                description = 'The game has ended on a draw';
                break;
        }
        if(swalDelay) {
            setTimeout(function() {
                data.positions.forEach(function(position) {
                    $('.line').eq(position.y).children().eq(position.x).children().addClass('blink');
                });
            }, 600);
        }
        setTimeout(function() {
            swal({
                title: title,
                text: description,
                button: 'Play again'
            }).then(function(result) {
                if(result) {
                    socket.emit('play-again');
                } else {
                    $('#play-again').fadeIn();
                }
            });
        }, swalDelay || 0);
    }

    $('.cell').click(function() {
        socket.emit('play', {position: {x: $(this).index(), y: $(this).parent().index()}});
    });

    $('#play-again').click(function() {
        $('#play-again').hide();
        socket.emit('play-again');
    });
});
