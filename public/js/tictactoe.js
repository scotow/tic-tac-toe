$(function() {
    var axis;
    var size = Number(window.location.pathname.split('/')[1]);

    function drawGrid() {
        const $grid = $('.grid').empty();
        for(var y = 0; y < size; y++) {
            var $line = $('<div></div>').addClass('line');
            for(var x = 0; x < size; x++) $('<div></div>').addClass('cell').appendTo($line);
            $grid.append($line);
        }
    }

    const $queueAnimation = $('<div></div>').addClass('queue');
    $('<div></div>').addClass('dot1').appendTo($queueAnimation);
    $('<div></div>').addClass('dot2').appendTo($queueAnimation);

    const socket = io();

    socket.on('setup', function(setup) {
        axis = setup.axis;
        if(size) size = size <= setup.size.MIN ? setup.size.MIN : size >= setup.size.MAX ? setup.size.MAX : size;
        else size = setup.size.DEFAULT;

        $('.grid, .bar > .item').hide();
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
        $('.grid, .bar > .item').fadeOut(1000);
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
        $('#player1 > .label').text(data.player1);
        $('#player2 > .label').text(data.player2);
        $('.cell').empty();
        $('.grid, .player').fadeIn(1000);
        $('#play-again').fadeOut(1000);

        swal({
            title: 'Game found',
            //text: data.player1 + ' vs ' + data.player2 + '\n\n' + (data.start ? 'You start' : 'Your opponent starts'),
            text: data.start ? 'You start' : 'Your opponent starts',
            button: 'Let\'s go',
            timer: 10000
        });
    })
    .on('turn', function(data) {
        $('.player').removeClass('playing');
        $('#player' + data.turn).addClass('playing');
    })
    .on('play', function(data) {
        $('.cell').eq(data.position.y * size + data.position.x)
        .append($('<div></div>')
        .addClass(data.player === 1 ? 'cross' : 'circle'));
    })
    .on('win', handleEndOfGame.bind(null, 'win'))
    .on('lose', handleEndOfGame.bind(null, 'lose'))
    .on('tie', handleEndOfGame.bind(null, 'tie'));

    function handleEndOfGame(status, data) {
        var title, description, swalDelay;
        switch(status) {
            case 'win':
                title = 'You won';
                description = !data.forfeit ? 'Congrats' : 'Your opponent left the game';
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
                const $lines = $('.line');
                data.lines.forEach(function(line) {
                    switch(line.axis) {
                        case axis.HORIZONTAL:
                            for(var y = 0; y < size; y++) $lines.eq(y).children().eq(line.index).children().addClass('blink');
                            break;
                        case axis.VERTICAL:
                            for(var x = 0; x < size; x++) $lines.eq(line.index).children().eq(x).children().addClass('blink');
                            break;
                        case axis.DIAGONAL:
                            if(line.index === 0) for(var i = 0; i < size; i++) $lines.eq(i).children().eq(i).children().addClass('blink');
                            else if(line.index === 1) for(var i = 0; i < size; i++) $lines.eq(i).children().eq(size - 1 - i).children().addClass('blink');
                            break;
                    }
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
                    $('#play-again').fadeIn(1000);
                }
            });
        }, swalDelay || 0);
    }

    $('.grid').on('click', '.cell', function() {
        socket.emit('play', {position: {x: $(this).index(), y: $(this).parent().index()}});
    });

    $('#play-again').click(function() {
        socket.emit('play-again');
    });
});
