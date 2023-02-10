SOURCES = \
	wasm_lib.cc \
    cc3k/src/CC3kCompilerFlags.cc \
    cc3k/src/engine/GameObject.cc \
    cc3k/src/engine/Scene.cc \
    cc3k/src/engine/IdAble.cc \
    cc3k/src/engine/SceneManager.cc \
    cc3k/src/engine/Renderer.cc \
    cc3k/src/engine/Vec2.cc \
    cc3k/src/base/CC3kScene.cc \
    cc3k/src/base/CC3kInput.cc \
    cc3k/src/base/ComponentCollider.cc \
    cc3k/src/base/CC3kSceneBuilder.cc \
    cc3k/src/base/CC3kDefaultSceneData.cc \
    cc3k/src/game/BehaviourPlayer.cc \
    cc3k/src/game/BehaviourNpc.cc \
    cc3k/src/game/BehaviourAttackable.cc \
    cc3k/src/game/ItemLoot.cc \
    cc3k/src/game/NpcDragon.cc \
    cc3k/src/game/NpcMerchant.cc \
    cc3k/src/game/ItemPotion.cc \
    cc3k/src/game/BehaviourItem.cc \
    cc3k/src/game/BehaviourStairs.cc \
    cc3k/src/game/PcHuman.cc \
    cc3k/src/game/PcElf.cc \
    cc3k/src/game/PcOrc.cc \
    cc3k/src/game/PcDwarf.cc

.PHONY: all
all:
	emcc -lembind -Icc3k/src -std=c++14 -Wno-unqualified-std-cast-call ${SOURCES} -o cc3k.js

.PHONY: clean
clean:
	rm cc3k.wasm cc3k.js
