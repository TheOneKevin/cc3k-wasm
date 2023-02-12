#include <string.h>
#include <sstream>
#include <emscripten/bind.h>
#include <emscripten/val.h>

#include "base/CC3kInput.h"
#include "base/CC3kScene.h"
#include "base/CC3kSceneBuilder.h"
#include "engine/SceneManager.h"
#include "engine/Renderer.h"
#include "game/BehaviourPlayer.h"
#include "game/ItemLoot.h"

using CC3k::SceneBuilder;
using CC3k::CC3kScene;
using namespace emscripten;

////////////////////////////////////////////////////////////////////////////////

const int numLevels = 5;

struct WasmGameState {
    bool m_gameFinished = false;
    bool m_playerDead = false;
    int m_finalScore = 0;
};

struct WasmGameStats {
    int m_hp = -1;
    int m_atk = -1;
    int m_def = -1;
    int m_gold = -1;
    std::string m_race;
};

class WasmContext;
class WasmInput;
class WasmRenderer;

class WasmInput final : public CC3kInput {
    friend class WasmContext;
    PlayerAction action { Action_None, Dir_None };
public:
    //! Get action stored
    [[nodiscard]] PlayerAction getAction() const override { return action; }
    //! We don't need to await any inputs
    void awaitInputSync() override { }
};

class WasmRenderer final : public Engine::Renderer {
    friend class WasmContext;

    static constexpr int width = CC3k::SceneBuilder::mapCols;
    static constexpr int height = CC3k::SceneBuilder::mapRows;
    static constexpr int arraylen = width*height;
    static constexpr bool inBounds(int x, int y) {
        return x >= 0 && x < width && y >= 0 && y < height;
    }
    char* buffer_bg;
    char* buffer_entities;
    Engine::Vec2 player_pos;
    WasmGameStats stats;

public:
    explicit WasmRenderer(Engine::SceneManager &theScene);
    void render() override;
    ~WasmRenderer();
};

class WasmContext final {
    WasmInput input;
    Engine::SceneManager sceneMan;
    WasmRenderer renderer;
    CC3k::PlayerRace playerRace;
    SceneBuilder::TileMap sceneMap;

public:
    explicit WasmContext(unsigned seed);
    void buildRandomScene();
    void buildScene(int level, int nextLevel, bool spawnCompass);
    void setSceneMap(int x, int y, char c) { sceneMap[y][x] = c; }
    void render() { renderer.render(); }
    void update(CC3kInput::Action action, CC3kInput::Direction direction);
    void switchScene(int i) { sceneMan.switchScene(i); }
    WasmGameState getGameState();
    val getRenderBuffers(int zindex);
    Engine::Vec2 getRenderDimensions();
    Engine::Vec2 getRenderPlayerPos() { return renderer.player_pos; }
    WasmGameStats getRenderGameStats() { return renderer.stats; }
    std::string getMessageLog();
    void setRace(CC3k::PlayerRace race) { playerRace = race; }
    ~WasmContext();
};

////////////////////////////////////////////////////////////////////////////////

WasmRenderer::WasmRenderer(Engine::SceneManager &sceneMan)
    : Engine::Renderer(sceneMan), player_pos{-1, -1}, stats{} {
    buffer_bg = new char[arraylen]();
    buffer_entities = new char[arraylen]();
}

WasmRenderer::~WasmRenderer() {
    delete[] buffer_bg;
    delete[] buffer_entities;
}

void WasmRenderer::render() {
    memset(buffer_bg, 0, sizeof(char)*arraylen);
    memset(buffer_entities, 0, sizeof(char)*arraylen);
    for (auto const &ip: sceneMan.getActiveScene().getGameObjects()) {
        auto *obj = ip.second.get();
        auto pos = obj->getTransform().pos;
        char asset = obj->getRenderAsset();
        if (!inBounds(pos.x, pos.y)) {
            continue;
        }
        auto *player = obj->getComponent<CC3k::BehaviourPlayer>();
        if (player != nullptr) {
            stats.m_hp = player->getHp();
            stats.m_atk = player->getAttack();
            stats.m_def = player->getDefense();
            stats.m_gold = player->getGold();
            stats.m_race = player->getRace();
            player_pos = pos;
        }
        auto *loot = obj->getComponent<CC3k::ItemLoot>();
        if(loot != nullptr) {
            if(loot->getType() == CC3k::LootType::Dragon)
                asset = '9';
            else if(loot->getType() == CC3k::LootType::Merchant)
                asset = '8';
            else if(loot->getType() == CC3k::LootType::Horde)
                asset = '7';
        }
        auto zindex = obj->getTransform().zindex;
        if(zindex == 0) {
            buffer_bg[pos.x + width*pos.y] = asset;
        } else if(zindex == 1) {
            buffer_entities[pos.x + width*pos.y] = asset;
        }
    }
}

////////////////////////////////////////////////////////////////////////////////

WasmContext::WasmContext(unsigned seed)
    : input{}, sceneMan{input, seed}, renderer{sceneMan} { }

WasmContext::~WasmContext() {
    // ...
}

void WasmContext::buildRandomScene() {
    SceneBuilder::TileMap outMap;
    std::uniform_int_distribution<> dist(1, numLevels);
    int barrierLevel = dist(sceneMan.randomEngine);
    for (int i = 1; i <= numLevels; i++) {
        sceneMan.registerScene(i, SceneBuilder::buildScene(
                {
                        .man = sceneMan,
                        .map = CC3k::DefaultMap,
                        .race = playerRace,
                        .spawnBarrierSuit = i == barrierLevel,
                        .nextLevel = i == numLevels ? -1 : i + 1,
                        .outputMap = outMap
                }));
    }
}

void WasmContext::buildScene(int level, int nextLevel, bool spawnCompass) {
    sceneMan.registerScene(level, SceneBuilder::buildScene(
            {
                    .man = sceneMan,
                    .map = sceneMap,
                    .race = playerRace,
                    .nextLevel = nextLevel,
                    .spawnCompass = spawnCompass
            }));
    for(int y = 0; y < WasmRenderer::height; y++)
        sceneMap[y].fill(0);
}

void WasmContext::update(CC3kInput::Action action, CC3kInput::Direction dir) {
    input.action.action = action;
    input.action.dir = dir;
    sceneMan.getActiveScene().update();
}

WasmGameState WasmContext::getGameState() {
    const auto& state = sceneMan.getActiveScene<CC3kScene>().getState();
    return WasmGameState {
        .m_gameFinished = state.m_gameFinished,
        .m_playerDead = state.m_playerDead,
        .m_finalScore = state.m_finalScore
    };
}

val WasmContext::getRenderBuffers(int zindex) {
    if(zindex == 0)
        return val(typed_memory_view(WasmRenderer::arraylen, renderer.buffer_bg));
    else
        return val(typed_memory_view(WasmRenderer::arraylen, renderer.buffer_entities));
}

Engine::Vec2 WasmContext::getRenderDimensions() {
    return Engine::Vec2{ WasmRenderer::width, WasmRenderer::height };
}

std::string WasmContext::getMessageLog() {
    std::ostringstream ssMsgLog;
    for (auto &str: dynamic_cast<CC3kScene &>(sceneMan.getActiveScene()).getMessageLog())
        ssMsgLog << str << ". ";
    return ssMsgLog.str();
}
////////////////////////////////////////////////////////////////////////////////

EMSCRIPTEN_BINDINGS(cc3k_bindings) {
    enum_<CC3kInput::Action>("InputAction")
        .value("Action_None",       CC3kInput::Action_None)
        .value("Action_Move",       CC3kInput::Action_Move)
        .value("Action_Use",        CC3kInput::Action_Use)
        .value("Action_Attack",     CC3kInput::Action_Attack)
        .value("Action_Restart",    CC3kInput::Action_Restart)
        .value("Action_Quit",       CC3kInput::Action_Quit)
        ;
    
    enum_<CC3kInput::Direction>("InputDirection")
        .value("Dir_None",  CC3kInput::Dir_None)
        .value("Dir_N",     CC3kInput::Dir_N)
        .value("Dir_S",     CC3kInput::Dir_S)
        .value("Dir_E",     CC3kInput::Dir_E)
        .value("Dir_W",     CC3kInput::Dir_W)
        .value("Dir_NE",    CC3kInput::Dir_NE)
        .value("Dir_NW",    CC3kInput::Dir_NW)
        .value("Dir_SE",    CC3kInput::Dir_SE)
        .value("Dir_SW",    CC3kInput::Dir_SW)
        ;
    
    enum_<CC3k::PlayerRace>("PlayerRace")
        .value("HUMAN", CC3k::PlayerRace::HUMAN)
        .value("DWARF", CC3k::PlayerRace::DWARF)
        .value("ORC",   CC3k::PlayerRace::ORC)
        .value("ELF",   CC3k::PlayerRace::ELF)
        ;
    
    value_array<Engine::Vec2>("Vec2")
        .element(&Engine::Vec2::x)
        .element(&Engine::Vec2::y)
        ;

    value_object<WasmGameState>("WasmGameState")
        .field("m_gameFinished", &WasmGameState::m_gameFinished)
        .field("m_playerDead", &WasmGameState::m_playerDead)
        .field("m_finalScore", &WasmGameState::m_finalScore)
        ;
    
    value_object<WasmGameStats>("WasmGameStats")
        .field("m_hp", &WasmGameStats::m_hp)
        .field("m_atk", &WasmGameStats::m_atk)
        .field("m_def", &WasmGameStats::m_def)
        .field("m_gold", &WasmGameStats::m_gold)
        .field("m_race", &WasmGameStats::m_race)
        ;
    
    class_<WasmContext>("WasmContext")
        .constructor<unsigned>()
        .function("buildRandomScene", &WasmContext::buildRandomScene)
        .function("buildScene", &WasmContext::buildScene)
        .function("render", &WasmContext::render)
        .function("update", &WasmContext::update)
        .function("switchScene", &WasmContext::switchScene)
        .function("getGameState", &WasmContext::getGameState)
        .function("getRenderBuffers", &WasmContext::getRenderBuffers)
        .function("getRenderDimensions", &WasmContext::getRenderDimensions)
        .function("getRenderPlayerPos", &WasmContext::getRenderPlayerPos)
        .function("getRenderGameStats", &WasmContext::getRenderGameStats)
        .function("getMessageLog", &WasmContext::getMessageLog)
        .function("setRace", &WasmContext::setRace)
        .function("setSceneMap", &WasmContext::setSceneMap)
        ;
}
