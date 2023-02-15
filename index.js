// TODO:
// - Help screen/credits
// - Better input/autocomplete/english (i.e., "move north" instead of "no")

const canvas_width = 7
const canvas_height = 7

window.cc3kdata = {
    cc3kctx: undefined,
    random_map: [],
    command_map: {},
    tilemaps: [],
    ui_click_regions: [],
    ui_state: {
        msgbox_up_visible: false,
        msgbox_down_visible: false,
        msgbox_index: 0,
        msgbox_lines: [],
        scene_state: undefined // INTRO, MAIN, DIED, WIN
    },
    race_map: { },
    wasm_promise: new Promise(load_resources)
}

////////////////////////////////////////////////////////////////////////////////
//                   H E L P E R    F U N C T I O N S                         //
////////////////////////////////////////////////////////////////////////////////

function globals() {
    return window.cc3kdata
}

function load_image_from(name, url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.addEventListener("load", () => {
            resolve({ [name]: img })
        }, false);
        img.src = url;
    })
}

function wrap(text) {
    const line_limit = 33

    /** @type{str[]} */
    const words = text.split(' ')
    const lines = []
    var current_line = []
    // Start with -1 because first word has no space
    var line_length = -1
    const add_word_to_line = (/** @type{str} */ word) => {
        // +1 because we prepend a space before each word
        const next_line_length = line_length + word.length + 1
        // Check if adding this word will overflow
        if(next_line_length > line_limit) {
            lines.push(current_line)
            current_line = []
            line_length = -1
            // If we're working on the top line of the next page,
            // pop until the bottom line of the previous page < 30 chars
            // so we can insert an ellipses (...) on that line.
            if(lines.length % 2 == 0 && lines.length > 1) {
                const last_Line = lines[lines.length-1]
                while(true) {
                    if(last_Line[last_Line.length-1][0] <= line_limit - 3)
                        break
                    add_word_to_line(last_Line.pop()[1])
                }
                const last_length = last_Line[last_Line.length-1][0]
                last_Line.push([ last_length+2, '…' ])
            }
            // Add the current word to this new line
            line_length += word.length + 1
        } else {
            line_length = next_line_length
        }
        current_line.push([ line_length, word ])
    }
    for(const word of words) add_word_to_line(word)
    if(current_line.length > 0) lines.push(current_line)
    let final_string = []
    for(const line of lines) final_string.push(line.map(x => x[1]).join(' '))
    return final_string
}

function get_render_context() {
    const ctx = globals().cc3kctx
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

function copySceneData(src, dst) {
    src.copyWithin(dst, 0);
}

////////////////////////////////////////////////////////////////////////////////
//                   S C E N E    M A N A G E M E N T                         //
////////////////////////////////////////////////////////////////////////////////

async function load_resources(resolve, reject) {
    // Load assets
    const tilemaps = await Promise.all([
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
        load_image_from('armour',   'assets/armour.png'),
        load_image_from('loot',     'assets/Treasure+.png'),
        load_image_from('loot_anim','assets/Shine_Sheet.png'),
    ])
    window.cc3kdata.tilemaps = Object.assign({}, ...tilemaps)

    // Setup canvas dimensions
    const set_resolution = (id, resx, resy) => {
        const canvas = document.getElementById(id)
        canvas.width = (1 + 2 * canvas_width) * resx
        canvas.height = (1 + 2 * canvas_height) * resy
    }
    set_resolution('bg-canvas', 16, 16)
    set_resolution('animation-canvas', 16, 16)
    set_resolution('ui-canvas', 256, 256)
    set_resolution('ui-overlay', 2, 2)

    // Register UI click regions
    globals().ui_click_regions.push([ 27, 27, 28, 28, ui_msgbox_down_click ])
    globals().ui_click_regions.push([ 27, 25, 28, 26, ui_msgbox_up_click ])

    // Done loading everything
    resolve()
}

function setup_animations() {
    var last_time;
    var animation_status = {
        // Monster idle animation
        'V': { 'frame': 0, 'num_frames': 4, 'deltaT': 0, 'frame_duration': 400 },
        'W': { 'frame': 1, 'num_frames': 4, 'deltaT': 0, 'frame_duration': 200 },
        'M': { 'frame': 2, 'num_frames': 4, 'deltaT': 0, 'frame_duration': 400 },
        'N': { 'frame': 3, 'num_frames': 4, 'deltaT': 0, 'frame_duration': 200 },
        'D': { 'frame': 0, 'num_frames': 4, 'deltaT': 0, 'frame_duration': 200 },
        'T': { 'frame': 1, 'num_frames': 4, 'deltaT': 0, 'frame_duration': 400 },
        'X': { 'frame': 2, 'num_frames': 4, 'deltaT': 0, 'frame_duration': 200 },
        // Loot shine animation
        'G': { 'frame': 3, 'num_frames': 9, 'deltaT': 0, 'frame_duration': 100 },
        '7': { 'frame': 9, 'num_frames': 9, 'deltaT': 0, 'frame_duration': 100 },
        '8': { 'frame': 7, 'num_frames': 9, 'deltaT': 0, 'frame_duration': 100 },
        '9': { 'frame': 2, 'num_frames': 9, 'deltaT': 0, 'frame_duration': 100 },
        'C': { 'frame': 4, 'num_frames': 9, 'deltaT': 0, 'frame_duration': 100 },
        'P': { 'frame': 0, 'num_frames': 9, 'deltaT': 0, 'frame_duration': 100 },
        'B': { 'frame': 0, 'num_frames': 15, 'deltaT': 0, 'frame_duration': 100 },
        // Staircase arrow animation
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

async function setup_everything() {
    // Wait for resources to load
    await globals().wasm_promise

    // Generate command map
    const command_map = globals().command_map
    const directions = [ 'no', 'so', 'ea', 'we', 'ne', 'se', 'nw', 'sw' ]
    const direction_enum = [
        Module.InputDirection.Dir_N,
        Module.InputDirection.Dir_S,
        Module.InputDirection.Dir_E,
        Module.InputDirection.Dir_W,
        Module.InputDirection.Dir_NE,
        Module.InputDirection.Dir_SE,
        Module.InputDirection.Dir_NW,
        Module.InputDirection.Dir_SW
    ]
    const action_enum = [
        Module.InputAction.Action_Move,
        Module.InputAction.Action_Attack,
        Module.InputAction.Action_Use,
        Module.InputAction.Action_Restart
    ]
    for(let i = 0; i < direction_enum.length; i++) {
        command_map[`${directions[i]}`] = [ action_enum[0], direction_enum[i] ]
        command_map[`a ${directions[i]}`] = [ action_enum[1], direction_enum[i] ]
        command_map[`u ${directions[i]}`] = [ action_enum[2], direction_enum[i] ]
    }
    command_map[`r`] = [ action_enum[3], Module.InputDirection.Dir_None ]

    // Setup race map
    globals().race_map['h'] = Module.PlayerRace.HUMAN
    globals().race_map['d'] = Module.PlayerRace.DWARF
    globals().race_map['o'] = Module.PlayerRace.ORC
    globals().race_map['e'] = Module.PlayerRace.ELF

    // Render
    switch_scene('INTRO')
    setup_animations()
    render()
}

function switch_scene(scene) {
    globals().ui_state.scene_state = scene
    if(scene == 'INTRO') {
        // Init WASM context
        window.cc3kdata.cc3kctx = new Module.WasmContext(0)

        // Setup random numbers
        const [width, height] = globals().cc3kctx.getRenderDimensions()
        window.cc3kdata.random_map = []
        for(let y = 0; y < height; y++) {
            const row = []
            for(let x = 0; x < width; x++) row.push(Math.random())
            globals().random_map.push(row)
        }
    } else if(scene == 'MAIN') {
        const ctx = globals().cc3kctx
        // Start the main game
        // const map = [
        //     '                      ',
        //     ' |------------------| ',
        //     ' |.....D9....1......| ',
        //     ' |.@.............C.\\| ',
        //     ' |..6.M...7..DB.....| ',
        //     ' |------------------| ',
        //     '                      ',
        // ]
        // console.log(width*height)
        // for(let y = 0; y < map.length; y++) {
        //     for(let x = 0; x < map[y].length; x++) {
        //         ctx.setSceneMap(x, y, map[y].charCodeAt(x))
        //     }
        // }
        // ctx.buildScene(1, -1, false)
        ctx.buildRandomScene()
        ctx.switchScene(1)
        ctx.render()
    }
    for(let canvas_id of ['ui-canvas','bg-canvas','animation-canvas','ui-overlay']) {
        const canvas = document.getElementById(canvas_id)
        const canvas_ctx = canvas.getContext('2d')
        canvas_ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
}

////////////////////////////////////////////////////////////////////////////////
//                          R E N D E R I N G                                 //
////////////////////////////////////////////////////////////////////////////////

function render_animations(animation_status) {
    if(globals().ui_state.scene_state != 'MAIN') return
    const [ctx, playerx, playery, width, height, bg_buffer, fg_buffer,
        get_index, in_bounds, draw_tile] = get_render_context()
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
            if(fg_char == 'V') [tx, ty, tilemap] = [animation_status['V']['frame'], 0, globals().tilemaps['vampire']]
            else if(fg_char == 'W') [tx, ty, tilemap] = [animation_status['W']['frame'], 0, globals().tilemaps['werewolf']]
            else if(fg_char == 'M') [tx, ty, tilemap] = [animation_status['M']['frame'], 0, globals().tilemaps['merchant']]
            else if(fg_char == 'N') [tx, ty, tilemap] = [animation_status['N']['frame'], 0, globals().tilemaps['goblin']]
            else if(fg_char == 'D') [tx, ty, tilemap] = [animation_status['D']['frame'], 0, globals().tilemaps['dragon']]
            else if(fg_char == 'T') [tx, ty, tilemap] = [animation_status['T']['frame'], 0, globals().tilemaps['troll']]
            else if(fg_char == 'X') [tx, ty, tilemap] = [animation_status['X']['frame'], 0, globals().tilemaps['pheonix']]
            else if(fg_char == 'G') [tx, ty, tilemap] = [animation_status['G']['frame'], 10, globals().tilemaps['loot_anim']]
            else if(fg_char == '7') [tx, ty, tilemap] = [animation_status['7']['frame'], 6, globals().tilemaps['loot_anim']]
            else if(fg_char == '8') [tx, ty, tilemap] = [animation_status['8']['frame'], 3, globals().tilemaps['loot_anim']]
            else if(fg_char == '9') [tx, ty, tilemap] = [animation_status['9']['frame'], 9, globals().tilemaps['loot_anim']]
            else if(fg_char == 'C') [tx, ty, tilemap] = [animation_status['C']['frame'], 7, globals().tilemaps['loot_anim']]
            else if(fg_char == 'P') [tx, ty, tilemap] = [animation_status['P']['frame'], 1, globals().tilemaps['loot_anim']]
            else if(fg_char == 'B') [tx, ty, tilemap] = [animation_status['B']['frame'], 11, globals().tilemaps['loot_anim']]
            draw_tile(canvas_ctx, tilemap, tx, ty, ox, oy)
            if(bg_char == '\\') {
                draw_tile(canvas_ctx, globals().tilemaps['arrows'],
                    animation_status['arrows']['frame'], 0, ox, oy-1)
            }
        }
    }
}

function render_text() {
    if(globals().ui_state.scene_state != 'MAIN') return
    const ctx = globals().cc3kctx
    const stats = ctx.getRenderGameStats()
    const canvas = document.getElementById('ui-canvas')
    const canvas_ctx = canvas.getContext('2d')

    // Draw stats
    canvas_ctx.clearRect(0, 0, canvas.width, canvas.height)
    canvas_ctx.font = '256px monogram'
    canvas_ctx.fillStyle = 'white'
    canvas_ctx.clearRect(0, 0, canvas.width, canvas.height)
    canvas_ctx.fillText(`Race ${stats.m_race}`, 128, 256*1)
    canvas_ctx.fillText(`Hp   ${stats.m_hp}`,   128, 256*2)
    canvas_ctx.fillText(`Atk  ${stats.m_atk}`,  128, 256*3)
    canvas_ctx.fillText(`Def  ${stats.m_def}`,  128, 256*4)
    canvas_ctx.fillText(`Gold ${stats.m_gold}`, 128, 256*5)

    // Setup msgbox state
    const lines = wrap(globals().cc3kctx.getMessageLog() || '').filter(x => x)
    globals().ui_state.msgbox_up_visible = false
    globals().ui_state.msgbox_down_visible = lines.length > 2
    globals().ui_state.msgbox_index = 0
    globals().ui_state.msgbox_lines = lines
    render_msgbox()
}

function render_msgbox() {
    if(globals().ui_state.scene_state != 'MAIN') return
    const ctx = globals().cc3kctx
    const canvas = document.getElementById('ui-canvas')
    const canvas_ctx = canvas.getContext('2d')
    // Draw message box box
    const rect_x = 128
    const rect_y = (2*canvas_height-1.5)*256
    const offset1 = -32
    const offset2 = 32
    const ui_state = globals().ui_state
    if(ui_state.msgbox_lines.length > 0) {
        const line1 = ui_state.msgbox_lines[2*ui_state.msgbox_index] || ''
        const line2 = ui_state.msgbox_lines[2*ui_state.msgbox_index+1] || ''
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
        canvas_ctx.font = '256px monogram'
        canvas_ctx.fillText(` ${line1}`, rect_x, rect_y + 1.85 * 128)
        canvas_ctx.fillText(` ${line2}`, rect_x, rect_y + 2.85 * 128 + 32)
        // canvas_ctx.fillText(` 012345678901234567890123456789012`, rect_x, rect_y + 1.85 * 128)
        // canvas_ctx.fillText(` 012345678901234567890123456789012`, rect_x, rect_y + 2.85 * 128 + 32)
        if(ui_state.msgbox_up_visible)
        canvas_ctx.fillText('\u2191', rect_x + 1.9*canvas_width*256, rect_y + 0.7*256)
        if(ui_state.msgbox_down_visible)
        canvas_ctx.fillText('\u2193', rect_x + 1.9*canvas_width*256, rect_y + 1.6*256)
    }
}

function render_scene_main() {
    if(globals().ui_state.scene_state != 'MAIN') return
    const [ctx, playerx, playery, width, height, bg_buffer, fg_buffer,
        get_index, in_bounds, draw_tile] = get_render_context()
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
    // const player_in_tunnel = get_index(bg_buffer, playerx, playery) === '#'
    canvas_ctx.clearRect(0, 0, canvas.width, canvas.height)
    for(let oy = 0; oy <= 2*canvas_height; oy++) {
        for(let ox = 0; ox <= 2*canvas_width; ox++) {
            // Draw base color
            let [tx, ty] = [8, 7]
            draw_tile(canvas_ctx, globals().tilemaps['tileset'], tx, ty, ox, oy)

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
            const rand = globals().random_map[y][x]
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
            draw_tile(canvas_ctx, globals().tilemaps['tileset'], tx, ty, ox, oy)

            // Draw entities
            let tilemap
            let size = 16
            if(fg_char == '\x00') continue
            if(fg_char == 'G')      [tx, ty, tilemap] = [Math.floor(4*rand+1), 0, globals().tilemaps['loot']]
            else if(fg_char == '7') [tx, ty, tilemap] = [Math.floor(4*rand+6), 0, globals().tilemaps['loot']]
            else if(fg_char == '8') [tx, ty, tilemap] = [7, 8, globals().tilemaps['loot']]
            else if(fg_char == '9') [tx, ty, tilemap] = [2, 9, globals().tilemaps['loot']]
            else if(fg_char == 'P') [tx, ty, tilemap] = [8, 9, globals().tilemaps['tileset']]
            else if(fg_char == 'C') [tx, ty, tilemap] = [9, 9, globals().tilemaps['tileset']]
            else if(fg_char == 'C') [tx, ty, tilemap] = [9, 9, globals().tilemaps['tileset']]
            else if(fg_char == 'B') [tx, ty, tilemap, size] = [1, 0, globals().tilemaps['armour'], 32]
            draw_tile(canvas_ctx, tilemap, tx, ty, ox, oy, size)
        }
    }
    // Draw player
    draw_tile(canvas_ctx, globals().tilemaps['player'], 6, 2, canvas_width, canvas_height)
    // Render UI elements
    render_text()
}

function render_scene_intro() {
    if(globals().ui_state.scene_state != 'INTRO') return
    const canvas = document.getElementById('ui-canvas')
    const canvas_ctx = canvas.getContext('2d')
    canvas_ctx.clearRect(0, 0, canvas.width, canvas.height)
    canvas_ctx.font = '256px monogram'
    canvas_ctx.fillStyle = 'white'
    canvas_ctx.clearRect(0, 0, canvas.width, canvas.height)
    canvas_ctx.fillText(`ChamberCrawler 3000+`, 256*(3.6), 256*(1.5))
    canvas_ctx.fillText(`Select a race:`, 256*(1.50), 256*(canvas_height-1))
    canvas_ctx.fillText(`h - Human`,      256*(1.50), 256*(canvas_height-1+1))
    canvas_ctx.fillText(`d - Dwarf`,      256*(1.50), 256*(canvas_height-1+1.7))
    canvas_ctx.fillText(`o - Orc  `,      256*(1.50), 256*(canvas_height-1+2.3))
    canvas_ctx.fillText(`e - Elf  `,      256*(1.50), 256*(canvas_height-1+3))
    canvas_ctx.fillText(`(c) 2023 Kevin Dai`, 256*(3.8), 256*(canvas_height*2))
}

function render_scene_died() {
    if(globals().ui_state.scene_state != 'DIED') return
    const ctx = globals().cc3kctx
    const canvas = document.getElementById('ui-canvas')
    const canvas_ctx = canvas.getContext('2d')
    canvas_ctx.clearRect(0, 0, canvas.width, canvas.height)
    canvas_ctx.font = '256px monogram'
    canvas_ctx.fillStyle = 'white'
    canvas_ctx.clearRect(0, 0, canvas.width, canvas.height)
    canvas_ctx.fillText(`You died.`, 256*(1.50), 256*canvas_height)
    canvas_ctx.fillText(`Score: ${ctx?.getGameState().m_finalScore || 0}`,  256*(1.50), 256*(canvas_height+1))
    canvas_ctx.fillText(`Type [r] to restart.`,  256*(1.50), 256*(canvas_height+2))
}

function render_scene_win() {
    if(globals().ui_state.scene_state != 'WIN') return
    const ctx = globals().cc3kctx
    const canvas = document.getElementById('ui-canvas')
    const canvas_ctx = canvas.getContext('2d')
    canvas_ctx.clearRect(0, 0, canvas.width, canvas.height)
    canvas_ctx.font = '256px monogram'
    canvas_ctx.fillStyle = 'white'
    canvas_ctx.clearRect(0, 0, canvas.width, canvas.height)
    canvas_ctx.fillText(`End of game! ^w^`, 256*(1.50), 256*canvas_height)
    canvas_ctx.fillText(`Score: 100`,  256*(1.50), 256*(canvas_height+1))
    canvas_ctx.fillText(`Type [r] to restart.`,  256*(1.50), 256*(canvas_height+2))
}

const render = () => { for(const f of [
    render_scene_main,
    render_scene_intro,
    render_scene_died,
    render_scene_win
]) f() }

////////////////////////////////////////////////////////////////////////////////
//                          U I    E V E N T S                                //
////////////////////////////////////////////////////////////////////////////////

function input_submit() {
    const textbox = document.getElementById('game-input')
    const action = globals().command_map[textbox.value.toLowerCase()]
    const race = globals().race_map[textbox.value.toLowerCase()]
    const isIntro = globals().ui_state.scene_state == 'INTRO';
    const ctx = globals().cc3kctx;
    if(isIntro && race) {
        textbox.value = ''
        ctx.setRace(race)
        switch_scene('MAIN')
        render()
    } else if(!isIntro && action) {
        textbox.value = ''
        if(action[0] == Module.InputAction.Action_Restart) {
            switch_scene('INTRO')
        } else {
            ctx.update(...action)
            ctx.render()
            if(ctx.getGameState().m_playerDead)
                switch_scene('DIED')
            else if(ctx.getGameState().m_gameFinished)
                switch_scene('WIN')
        }
        render()
    } else {
        textbox.classList.add('input-error')
    }
}

function input_keypress() {
    const textbox = document.getElementById('game-input')
    textbox.classList.remove('input-error')
}

function ui_msgbox_down_click() {
    if(!globals().ui_state.msgbox_down_visible)
        return
    const next_index = globals().ui_state.msgbox_index+1
    if(next_index < globals().ui_state.msgbox_lines.length/2)
        globals().ui_state.msgbox_index = next_index
    if(next_index+1 >= globals().ui_state.msgbox_lines.length/2) {
        globals().ui_state.msgbox_down_visible = false
        globals().ui_state.msgbox_up_visible = true
    }
    render_msgbox()
}

function ui_msgbox_up_click() {
    if(!globals().ui_state.msgbox_up_visible)
        return
    const next_index = globals().ui_state.msgbox_index-1
    if(next_index >= 0)
        globals().ui_state.msgbox_index = next_index
    if(next_index-1 <= 0) {
        globals().ui_state.msgbox_down_visible = true
        globals().ui_state.msgbox_up_visible = false
    }
    render_msgbox()
}

function render_ui_overlay() {
    const str2col = function(str) {
        var hash = 0;
        for (var i = 0; i < str.length; i++)
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        var colour = '#';
        for (var i = 0; i < 3; i++) {
            var value = (hash >> (i * 8)) & 0xFF;
            colour += ('00' + value.toString(16)).slice(-2);
        }
        return colour;
    }
    const canvas = document.getElementById('ui-overlay')
    const canvas_ctx = canvas.getContext('2d')
    for(const x of globals().ui_click_regions) {
        canvas_ctx.beginPath();
        canvas_ctx.fillStyle = str2col(String(x[4]))
        canvas_ctx.rect(x[0], x[1], x[2]-x[0]+1, x[3]-x[1]+1)
        canvas_ctx.fill();
    }
}

function ui_click(event) {
    const height = (2*canvas_width+1) * 2
    const width = (2*canvas_height+1) * 2
    const canvas = document.getElementById('ui-overlay')
    const rect = canvas.getBoundingClientRect()
    const x = Math.floor((event.clientX - rect.left) / rect.width * width)
    const y = Math.floor((event.clientY - rect.top) / rect.height * height)
    globals().ui_click_regions.filter(bb => bb[0] <= x && x <= bb[2] && bb[1] <= y && y <= bb[3]).map(bb => bb[4]())
}
