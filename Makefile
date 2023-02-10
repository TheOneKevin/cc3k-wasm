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

OPTIONS = \
	-lembind \
	-Os \
	--closure 1 \
	-flto \
	-Icc3k/src \
	-std=c++14 \
	-Wno-unqualified-std-cast-call

cc3k.js cc3k.wasm: ${SOURCES}
	emcc ${OPTIONS} ${SOURCES} -o cc3k.js

itchio.zip: cc3k.js cc3k.wasm
	rm -rf itchio
	mkdir -p itchio/assets
	cp assets/*.png assets/*.ttf itchio/assets
	cp cc3k.js cc3k.wasm index.html index.js style.css style-itchio.css itchio/
	sed -i 's/<!--<link rel="stylesheet" href="style-itchio.css">-->/<link rel="stylesheet" href="style-itchio.css">/g' itchio/index.html
	cd itchio && zip -9 -r ../itchio.zip *

.PHONY: clean
clean:
	rm cc3k.wasm cc3k.js itchio.zip
	rm -rf itchio

.PHONY: all
all: itchio.zip cc3k.js cc3k.wasm
