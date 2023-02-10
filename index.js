// TODO:
// - Game start and game over message
// - Help screen/credits
// - Better input/autocomplete/english (i.e., "move north" instead of "no")
// - Complete message rendering system

const canvas_width = 7
const canvas_height = 7

function load_image_from(name, url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.addEventListener("load", () => {
            resolve({ [name]: img })
        }, false);
        img.src = url;
    })
}

function load_tilemaps() {
    return Promise.all([
        load_image_from('tileset',  'assets/Dungeon_Tileset.png'),
        load_image_from('player',   'assets/Dungeon_Character.png'),
        load_image_from('dragon',   'assets/AdultRedDragonIdleSide.png'),
        load_image_from('merchant', 'assets/GnomeWandererIdleSide.png'),
        load_image_from('goblin',   'assets/GoblinFanaticIdleSide.png'),
        load_image_from('troll',    'assets/SwampTrollIdleSide.png'),
        load_image_from('vampire',  'assets/vampire.png'),
        load_image_from('werewolf', 'assets/WerewolfStalkerIdleSide.png'),
        load_image_from('pheonix',  'assets/PoisonDrakeIdleSide.png'),
        load_image_from('arrows',   'assets/arrows.png'),
        load_image_from('armour',   'assets/armour.png')
    ])
}

function init_canvas() {
    const ctx = window.cc3kctx
    const [width, height] = ctx.getRenderDimensions()
    window.random_map = []
    for(let y = 0; y < height; y++) {
        const row = []
        for(let x = 0; x < width; x++) row.push(Math.random())
        window.random_map.push(row)
    }

    const canvas1 = document.getElementById('bg-canvas')
    canvas1.width = (1 + 2 * canvas_width) * 16
    canvas1.height = (1 + 2 * canvas_height) * 16
    const canvas2 = document.getElementById('text-canvas')
    canvas2.width = (1 + 2 * canvas_width) * 256
    canvas2.height = (1 + 2 * canvas_height) * 256
    const canvas3 = document.getElementById('animation-canvas')
    canvas3.width = (1 + 2 * canvas_width) * 16
    canvas3.height = (1 + 2 * canvas_height) * 16
}

function start_game() {
    const ctx = window.cc3kctx
    ctx.loadScene(Module.PlayerRace.HUMAN)
    ctx.render()
}

function generate_command_map() {
    window.command_map = { }
    // For move
    directions = [ 'no', 'so', 'ea', 'we', 'ne', 'se', 'nw', 'sw' ]
    direction_enum = [
        Module.InputDirection.Dir_N,
        Module.InputDirection.Dir_S,
        Module.InputDirection.Dir_E,
        Module.InputDirection.Dir_W,
        Module.InputDirection.Dir_NE,
        Module.InputDirection.Dir_SE,
        Module.InputDirection.Dir_NW,
        Module.InputDirection.Dir_SW
    ]
    action_enum = [
        Module.InputAction.Action_Move,
        Module.InputAction.Action_Attack,
        Module.InputAction.Action_Use
    ]
    for(let i = 0; i < direction_enum.length; i++) {
        window.command_map[`${directions[i]}`] = [ action_enum[0], direction_enum[i] ]
        window.command_map[`a ${directions[i]}`] = [ action_enum[1], direction_enum[i] ]
        window.command_map[`u ${directions[i]}`] = [ action_enum[2], direction_enum[i] ]
    }
    window.command_map[`r`] = [ action_enum[2], Module.InputDirection.Dir_None ]
}

function setup_animations() {
    var last_time;
    var animation_status = {
        'V': { 'frame': 0, 'num_frames': 4, 'deltaT': 0, 'frame_duration': 400 },
        'W': { 'frame': 1, 'num_frames': 4, 'deltaT': 0, 'frame_duration': 200 },
        'M': { 'frame': 2, 'num_frames': 4, 'deltaT': 0, 'frame_duration': 400 },
        'N': { 'frame': 3, 'num_frames': 4, 'deltaT': 0, 'frame_duration': 200 },
        'D': { 'frame': 0, 'num_frames': 4, 'deltaT': 0, 'frame_duration': 200 },
        'T': { 'frame': 1, 'num_frames': 4, 'deltaT': 0, 'frame_duration': 400 },
        'X': { 'frame': 2, 'num_frames': 4, 'deltaT': 0, 'frame_duration': 200 },
        'arrows': { 'frame': 0, 'num_frames': 4, 'deltaT': 0, 'frame_duration': 200 }
    }
    function step(timestamp) {
        if (last_time === undefined) last_time = timestamp
        const deltaT = timestamp - last_time
        if (deltaT > 0) {
            for(let k in animation_status) {
                if(animation_status[k]['deltaT'] >= animation_status[k]['frame_duration']) {
                    animation_status[k]['deltaT'] = 0;
                    animation_status[k]['frame'] = (animation_status[k]['frame'] + 1) % animation_status[k]['num_frames']
                } else {
                    animation_status[k]['deltaT'] += deltaT;
                }
            }
            render_animations(animation_status)
            last_time = timestamp
        }
        window.requestAnimationFrame(step)
    }
    window.requestAnimationFrame(step)
}

function setup_render_context() {
    const ctx = window.cc3kctx
    const [playerx, playery] = ctx.getRenderPlayerPos()
    const [width, height] = ctx.getRenderDimensions()
    const bg_buffer = ctx.getRenderBuffers(0)
    const fg_buffer = ctx.getRenderBuffers(1)
    const get_index = (buffer, x, y) => String.fromCharCode(buffer[x+y*width])
    const in_bounds = (x, y) => x >= 0 && x < width && y >= 0 && y < height
    const draw_tile = (canvas_ctx, tilemap, tx, ty, ox, oy, tile_size=16) => {
        if(tilemap) {
            canvas_ctx.drawImage(
                tilemap,
                tx*tile_size, ty*tile_size, tile_size, tile_size,
                ox*16, oy*16, 16, 16
            )
        }
    }
    return [ctx, playerx, playery, width, height, bg_buffer, fg_buffer,
        get_index, in_bounds, draw_tile]
}

function render_animations(animation_status) {
    const [ctx, playerx, playery, width, height, bg_buffer, fg_buffer,
        get_index, in_bounds, draw_tile] = setup_render_context()
    const canvas = document.getElementById('animation-canvas')
    const canvas_ctx = canvas.getContext('2d')
    canvas_ctx.clearRect(0, 0, canvas.width, canvas.height)
    // Draw animated entities
    for(let oy = 0; oy <= 2*canvas_height; oy++) {
        for(let ox = 0; ox <= 2*canvas_width; ox++) {
            const [x, y] = [ playerx+ox-canvas_width, playery+oy-canvas_height ]
            if(!in_bounds(x, y)) continue
            const fg_char = get_index(fg_buffer, x, y)
            const bg_char = get_index(bg_buffer, x, y)
            let tx, ty, tilemap
            if(fg_char == 'V') [tx, ty, tilemap] = [animation_status['V']['frame'], 0, window.tilemaps['vampire']]
            else if(fg_char == 'W') [tx, ty, tilemap] = [animation_status['W']['frame'], 0, window.tilemaps['werewolf']]
            else if(fg_char == 'M') [tx, ty, tilemap] = [animation_status['M']['frame'], 0, window.tilemaps['merchant']]
            else if(fg_char == 'N') [tx, ty, tilemap] = [animation_status['N']['frame'], 0, window.tilemaps['goblin']]
            else if(fg_char == 'D') [tx, ty, tilemap] = [animation_status['D']['frame'], 0, window.tilemaps['dragon']]
            else if(fg_char == 'T') [tx, ty, tilemap] = [animation_status['T']['frame'], 0, window.tilemaps['troll']]
            else if(fg_char == 'X') [tx, ty, tilemap] = [animation_status['X']['frame'], 0, window.tilemaps['pheonix']]
            draw_tile(canvas_ctx, tilemap, tx, ty, ox, oy)
            if(bg_char == '\\') {
                draw_tile(canvas_ctx, window.tilemaps['arrows'],
                    animation_status['arrows']['frame'], 0, ox, oy-1)
            }
        }
    }
}

function render_text() {
    const ctx = window.cc3kctx
    const stats = ctx.getRenderGameStats()
    const canvas = document.getElementById('text-canvas')
    const canvas_ctx = canvas.getContext('2d')

    // Draw stats
    canvas_ctx.clearRect(0, 0, canvas.width, canvas.height)
    canvas_ctx.font = '256px monogram'
    canvas_ctx.fillStyle = 'white'
    canvas_ctx.clearRect(0, 0, canvas.width, canvas.height)
    canvas_ctx.fillText(`Hp   ${stats.m_hp}`, 128, 256*1)
    canvas_ctx.fillText(`Atk  ${stats.m_atk}`, 128, 256*2)
    canvas_ctx.fillText(`Def  ${stats.m_def}`, 128, 256*3)
    canvas_ctx.fillText(`Gold ${stats.m_gold}`, 128, 256*4)

    // Draw message box box
    const rect_x = 128
    const rect_y = (2*canvas_height-1.5)*256
    const offset1 = -32
    const offset2 = 32

    // TODO: Fix this and enable multi-line messages properly
    const the_message = window.cc3kctx.getMessageLog()
    const line_1_limit = 33
    const line_2_limit = 30
    let line1 = the_message.substring(0, 33)
    let line2 = the_message.substring(33, 63)

    if(the_message) {
        canvas_ctx.beginPath();
        canvas_ctx.lineWidth = '4';
        canvas_ctx.strokeStyle = 'white'
        canvas_ctx.rect(rect_x+offset1, rect_y+offset1, (2*canvas_width)*256-2*offset1, 256*2-2*offset1);
        canvas_ctx.stroke();

        canvas_ctx.beginPath();
        canvas_ctx.lineWidth = '12';
        canvas_ctx.rect(rect_x, rect_y, (2*canvas_width)*256, 256*2);
        canvas_ctx.stroke();

        canvas_ctx.beginPath();
        canvas_ctx.rect(rect_x+offset2, rect_y+offset2, (2*canvas_width)*256-2*offset2, 256*2-2*offset2);
        canvas_ctx.fillStyle = 'black'
        canvas_ctx.fill();

        canvas_ctx.fillStyle = 'white'
        canvas_ctx.fillText(` ${line1}`, rect_x, rect_y + 1.85 * 128)
        canvas_ctx.fillText(` ${line2}`, rect_x, rect_y + 2.85 * 128 + 32)
        canvas_ctx.fillText('\u2193', rect_x + 1.9*canvas_width*256, rect_y + 1.6*256)
    }
}

function render_to_canvas() {
    const [ctx, playerx, playery, width, height, bg_buffer, fg_buffer,
        get_index, in_bounds, draw_tile] = setup_render_context()
    function surrounded_by(x, y, chars = [' ', '#']) {
        if(x == 0 || y == 0 || x == width-1 || y == height-1)
            return '00000000'
        let str = ''
        for(let oy = -1; oy <= 1; oy++)
            for(let ox = -1; ox <= 1; ox++)
                if(!(ox == 0 && oy == 0))
                    str += !chars.includes(get_index(bg_buffer, x+ox, y+oy)) ? '1' : '0'
        return str
    }
    const canvas = document.getElementById('bg-canvas')
    const canvas_ctx = canvas.getContext('2d')
    canvas_ctx.clearRect(0, 0, canvas.width, canvas.height)
    for(let oy = 0; oy <= 2*canvas_height; oy++) {
        for(let ox = 0; ox <= 2*canvas_width; ox++) {
            // Draw base color
            let [tx, ty] = [8, 7]
            draw_tile(canvas_ctx, window.tilemaps['tileset'], tx, ty, ox, oy)

            // Draw walls/floor
            const [x, y] = [ playerx+ox-canvas_width, playery+oy-canvas_height ]
            if(!in_bounds(x, y)) continue
            const fg_char = get_index(fg_buffer, x, y)
            const bg_char = get_index(bg_buffer, x, y)
            const wall_map_v = {
                // Basic cases
                '00000000': [ 8, 7 ],
                '00001010': [ 0, 0 ], // ┌─
                // default               │.
                '01101000': [ 0, 4 ], // └─
                '00010110': [ 5, 0 ], // ─┐
                '11010110': [ 5, 3 ], // .│
                '11010000': [ 5, 4 ], // ─┘
                // Corner cases
                '11111011': [ 5, 5 ], // ─┐.
                '11010111': [ 5, 1 ], // .│
                '11011111': [ 3, 0 ], // .└─
                '00010111': [ 5, 3 ], // ─┐_
                '01111111': [ 3, 0 ], // ─┘.
            }
            const wall_map_h = {
                '00000000': [ 8, 7 ],
                '11111000': [ 1, 4 ],
                '11111001': [ 1, 4 ],
            }
            const door_map = {
                '11111000': [ 6, 3 ],
                '00011111': [ 6, 6 ],
                '01101011': [ 8, 4 ],
                '11010110': [ 7, 4 ],
            }
            const rand = window.random_map[y][x]
            const s_code = surrounded_by(x, y)
            if(bg_char == '|') {
                [tx, ty] = wall_map_v[s_code] || [ 0, 1 ]
            } else if(bg_char == '-') {
                [tx, ty] = wall_map_h[s_code] || [ 1, 0 ]
            } else if(bg_char == '.') {
                [tx, ty] = [Math.floor(rand*2)+6, Math.floor(rand*3)+0]
            } else if(bg_char == '+') {
                if(Math.abs(x-playerx) + Math.abs(y-playery) <= 1) {
                    if(s_code == '11111000' || s_code == '00011111')
                        [tx, ty] = [Math.floor(rand*2)+6, Math.floor(rand*3)+0]
                } else [tx, ty] = door_map[s_code] || [ tx, ty ]
            } else if(bg_char == '#') {
                r = rand
                if(r <= 0.2) {
                    [tx, ty] = [9, 5]
                } else if(r <= 0.7) {
                    [tx, ty] = [9, 4]
                } else if(surrounded_by(x, y, ['+']) !== '11111111') {
                    [tx, ty] = [9, 5]
                }
            } else if(bg_char == '\\') {
                [tx, ty] = [9, 3]
            }
            draw_tile(canvas_ctx, window.tilemaps['tileset'], tx, ty, ox, oy)

            // Draw entities
            let tilemap = window.tilemaps['tileset']
            if(fg_char == '\x00') continue
            if(fg_char == 'G') [tx, ty] = [6, 8]
            else if(fg_char == 'P') [tx, ty] = [9, 8]
            else if(fg_char == 'C') [tx, ty] = [9, 9]
            if(fg_char == 'B')
                draw_tile(canvas_ctx, window.tilemaps['armour'], 1, 0, ox, oy, 32)
            else draw_tile(canvas_ctx, tilemap, tx, ty, ox, oy)
        }
    }
    // Draw player
    draw_tile(canvas_ctx, window.tilemaps['player'], 6, 2, canvas_width, canvas_height)
    // Render UI elements
    render_text()
}

function input_submit() {
    const textbox = document.getElementById('game-input')
    const action = window.command_map[textbox.value]
    if(action) {
        textbox.value = ''
        window.cc3kctx.update(...action)
        window.cc3kctx.render()
        render_to_canvas()
    } else {
        textbox.classList.add('input-error')
    }
}

function input_keypress() {
    const textbox = document.getElementById('game-input')
    textbox.classList.remove('input-error')
}
