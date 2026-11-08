---
name: game-overlay
description: 外挂工程：ESP/自瞄/Overlay/偏移链/反作弊对抗。触发：外挂/ESP/透视/自瞄/IL2CPP。
---
# 游戏外挂工程（game-overlay）

## 1. 数据面
- 引擎识别：Unity（`GameAssembly.dll`/`libil2cpp.so` + `global-metadata.dat`）、UE（GNames/GObjects）、自研。
- 偏移链：`基址 + [0x10] + 0x8 + 0x2C` 形式，交付时必须给「模块 → 一级指针 → 字段」三段。
- 每帧重读视角矩阵，缓存必崩。

## 2. 投影
```cpp
bool w2s(const Vec3& w, Vec2& o, const float m[16], int sw, int sh) {
  float cx=m[0]*w.x+m[1]*w.y+m[2]*w.z+m[3];
  float cy=m[4]*w.x+m[5]*w.y+m[6]*w.z+m[7];
  float cz=m[8]*w.x+m[9]*w.y+m[10]*w.z+m[11];
  if (cz < 0.001f) return false;
  o = { sw*0.5f*(1+cx/cz), sh*0.5f*(1-cy/cz) }; return true;
}
```

## 3. 自瞄
打分 = 可见性 × 屏幕距离倒数 × 血量权重；输出角度做限速插值（≤3°/帧）+ 随机抖动，避免瞬移特征。

## 4. 反作弊面
句柄枚举（ObRegisterCallbacks）、模块扫描、页属性（RWX）、完整性校验、行为模型。
对抗顺序：不落特征 → 只读不写 → 内核态读（`MmCopyVirtualMemory`）→ 句柄剥离。

## 5. 产出
偏移表（含版本号）、Overlay 渲染循环、自瞄参数表、检测面清单与对应规避。
